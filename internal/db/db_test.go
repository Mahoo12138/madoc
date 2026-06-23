package db

import (
	"context"
	"path/filepath"
	"testing"
)

func openTestDB(t *testing.T) *Repo {
	t.Helper()
	dir := t.TempDir()
	conn, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return NewRepo(conn)
}

func TestUpdatesAndSnapshot(t *testing.T) {
	ctx := context.Background()
	r := openTestDB(t)

	if err := r.CreateDoc(ctx, "d1", "Hello"); err != nil {
		t.Fatal(err)
	}
	id1, err := r.AppendUpdate(ctx, "d1", []byte{1, 2, 3})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.AppendUpdate(ctx, "d1", []byte{4, 5, 6}); err != nil {
		t.Fatal(err)
	}
	ups, err := r.ListUpdates(ctx, "d1")
	if err != nil || len(ups) != 2 {
		t.Fatalf("expect 2 updates, got %d err=%v", len(ups), err)
	}

	if err := r.SaveSnapshot(ctx, "d1", []byte("snap")); err != nil {
		t.Fatal(err)
	}
	snap, err := r.GetSnapshot(ctx, "d1")
	if err != nil || string(snap) != "snap" {
		t.Fatalf("snapshot mismatch: %q err=%v", snap, err)
	}

	if err := r.DeleteUpdatesUpTo(ctx, "d1", id1); err != nil {
		t.Fatal(err)
	}
	ups, _ = r.ListUpdates(ctx, "d1")
	if len(ups) != 1 {
		t.Fatalf("expect 1 update remain, got %d", len(ups))
	}
}

func TestFTS(t *testing.T) {
	ctx := context.Background()
	r := openTestDB(t)
	if err := r.CreateDoc(ctx, "d1", ""); err != nil {
		t.Fatal(err)
	}
	if err := r.UpsertText(ctx, "d1", "hello world madoc"); err != nil {
		t.Fatal(err)
	}
	hits, err := r.SearchFTS(ctx, "madoc")
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 1 || hits[0].DocID != "d1" {
		t.Fatalf("expected hit on d1, got %+v", hits)
	}
}

func TestListDocs(t *testing.T) {
	ctx := context.Background()
	r := openTestDB(t)
	if err := r.CreateDoc(ctx, "a", "A"); err != nil {
		t.Fatal(err)
	}
	if err := r.CreateDoc(ctx, "b", "B"); err != nil {
		t.Fatal(err)
	}
	docs, err := r.ListDocs(ctx)
	if err != nil || len(docs) != 2 {
		t.Fatalf("expect 2 docs, got %d err=%v", len(docs), err)
	}
}
