package core

import (
	"bytes"
	"errors"
	"testing"
)

func TestCreateInitialMarkdownIsAtomicAndPermissionChecked(t *testing.T) {
	f := newFixture(t)
	seed := &InitialMarkdown{Snapshot: []byte{1, 2, 3}, Markdown: "# Template"}
	folder := trashItem(t, f, "folder", "Destination", nil)
	item, err := f.core.CreateItemWithMarkdown(f.ctx, f.owner.ID, f.space.ID, "markdown", "Seeded", &folder.ID, seed)
	if err != nil {
		t.Fatal(err)
	}
	state, err := f.core.Markdown(f.ctx, f.owner.ID, item.ID)
	if err != nil || !bytes.Equal(state.Snapshot, seed.Snapshot) || state.Markdown != seed.Markdown || state.Generation != 0 || state.HeadSeq != 0 || state.CacheSeq != 0 {
		t.Fatalf("initial: %+v %v", state, err)
	}
	viewer := f.addUser("seed-viewer@example.test", "viewer")
	if _, err := f.core.CreateItemWithMarkdown(f.ctx, viewer.ID, f.space.ID, "markdown", "Denied", nil, seed); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	for _, kind := range []string{"folder", "whiteboard"} {
		if _, err := f.core.CreateItemWithMarkdown(f.ctx, f.owner.ID, f.space.ID, kind, "Invalid", nil, seed); !errors.Is(err, ErrInvalid) {
			t.Fatal(err)
		}
	}
	if _, err := f.core.CreateItemWithMarkdown(f.ctx, f.owner.ID, f.space.ID, "markdown", "Empty snapshot", nil, &InitialMarkdown{Markdown: "text"}); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`CREATE TRIGGER fail_initial BEFORE INSERT ON markdown_states BEGIN SELECT RAISE(ABORT,'fail'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.CreateItemWithMarkdown(f.ctx, f.owner.ID, f.space.ID, "markdown", "Rolled back", nil, seed); err == nil {
		t.Fatal("expected failure")
	}
	var count int
	if err := f.db.QueryRow(`SELECT COUNT(*) FROM items WHERE title='Rolled back'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("partial: %d %v", count, err)
	}
}
