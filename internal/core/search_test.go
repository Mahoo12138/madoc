package core

import (
	"errors"
	"strings"
	"testing"
)

func TestSearchLiteralTermsPathsAndLimits(t *testing.T) {
	f := newFixture(t)
	folder := trashItem(t, f, "folder", "研发资料", nil)
	doc := trashItem(t, f, "markdown", "API_v2 100%", &folder.ID)
	trashItem(t, f, "whiteboard", "设计图", nil)
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, nil, "中文短词检索，GoIdentifier 与 O'Reilly。snake\\_case and a\\*b。"+strings.Repeat("长", 200)+"尾部关键字"); err != nil {
		t.Fatal(err)
	}
	for _, term := range []string{"中", "短词", "API_v2", "api_V2", "100%", "GoIdentifier", "O'Reilly", "尾部关键字", "snake_case", "snake\\_case", "a*b", "研发资料 / API"} {
		got, err := f.core.Search(f.ctx, f.owner.ID, f.space.ID, term, 30)
		if err != nil || len(got.Items) != 1 || got.Items[0].ID != doc.ID {
			t.Fatalf("%q: %+v %v", term, got, err)
		}
		if len([]rune(got.Items[0].Snippet)) > 160 {
			t.Fatal("unbounded snippet")
		}
	}
	for _, term := range []string{"%", "_", "'"} {
		got, err := f.core.Search(f.ctx, f.owner.ID, f.space.ID, term, 30)
		if err != nil || len(got.Items) != 1 {
			t.Fatalf("literal %q: %+v %v", term, got, err)
		}
	}
	got, err := f.core.Search(f.ctx, f.owner.ID, f.space.ID, "研发", 1)
	if err != nil || len(got.Items) != 1 || got.Items[0].ID != folder.ID || !got.HasMore {
		t.Fatalf("rank/limit: %+v %v", got, err)
	}
	got, err = f.core.Search(f.ctx, f.owner.ID, f.space.ID, "MATCH OR ' --", 30)
	if err != nil || len(got.Items) != 0 {
		t.Fatalf("literal syntax: %+v %v", got, err)
	}
	for _, term := range []string{" ", strings.Repeat("字", 129), "nul\x00term"} {
		if _, err := f.core.Search(f.ctx, f.owner.ID, f.space.ID, term, 30); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid query: %v", err)
		}
	}
	for _, limit := range []int{0, 101} {
		if _, err := f.core.Search(f.ctx, f.owner.ID, f.space.ID, "中", limit); !errors.Is(err, ErrInvalid) {
			t.Fatal(err)
		}
	}
}

func TestSearchPermissionAndLifecycle(t *testing.T) {
	f := newFixture(t)
	viewer := f.addUser("search-viewer@example.test", "viewer")
	outsider := f.addUser("search-outsider@example.test", "")
	folder := trashItem(t, f, "folder", "old-path", nil)
	doc := trashItem(t, f, "markdown", "needle", &folder.ID)
	other, err := f.core.CreateWorkspace(f.ctx, f.owner.ID, "other")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.core.CreateItem(f.ctx, f.owner.ID, other.ID, "markdown", "needle-secret", nil); err != nil {
		t.Fatal(err)
	}
	search := func(term string) SearchResults {
		t.Helper()
		got, err := f.core.Search(f.ctx, viewer.ID, f.space.ID, term, 30)
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	if got := search("needle"); len(got.Items) != 1 || got.Items[0].ID != doc.ID {
		t.Fatal(got)
	}
	if _, err = f.core.Search(f.ctx, outsider.ID, f.space.ID, "needle", 30); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	if _, err = f.core.Search(f.ctx, viewer.ID, other.ID, "needle", 30); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	if err = f.core.RenameItem(f.ctx, f.owner.ID, folder.ID, "new-path"); err != nil {
		t.Fatal(err)
	}
	if got := search("old-path"); len(got.Items) != 0 {
		t.Fatal(got)
	}
	if got := search("needle"); got.Items[0].Path != "new-path / needle" {
		t.Fatal(got)
	}
	if err = f.core.MoveItem(f.ctx, f.owner.ID, doc.ID, nil, 0); err != nil {
		t.Fatal(err)
	}
	if got := search("needle"); got.Items[0].Path != "needle" {
		t.Fatal(got)
	}
	if err = f.core.DeleteItem(f.ctx, f.owner.ID, doc.ID); err != nil {
		t.Fatal(err)
	}
	if got := search("needle"); len(got.Items) != 0 {
		t.Fatal(got)
	}
	batches, err := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batches[0].ID, nil); err != nil {
		t.Fatal(err)
	}
	if got := search("needle"); len(got.Items) != 1 {
		t.Fatal(got)
	}
	if err = f.core.RemoveMember(f.ctx, f.owner.ID, f.space.ID, viewer.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.core.Search(f.ctx, viewer.ID, f.space.ID, "needle", 30); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
}

func TestSearchReportsLaggingMarkdownEvenWithoutMatches(t *testing.T) {
	f := newFixture(t)
	doc := trashItem(t, f, "markdown", "Cache", nil)
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, nil, "old-body"); err != nil {
		t.Fatal(err)
	}
	seq, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "search-update", []byte{1}, 1)
	if err != nil {
		t.Fatal(err)
	}
	got, err := f.core.Search(f.ctx, f.owner.ID, f.space.ID, "old-body", 30)
	if err != nil || got.StaleDocuments != 1 || got.Items[0].CacheSeq != 0 || got.Items[0].HeadSeq != seq || got.Items[0].Generation != 1 {
		t.Fatalf("lag: %+v %v", got, err)
	}
	got, err = f.core.Search(f.ctx, f.owner.ID, f.space.ID, "new-body", 30)
	if err != nil || got.StaleDocuments != 1 || len(got.Items) != 0 {
		t.Fatalf("missing: %+v %v", got, err)
	}
	if err = f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "new-body", seq, 1); err != nil {
		t.Fatal(err)
	}
	got, err = f.core.Search(f.ctx, f.owner.ID, f.space.ID, "new-body", 30)
	if err != nil || got.StaleDocuments != 0 || len(got.Items) != 1 || got.Items[0].CacheSeq != seq {
		t.Fatalf("current: %+v %v", got, err)
	}
	if err = f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, doc.ID, seq, []byte{1}, "compacted-body", 1); err != nil {
		t.Fatal(err)
	}
	got, err = f.core.Search(f.ctx, f.owner.ID, f.space.ID, "compacted-body", 30)
	if err != nil || len(got.Items) != 1 || got.Items[0].HeadSeq != seq || got.Items[0].CacheSeq != seq || got.StaleDocuments != 0 {
		t.Fatalf("compacted: %+v %v", got, err)
	}
	if err = f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, nil, "replacement-body"); err != nil {
		t.Fatal(err)
	}
	got, err = f.core.Search(f.ctx, f.owner.ID, f.space.ID, "compacted-body", 30)
	if err != nil || len(got.Items) != 0 {
		t.Fatalf("replaced old body: %+v %v", got, err)
	}
	got, err = f.core.Search(f.ctx, f.owner.ID, f.space.ID, "replacement-body", 30)
	if err != nil || len(got.Items) != 1 || got.Items[0].Generation != 2 || got.Items[0].HeadSeq != 0 {
		t.Fatalf("replacement: %+v %v", got, err)
	}

}
