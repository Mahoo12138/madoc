package core

import (
	"errors"
	"testing"
)

func trashItem(t *testing.T, f *fixture, kind, title string, parent *string) Item {
	t.Helper()
	item, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, kind, title, parent)
	if err != nil {
		t.Fatal(err)
	}
	return item
}

func TestTrashPreservesSubtreeContentAndIndependentBatches(t *testing.T) {
	f := newFixture(t)
	folder := trashItem(t, f, "folder", "Folder", nil)
	old := trashItem(t, f, "markdown", "Earlier deletion", &folder.ID)
	doc := trashItem(t, f, "markdown", "Document", &folder.ID)
	board := trashItem(t, f, "whiteboard", "Board", &folder.ID)
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, []byte{1, 2}, "kept"); err != nil {
		t.Fatal(err)
	}
	seq, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "kept-update", []byte{3}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, `{"elements":[{"id":"kept"}]}`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,storage_key,created_at) VALUES('asset',?,?,'image','image/png',1,'kept-file',CURRENT_TIMESTAMP)`, f.space.ID, doc.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, old.ID); err != nil {
		t.Fatal(err)
	}
	batches, err := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(batches) != 1 {
		t.Fatalf("old batch: %v %v", batches, err)
	}
	oldBatch := batches[0].ID
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, folder.ID); err != nil {
		t.Fatal(err)
	}
	items, err := f.core.ListItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(items) != 0 {
		t.Fatalf("active items: %v %v", items, err)
	}
	batches, err = f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(batches) != 2 {
		t.Fatalf("batches: %v %v", batches, err)
	}
	var batchID string
	for _, b := range batches {
		if b.Root.ID == folder.ID {
			batchID = b.ID
			if b.ItemCount != 3 {
				t.Fatalf("batch count %d", b.ItemCount)
			}
		}
	}
	if batchID == "" {
		t.Fatal("missing folder batch")
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, oldBatch, nil); !errors.Is(err, ErrRestoreDestination) {
		t.Fatalf("deleted parent: %v", err)
	}
	editor := f.addUser("restore-editor@test", "editor")
	if err := f.core.RestoreTrash(f.ctx, editor.ID, f.space.ID, batchID, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.GetItem(f.ctx, old.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("older deletion revived: %v", err)
	}
	state, err := f.core.Markdown(f.ctx, f.owner.ID, doc.ID)
	if err != nil || state.Markdown != "kept" || state.HeadSeq != seq || string(state.Snapshot) != string([]byte{1, 2}) || len(state.Updates) != 1 {
		t.Fatalf("restored content: %+v %v", state, err)
	}
	retry, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "kept-update", []byte{3}, 1)
	if err != nil || retry != seq {
		t.Fatalf("receipt lost: %d %v", retry, err)
	}
	restored, err := f.core.Whiteboard(f.ctx, f.owner.ID, board.ID)
	if err != nil || restored.Revision != 1 || restored.Scene != `{"elements":[{"id":"kept"}]}` {
		t.Fatalf("board lost: %+v %v", restored, err)
	}
	var assetItem string
	if err := f.db.QueryRow(`SELECT item_id FROM assets WHERE id='asset'`).Scan(&assetItem); err != nil || assetItem != doc.ID {
		t.Fatalf("asset detached: %s %v", assetItem, err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, oldBatch, nil); err != nil {
		t.Fatal(err)
	}
	items, err = f.core.ListItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(items) != 4 {
		t.Fatalf("restored tree: %v %v", items, err)
	}
}

func TestTrashRejectsReadsWritesAndWrongRestoreDestinations(t *testing.T) {
	f := newFixture(t)
	folder := trashItem(t, f, "folder", "Folder", nil)
	doc := trashItem(t, f, "markdown", "Doc", &folder.ID)
	board := trashItem(t, f, "whiteboard", "Board", &folder.ID)
	active := trashItem(t, f, "markdown", "Active", nil)
	viewer := f.addUser("trash-viewer@test", "viewer")
	outsider := f.addUser("trash-outsider@test", "")
	for _, user := range []string{viewer.ID, outsider.ID} {
		if err := f.core.DeleteItem(f.ctx, user, folder.ID); !errors.Is(err, ErrForbidden) {
			t.Fatalf("delete permission: %v", err)
		}
		if _, err := f.core.ListTrash(f.ctx, user, f.space.ID); !errors.Is(err, ErrForbidden) {
			t.Fatalf("list permission: %v", err)
		}
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, folder.ID); err != nil {
		t.Fatal(err)
	}
	batches, _ := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	batch := batches[0].ID
	for _, user := range []string{viewer.ID, outsider.ID} {
		if err := f.core.RestoreTrash(f.ctx, user, f.space.ID, batch, nil); !errors.Is(err, ErrForbidden) {
			t.Fatalf("restore permission: %v", err)
		}
	}
	if _, err := f.core.Markdown(f.ctx, f.owner.ID, doc.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("read trash: %v", err)
	}
	if _, err := f.core.ExportMarkdown(f.ctx, f.owner.ID, doc.ID, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("export trash: %v", err)
	}
	if _, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "late", []byte{1}, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("append trash: %v", err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, []byte{1}, "bad"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("reset trash: %v", err)
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "bad", 0, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cache trash: %v", err)
	}
	if err := f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, doc.ID, 0, []byte{1}, "bad", 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("snapshot trash: %v", err)
	}
	if _, err := f.core.Whiteboard(f.ctx, f.owner.ID, board.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("board read: %v", err)
	}
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, `{}`); !errors.Is(err, ErrNotFound) {
		t.Fatalf("board write: %v", err)
	}
	if err := f.core.RenameItem(f.ctx, f.owner.ID, doc.ID, "bad"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rename trash: %v", err)
	}
	if err := f.core.MoveItem(f.ctx, f.owner.ID, active.ID, &folder.ID, 0); !errors.Is(err, ErrInvalid) {
		t.Fatalf("move into trash: %v", err)
	}
	if _, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "bad", &folder.ID); !errors.Is(err, ErrInvalid) {
		t.Fatalf("create in trash: %v", err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batch, &TrashDestination{ParentID: &folder.ID}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("self restore: %v", err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batch, &TrashDestination{ParentID: &active.ID}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("nonfolder restore: %v", err)
	}
	other, err := f.core.CreateWorkspace(f.ctx, f.owner.ID, "Other")
	if err != nil {
		t.Fatal(err)
	}
	target, err := f.core.CreateItem(f.ctx, f.owner.ID, other.ID, "folder", "Other folder", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, other.ID, batch, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("batch isolation: %v", err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batch, &TrashDestination{ParentID: &target.ID}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("destination isolation: %v", err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batch, &TrashDestination{}); err != nil {
		t.Fatal(err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batch, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("repeated restore: %v", err)
	}
}

func TestTrashTransactionsRollBack(t *testing.T) {
	f := newFixture(t)
	folder := trashItem(t, f, "folder", "Folder", nil)
	doc := trashItem(t, f, "markdown", "Doc", &folder.ID)
	if _, err := f.db.Exec(`CREATE TRIGGER fail_trash BEFORE UPDATE OF deletion_batch_id ON items WHEN NEW.title='Doc' BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, folder.ID); err == nil {
		t.Fatal("delete should fail")
	}
	if _, err := f.core.GetItem(f.ctx, doc.ID); err != nil {
		t.Fatal(err)
	}
	batches, _ := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if len(batches) != 0 {
		t.Fatal("failed deletion retained batch")
	}
	if _, err := f.db.Exec(`DROP TRIGGER fail_trash`); err != nil {
		t.Fatal(err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, folder.ID); err != nil {
		t.Fatal(err)
	}
	batches, _ = f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if _, err := f.db.Exec(`CREATE TRIGGER fail_restore BEFORE UPDATE OF deletion_batch_id ON items WHEN NEW.deletion_batch_id IS NULL AND NEW.title='Doc' BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batches[0].ID, nil); err == nil {
		t.Fatal("restore should fail")
	}
	if _, err := f.core.GetItem(f.ctx, folder.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("partial restore: %v", err)
	}
	after, _ := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if len(after) != 1 || after[0].ItemCount != 2 {
		t.Fatal("failed restore damaged batch")
	}
}

func TestRestoreToRootWhenOriginalParentIsTrashed(t *testing.T) {
	f := newFixture(t)
	folder := trashItem(t, f, "folder", "Folder", nil)
	doc := trashItem(t, f, "markdown", "Doc", &folder.ID)
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, doc.ID); err != nil {
		t.Fatal(err)
	}
	batches, err := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(batches) != 1 {
		t.Fatalf("batches: %v %v", batches, err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, folder.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batches[0].ID, nil); !errors.Is(err, ErrRestoreDestination) {
		t.Fatalf("implicit relocation: %v", err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batches[0].ID, &TrashDestination{}); err != nil {
		t.Fatal(err)
	}
	restored, err := f.core.GetItem(f.ctx, doc.ID)
	if err != nil || restored.ParentID != nil {
		t.Fatalf("explicit root: %+v %v", restored, err)
	}
	// Workspace deletion remains a separate owner-only operation. Its existing
	// cascade must also remove batches without FK failures or cross-space effects.
	if err := f.core.DeleteWorkspace(f.ctx, f.owner.ID, f.space.ID); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM item_deletion_batches`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("workspace batch cleanup: %d %v", count, err)
	}
}
