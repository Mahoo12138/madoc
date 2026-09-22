package core

import (
	"errors"
	"testing"
)

func TestMarkdownResetRejectsWritesFromOldGeneration(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	if err != nil {
		t.Fatal(err)
	}
	seq, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "old-ack", []byte{1}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, []byte{9}, "replacement"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"old-ack", "offline-never-sent"} {
		if _, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, id, []byte{2}, 0); !errors.Is(err, ErrGeneration) {
			t.Fatalf("stale update: %v", err)
		}
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "stale", 0, 0); !errors.Is(err, ErrGeneration) {
		t.Fatalf("stale cache: %v", err)
	}
	if err := f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, doc.ID, seq, []byte{2}, "stale", 0); !errors.Is(err, ErrGeneration) {
		t.Fatalf("stale snapshot: %v", err)
	}
	state, err := f.core.Markdown(f.ctx, f.owner.ID, doc.ID)
	if err != nil || state.Generation != 1 || state.Markdown != "replacement" || len(state.Updates) != 0 {
		t.Fatalf("replacement changed: %#v, %v", state, err)
	}
	next, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "current", []byte{3}, state.Generation)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "current", next, state.Generation); err != nil {
		t.Fatal(err)
	}
	if err := f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, doc.ID, next, []byte{3}, "current", state.Generation); err != nil {
		t.Fatal(err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, []byte{4}, "again"); err != nil {
		t.Fatal(err)
	}
	state, err = f.core.Markdown(f.ctx, f.owner.ID, doc.ID)
	if err != nil || state.Generation != 2 {
		t.Fatalf("generation = %d, %v", state.Generation, err)
	}
}
