package core

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"madoc/internal/db"
)

func importFixture() ContentImport {
	root, folder, markdown, board := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	scene := `{"elements":[{"id":"shape"}],"appState":{},"files":{"image":{"dataURL":"data:image/png;base64,AQ=="}}}`
	return ContentImport{
		ID: uuid.NewString(),
		// Deliberately child-first: input order does not have to be topological.
		Items: []ImportItem{
			{ID: markdown, ParentID: &folder, Type: "markdown", Title: "Notes", Markdown: &InitialMarkdown{Snapshot: []byte{1, 2, 3}, Markdown: "![image](/api/assets/example)"}},
			{ID: board, ParentID: &root, Type: "whiteboard", Title: "Board", Whiteboard: &scene},
			{ID: root, Type: "folder", Title: "Imported"},
			{ID: folder, ParentID: &root, Type: "folder", Title: "Nested"},
		},
		Assets: []ImportAsset{{ID: uuid.NewString(), ItemID: markdown, FileName: "picture.png", MIME: "image/png", Size: 3, SHA256: strings.Repeat("a", 64)}},
	}
}

func importCounts(t *testing.T, f *fixture) []int {
	t.Helper()
	result := []int{}
	for _, table := range []string{"items", "markdown_states", "whiteboard_states", "assets", "content_imports"} {
		var count int
		if err := f.db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		result = append(result, count)
	}
	return result
}

func assertImportCounts(t *testing.T, f *fixture, want []int) {
	t.Helper()
	got := importCounts(t, f)
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("counts: got %v want %v", got, want)
	}
}

func TestImportContentTreeStatesAndDurableReplay(t *testing.T) {
	f := newFixture(t)
	target := trashItem(t, f, "folder", "Destination", nil)
	plan := importFixture()
	plan.ParentID = &target.ID
	result, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan)
	if err != nil || result.RootID != plan.Items[2].ID || result.Replayed || result.ItemCount != 4 || result.AttachmentCount != 1 {
		t.Fatalf("result: %+v %v", result, err)
	}
	assertImportCounts(t, f, []int{5, 1, 1, 1, 1})
	root, err := f.core.GetItem(f.ctx, result.RootID)
	if err != nil || root.ParentID == nil || *root.ParentID != target.ID {
		t.Fatalf("root: %+v %v", root, err)
	}
	markdown, err := f.core.Markdown(f.ctx, f.owner.ID, plan.Items[0].ID)
	if err != nil || !bytes.Equal(markdown.Snapshot, plan.Items[0].Markdown.Snapshot) || markdown.Markdown != plan.Items[0].Markdown.Markdown || markdown.HeadSeq != 0 || markdown.Generation != 0 {
		t.Fatalf("markdown: %+v %v", markdown, err)
	}
	board, err := f.core.Whiteboard(f.ctx, f.owner.ID, plan.Items[1].ID)
	if err != nil || board.Scene != *plan.Items[1].Whiteboard || board.Revision != 0 {
		t.Fatalf("board: %+v %v", board, err)
	}
	first, _ := f.core.GetItem(f.ctx, plan.Items[1].ID)
	second, _ := f.core.GetItem(f.ctx, plan.Items[3].ID)
	if first.SortKey != 0 || second.SortKey != 1 {
		t.Fatalf("sibling order: %d %d", first.SortKey, second.SortKey)
	}
	var key, hash, itemID string
	if err := f.db.QueryRow(`SELECT storage_key,sha256,item_id FROM assets WHERE id=?`, plan.Assets[0].ID).Scan(&key, &hash, &itemID); err != nil {
		t.Fatal(err)
	}
	if key != f.space.ID+"/"+plan.Assets[0].ID || hash != plan.Assets[0].SHA256 || itemID != plan.Items[0].ID {
		t.Fatal("wrong asset mapping")
	}
	// A new connection/service uses the persisted receipt; no in-memory cache.
	var seq int
	var name, path string
	if err := f.db.QueryRow(`PRAGMA database_list`).Scan(&seq, &name, &path); err != nil {
		t.Fatal(err)
	}
	conn, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	replay, err := New(conn).ImportContent(f.ctx, f.owner.ID, f.space.ID, plan)
	if err != nil || !replay.Replayed || replay.RootID != result.RootID {
		t.Fatalf("replay: %+v %v", replay, err)
	}
	assertImportCounts(t, f, []int{5, 1, 1, 1, 1})
}

func TestImportContentRollsBackEveryWriteStageAndCanRetry(t *testing.T) {
	for _, table := range []string{"items", "markdown_states", "whiteboard_states", "assets", "content_imports"} {
		t.Run(table, func(t *testing.T) {
			f := newFixture(t)
			plan := importFixture()
			existing := trashItem(t, f, "markdown", "Existing", nil)
			before := importCounts(t, f)
			if _, err := f.db.Exec(`CREATE TRIGGER fail_import BEFORE INSERT ON ` + table + ` BEGIN SELECT RAISE(ABORT,'injected failure'); END`); err != nil {
				t.Fatal(err)
			}
			if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan); err == nil {
				t.Fatal("expected injected failure")
			}
			assertImportCounts(t, f, before)
			kept, err := f.core.GetItem(f.ctx, existing.ID)
			if err != nil || kept.Title != "Existing" {
				t.Fatal("existing item changed")
			}
			if _, err := f.db.Exec(`DROP TRIGGER fail_import`); err != nil {
				t.Fatal(err)
			}
			result, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan)
			if err != nil || result.Replayed {
				t.Fatalf("retry: %+v %v", result, err)
			}
			assertImportCounts(t, f, []int{5, 2, 1, 1, 1})
		})
	}
}

func TestImportContentRejectsInvalidPlansWithoutPartialWrites(t *testing.T) {
	f := newFixture(t)
	for name, mutate := range map[string]func(*ContentImport){
		"empty":                 func(p *ContentImport) { p.Items = nil },
		"duplicate id":          func(p *ContentImport) { p.Items[0].ID = p.Items[1].ID },
		"multiple roots":        func(p *ContentImport) { p.Items[0].ParentID = nil },
		"external child parent": func(p *ContentImport) { id := uuid.NewString(); p.Items[0].ParentID = &id },
		"nonfolder parent":      func(p *ContentImport) { p.Items[0].ParentID = &p.Items[1].ID },
		"disconnected cycle":    func(p *ContentImport) { p.Items[3].ParentID = &p.Items[3].ID },
		"empty snapshot":        func(p *ContentImport) { p.Items[0].Markdown.Snapshot = nil },
		"mixed content":         func(p *ContentImport) { p.Items[1].Markdown = p.Items[0].Markdown },
		"bad scene":             func(p *ContentImport) { s := `{"elements":[]}`; p.Items[1].Whiteboard = &s },
		"blank title":           func(p *ContentImport) { p.Items[2].Title = "  " },
		"path in id":            func(p *ContentImport) { p.Items[2].ID = "../escape" },
		"duplicate asset":       func(p *ContentImport) { p.Assets = append(p.Assets, p.Assets[0]) },
		"foreign asset binding": func(p *ContentImport) { p.Assets[0].ItemID = uuid.NewString() },
		"asset path":            func(p *ContentImport) { p.Assets[0].FileName = "../escape.png" },
		"asset size":            func(p *ContentImport) { p.Assets[0].Size = MaxImportContentBytes },
		"asset negative size":   func(p *ContentImport) { p.Assets[0].Size = -1 },
		"asset digest":          func(p *ContentImport) { p.Assets[0].SHA256 = "unverified" },
		"asset MIME":            func(p *ContentImport) { p.Assets[0].MIME = "text/html" },
		"count limit":           func(p *ContentImport) { p.Items = make([]ImportItem, MaxImportEntries+1) },
	} {
		t.Run(name, func(t *testing.T) {
			p := importFixture()
			mutate(&p)
			if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, p); !errors.Is(err, ErrInvalid) {
				t.Fatalf("expected invalid, got %v", err)
			}
			assertImportCounts(t, f, []int{0, 0, 0, 0, 0})
		})
	}
}

func TestImportContentPermissionsConflictsAndReceiptIsolation(t *testing.T) {
	f := newFixture(t)
	plan := importFixture()
	viewer := f.addUser("import-viewer@test", "viewer")
	outsider := f.addUser("import-outsider@test", "")
	editor := f.addUser("import-editor@test", "editor")
	for _, userID := range []string{viewer.ID, outsider.ID} {
		if _, err := f.core.ImportContent(f.ctx, userID, f.space.ID, plan); !errors.Is(err, ErrForbidden) {
			t.Fatalf("permissions: %v", err)
		}
	}
	other, err := f.core.CreateWorkspace(f.ctx, f.owner.ID, "Other")
	if err != nil {
		t.Fatal(err)
	}
	parent, err := f.core.CreateItem(f.ctx, f.owner.ID, other.ID, "folder", "Other folder", nil)
	if err != nil {
		t.Fatal(err)
	}
	plan.ParentID = &parent.ID
	if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan); !errors.Is(err, ErrInvalid) {
		t.Fatalf("cross workspace parent: %v", err)
	}
	plan.ParentID = nil
	if _, err := f.core.ImportContent(f.ctx, editor.ID, f.space.ID, plan); err != nil {
		t.Fatal(err)
	}
	baseline := importCounts(t, f)
	if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan); !errors.Is(err, ErrConflict) {
		t.Fatalf("other user receipt: %v", err)
	}
	if _, err := f.core.ImportContent(f.ctx, f.owner.ID, other.ID, plan); !errors.Is(err, ErrConflict) {
		t.Fatalf("other workspace receipt: %v", err)
	}
	changed := plan
	changed.Assets = append([]ImportAsset(nil), plan.Assets...)
	changed.Assets[0].SHA256 = strings.Repeat("b", 64)
	if _, err := f.core.ImportContent(f.ctx, editor.ID, f.space.ID, changed); !errors.Is(err, ErrConflict) {
		t.Fatalf("changed payload: %v", err)
	}
	fresh := importFixture()
	if _, err := f.core.ImportContent(f.ctx, editor.ID, f.space.ID, fresh); !errors.Is(err, ErrConflict) {
		t.Fatalf("root title collision: %v", err)
	}
	if err := f.core.UpdateMember(f.ctx, f.owner.ID, f.space.ID, editor.ID, "viewer"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.ImportContent(f.ctx, editor.ID, f.space.ID, plan); !errors.Is(err, ErrForbidden) {
		t.Fatalf("replay after demotion: %v", err)
	}
	assertImportCounts(t, f, baseline)
}

func TestImportContentConcurrentRetryCommitsOnce(t *testing.T) {
	f := newFixture(t)
	plan := importFixture()
	var wg sync.WaitGroup
	results := make(chan ImportResult, 8)
	failures := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, err := f.core.ImportContent(context.Background(), f.owner.ID, f.space.ID, plan)
			results <- result
			failures <- err
		}()
	}
	wg.Wait()
	close(results)
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	commits := 0
	for result := range results {
		if !result.Replayed {
			commits++
		}
	}
	if commits != 1 {
		t.Fatalf("commits = %d", commits)
	}
	assertImportCounts(t, f, []int{4, 1, 1, 1, 1})
}

func TestImportContentDeletionAndCancellationNeverRecreateContent(t *testing.T) {
	f := newFixture(t)
	plan := importFixture()
	result, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, result.RootID); err != nil {
		t.Fatal(err)
	}
	var batchID string
	if err := f.db.QueryRow(`SELECT deletion_batch_id FROM items WHERE id=?`, result.RootID).Scan(&batchID); err != nil {
		t.Fatal(err)
	}
	if err := f.core.PurgeTrash(f.ctx, f.owner.ID, f.space.ID, batchID, "Imported"); err != nil {
		t.Fatal(err)
	}
	before := importCounts(t, f)
	replay, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan)
	if err != nil || !replay.Replayed {
		t.Fatalf("deleted replay: %+v %v", replay, err)
	}
	assertImportCounts(t, f, before)
	ctx, cancel := context.WithCancel(f.ctx)
	cancel()
	if _, err := f.core.ImportContent(ctx, f.owner.ID, f.space.ID, importFixture()); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel: %v", err)
	}
	assertImportCounts(t, f, before)
	if _, err := f.db.Exec(`UPDATE users SET disabled=1 WHERE id=?`, f.owner.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan); !errors.Is(err, ErrForbidden) {
		t.Fatalf("disabled replay: %v", err)
	}
	if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, importFixture()); !errors.Is(err, ErrForbidden) {
		t.Fatalf("disabled import: %v", err)
	}
	assertImportCounts(t, f, before)
}

func TestImportContentRejectsExistingIDsAndUnavailableDestinations(t *testing.T) {
	f := newFixture(t)
	existing := trashItem(t, f, "markdown", "Existing", nil)
	folder := trashItem(t, f, "folder", "Deleted destination", nil)
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, folder.ID); err != nil {
		t.Fatal(err)
	}
	baseline := importCounts(t, f)
	for _, parentID := range []string{existing.ID, folder.ID, uuid.NewString()} {
		plan := importFixture()
		plan.ParentID = &parentID
		if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan); !errors.Is(err, ErrInvalid) {
			t.Fatalf("bad target: %v", err)
		}
		assertImportCounts(t, f, baseline)
	}
	for _, id := range []string{existing.ID, folder.ID} {
		plan := importFixture()
		plan.Items[0].ID = id
		plan.Assets[0].ItemID = id
		if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, plan); !errors.Is(err, ErrConflict) {
			t.Fatalf("existing ID: %v", err)
		}
		assertImportCounts(t, f, baseline)
	}
	first := importFixture()
	if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, first); err != nil {
		t.Fatal(err)
	}
	baseline = importCounts(t, f)
	second := importFixture()
	second.Items[2].Title = "Another import"
	second.Assets[0].ID = first.Assets[0].ID
	if _, err := f.core.ImportContent(f.ctx, f.owner.ID, f.space.ID, second); !errors.Is(err, ErrConflict) {
		t.Fatalf("existing asset ID: %v", err)
	}
	assertImportCounts(t, f, baseline)
}

func TestImportContentPlanCapacityBoundaries(t *testing.T) {
	plan := importFixture()
	contentBytes := int64(len(plan.Items[0].Markdown.Snapshot) + len(plan.Items[0].Markdown.Markdown) + len(*plan.Items[1].Whiteboard))
	plan.Assets[0].Size = MaxImportContentBytes - contentBytes
	if _, err := validateImport(plan); err != nil {
		t.Fatalf("exact size rejected: %v", err)
	}
	plan.Assets[0].Size++
	if _, err := validateImport(plan); !errors.Is(err, ErrInvalid) {
		t.Fatalf("overflow size accepted: %v", err)
	}
	root := uuid.NewString()
	plan = ContentImport{ID: uuid.NewString(), Items: []ImportItem{{ID: root, Type: "folder", Title: "Root"}}}
	for i := 1; i < MaxImportEntries; i++ {
		plan.Items = append(plan.Items, ImportItem{ID: uuid.NewString(), ParentID: &root, Type: "folder", Title: fmt.Sprint(i)})
	}
	if order, err := validateImport(plan); err != nil || len(order) != MaxImportEntries {
		t.Fatalf("exact count rejected: %d %v", len(order), err)
	}
	plan.Items = append(plan.Items, ImportItem{ID: uuid.NewString(), ParentID: &root, Type: "folder", Title: "Too many"})
	if _, err := validateImport(plan); !errors.Is(err, ErrInvalid) {
		t.Fatalf("overflow count accepted: %v", err)
	}
}
