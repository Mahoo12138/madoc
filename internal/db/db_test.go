package db

import (
	"context"
	"path/filepath"
	"testing"
	"time"
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

func TestSnapshotUpsert(t *testing.T) {
	ctx := context.Background()
	r := openTestDB(t)

	snap := &Snapshot{
		WorkspaceID: "ws1",
		GUID:        "doc1",
		Blob:        []byte("hello"),
		State:       []byte("state"),
		Size:        5,
	}
	if err := r.UpsertSnapshot(ctx, snap); err != nil {
		t.Fatal(err)
	}
	got, err := r.GetSnapshot(ctx, "ws1", "doc1")
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Blob) != "hello" {
		t.Fatalf("expected 'hello', got %q", string(got.Blob))
	}
}

func TestUpdates(t *testing.T) {
	ctx := context.Background()
	r := openTestDB(t)

	if _, err := r.AppendUpdate(ctx, "ws1", "doc1", []byte{1, 2, 3}, nil); err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Millisecond)
	ts2, err := r.AppendUpdate(ctx, "ws1", "doc1", []byte{4, 5, 6}, nil)
	if err != nil {
		t.Fatal(err)
	}
	ups, err := r.ListUpdates(ctx, "ws1", "doc1")
	if err != nil || len(ups) != 2 {
		t.Fatalf("expect 2 updates, got %d err=%v", len(ups), err)
	}

	if err := r.DeleteUpdatesBefore(ctx, "ws1", "doc1", ts2); err != nil {
		t.Fatal(err)
	}
	ups, err = r.ListUpdates(ctx, "ws1", "doc1")
	if err != nil || len(ups) != 1 {
		t.Fatalf("expect 1 update remain, got %d err=%v", len(ups), err)
	}
}

func TestUserSession(t *testing.T) {
	ctx := context.Background()
	r := openTestDB(t)

	if err := r.CreateUser(ctx, "u1", "test", "test@test.com", "hash"); err != nil {
		t.Fatal(err)
	}
	u, err := r.GetUserByEmail(ctx, "test@test.com")
	if err != nil {
		t.Fatal(err)
	}
	if u.Name != "test" {
		t.Fatalf("expected 'test', got %q", u.Name)
	}
	users, err := r.ListUsers(ctx, ListUsersFilter{})
	if err != nil || len(users) != 1 {
		t.Fatalf("expect 1 user, got %d", len(users))
	}
}

func TestWorkspaceLifecycle(t *testing.T) {
	ctx := context.Background()
	r := openTestDB(t)

	name := "My Workspace"
	if err := r.CreateUser(ctx, "u1", "admin", "admin@test.com", "hash"); err != nil {
		t.Fatal(err)
	}
	if err := r.CreateWorkspace(ctx, "ws1", false, &name); err != nil {
		t.Fatal(err)
	}
	if err := r.AddWorkspacePermission(ctx, "p1", "ws1", "u1", PermOwner); err != nil {
		t.Fatal(err)
	}
	list, err := r.ListWorkspacesByUser(ctx, "u1")
	if err != nil || len(list) != 1 {
		t.Fatalf("expect 1 workspace, got %d err=%v", len(list), err)
	}
	if err := r.DeleteWorkspace(ctx, "ws1"); err != nil {
		t.Fatal(err)
	}
}

func TestAppConfig(t *testing.T) {
	ctx := context.Background()
	r := openTestDB(t)

	val, err := r.GetAppConfig(ctx, "theme")
	if err != nil {
		t.Fatal(err)
	}
	if val != "{}" {
		t.Fatalf("expected '{}', got %q", val)
	}
	if err := r.SetAppConfig(ctx, "theme", `"dark"`); err != nil {
		t.Fatal(err)
	}
	val, err = r.GetAppConfig(ctx, "theme")
	if err != nil || val != `"dark"` {
		t.Fatalf("expected '\"dark\"', got %q err=%v", val, err)
	}
}

func TestBlobCRUD(t *testing.T) {
	ctx := context.Background()
	r := openTestDB(t)

	name := "Test WS"
	if err := r.CreateWorkspace(ctx, "ws1", false, &name); err != nil {
		t.Fatal(err)
	}
	if err := r.CreateBlob(ctx, "ws1", "img.png", 1024, "image/png", []byte("fake-image-data")); err != nil {
		t.Fatal(err)
	}
	b, err := r.GetBlob(ctx, "ws1", "img.png")
	if err != nil {
		t.Fatal(err)
	}
	if b.Size != 1024 || b.Mime != "image/png" {
		t.Fatalf("unexpected blob: %+v", b)
	}
	if err := r.DeleteBlob(ctx, "ws1", "img.png"); err != nil {
		t.Fatal(err)
	}
	b, err = r.GetBlob(ctx, "ws1", "img.png")
	if err != nil {
		t.Fatal(err)
	}
	if b.DeletedAt == nil {
		t.Fatal("expected deleted_at to be set")
	}
}
