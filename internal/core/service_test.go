package core

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"madoc/internal/auth"
	"madoc/internal/db"
)

type fixture struct {
	t     *testing.T
	db    *sql.DB
	core  *Service
	auth  *auth.Service
	ctx   context.Context
	owner auth.User
	space Workspace
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	authService := auth.New(conn)
	owner, _, err := authService.SetupAdmin(context.Background(), "Owner", "owner@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	domain := New(conn)
	space, err := domain.CreateWorkspace(context.Background(), owner.ID, "Test")
	if err != nil {
		t.Fatal(err)
	}
	return &fixture{t: t, db: conn, core: domain, auth: authService, ctx: context.Background(), owner: owner, space: space}
}

func (f *fixture) addUser(email, role string) auth.User {
	f.t.Helper()
	now := time.Now().UTC()
	user := auth.User{ID: uuid.NewString(), Name: email, Email: email}
	hash, _ := auth.HashPassword("password123")
	if _, err := f.db.Exec(`INSERT INTO users(id,name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)`, user.ID, user.Name, user.Email, hash, now, now); err != nil {
		f.t.Fatal(err)
	}
	if role != "" {
		if _, err := f.db.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)`, f.space.ID, user.ID, role, now); err != nil {
			f.t.Fatal(err)
		}
	}
	return user
}

func TestWorkspacePermissionsAndOwnerInvariant(t *testing.T) {
	f := newFixture(t)
	viewer := f.addUser("viewer@example.com", "viewer")
	if _, err := f.core.CreateItem(f.ctx, viewer.ID, f.space.ID, "markdown", "Denied", nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer write error = %v", err)
	}
	outsider := f.addUser("outsider@example.com", "")
	if _, err := f.core.ListItems(f.ctx, outsider.ID, f.space.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("cross-workspace access error = %v", err)
	}
	if err := f.core.UpdateMember(f.ctx, f.owner.ID, f.space.ID, f.owner.ID, "editor"); !errors.Is(err, ErrConflict) {
		t.Fatalf("last owner demotion error = %v", err)
	}
	second := f.addUser("second@example.com", "owner")
	if err := f.core.UpdateMember(f.ctx, f.owner.ID, f.space.ID, second.ID, "editor"); err != nil {
		t.Fatalf("demote one of two owners: %v", err)
	}
}

func TestItemValidationOrderingAndCascade(t *testing.T) {
	f := newFixture(t)
	folder, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "folder", "Folder", nil)
	if err != nil {
		t.Fatal(err)
	}
	child, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "folder", "Child", &folder.ID)
	if err != nil {
		t.Fatal(err)
	}
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", &child.ID)
	if err != nil {
		t.Fatal(err)
	}
	remaining, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Remaining", &child.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.MoveItem(f.ctx, f.owner.ID, folder.ID, &child.ID, 0); !errors.Is(err, ErrInvalid) {
		t.Fatalf("cycle move error = %v", err)
	}
	if err := f.core.MoveItem(f.ctx, f.owner.ID, doc.ID, nil, 0); err != nil {
		t.Fatal(err)
	}
	items, _ := f.core.ListItems(f.ctx, f.owner.ID, f.space.ID)
	if items[0].ID != doc.ID || items[0].SortKey != 0 {
		t.Fatalf("unexpected root ordering: %#v", items)
	}
	for _, item := range items {
		if item.ID == remaining.ID && item.SortKey != 0 {
			t.Fatalf("old siblings were not reindexed: %#v", item)
		}
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, folder.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.GetItem(f.ctx, child.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("recursive delete did not remove child: %v", err)
	}
}

func TestMarkdownIdempotenceAndCompactionRace(t *testing.T) {
	f := newFixture(t)
	doc, _ := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	seq1, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "client-1", []byte{1}, 0)
	if err != nil {
		t.Fatal(err)
	}
	retried, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "client-1", []byte{1}, 0)
	if err != nil || retried != seq1 {
		t.Fatalf("idempotent retry = %d, %v", retried, err)
	}
	seq2, _ := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "client-2", []byte{2}, 0)
	seq3, _ := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "client-3", []byte{3}, 0)
	if err := f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, doc.ID, seq2, []byte{9}, "snapshot", 0); err != nil {
		t.Fatal(err)
	}
	state, err := f.core.Markdown(f.ctx, f.owner.ID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if state.SnapshotSeq != seq2 || len(state.Updates) != 1 || state.Updates[0].Seq != seq3 {
		t.Fatalf("compaction lost concurrent update: %#v", state)
	}
}

func TestMarkdownHandlesLargeUpdateLogAndRejectsFutureCache(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Large", nil)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 1001; i++ {
		if _, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, fmt.Sprintf("client-%d", i), []byte{byte(i)}, 0); err != nil {
			t.Fatalf("append update %d: %v", i, err)
		}
	}
	count, size, err := f.core.MarkdownUpdateStats(f.ctx, doc.ID)
	if err != nil || count != 1001 || size != 1001 {
		t.Fatalf("update stats = %d/%d, %v", count, size, err)
	}
	state, err := f.core.Markdown(f.ctx, f.owner.ID, doc.ID)
	if err != nil || len(state.Updates) != 1001 {
		t.Fatalf("large update state = %d, %v", len(state.Updates), err)
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "future", state.HeadSeq+1, 0); !errors.Is(err, ErrConflict) {
		t.Fatalf("future cache error = %v", err)
	}
}

func TestWhiteboardRevisionConflict(t *testing.T) {
	f := newFixture(t)
	board, _ := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "whiteboard", "Board", nil)
	state, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, `{"elements":[],"appState":{},"files":{}}`)
	if err != nil || state.Revision != 1 {
		t.Fatalf("first update = %#v, %v", state, err)
	}
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, state.Scene); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale revision error = %v", err)
	}
}

func TestInviteAcceptanceTransactionAndExistingAccountAuth(t *testing.T) {
	f := newFixture(t)
	existing := f.addUser("existing@example.com", "")
	_, token, err := f.core.CreateInvite(f.ctx, f.owner.ID, f.space.ID, existing.Email, "editor")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.core.AcceptInvite(f.ctx, token, "", "", nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("existing unauthenticated account accepted: %v", err)
	}
	if _, _, err := f.core.AcceptInvite(f.ctx, token, "", "", &existing); err != nil {
		t.Fatalf("authenticated accept: %v", err)
	}
	if _, _, err := f.core.AcceptInvite(f.ctx, token, "", "", &existing); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate accept error = %v", err)
	}
	_, newToken, _ := f.core.CreateInvite(f.ctx, f.owner.ID, f.space.ID, "new@example.com", "viewer")
	created, workspace, err := f.core.AcceptInvite(f.ctx, newToken, "New User", "password123", nil)
	if err != nil || created.Email != "new@example.com" || workspace.Role != "viewer" {
		t.Fatalf("new account accept = %#v %#v %v", created, workspace, err)
	}
}

func TestInviteEmailExpiryRevocationAndRollback(t *testing.T) {
	f := newFixture(t)
	invite, token, err := f.core.CreateInvite(f.ctx, f.owner.ID, f.space.ID, "new@example.com", "viewer")
	if err != nil {
		t.Fatal(err)
	}
	wrong := f.addUser("wrong@example.com", "")
	if _, _, err := f.core.AcceptInvite(f.ctx, token, "", "", &wrong); !errors.Is(err, ErrForbidden) {
		t.Fatalf("email mismatch error = %v", err)
	}
	if _, _, err := f.core.AcceptInvite(f.ctx, token, "New", "short", nil); !errors.Is(err, ErrInvalid) {
		t.Fatalf("short password error = %v", err)
	}
	var created int
	if err := f.db.QueryRow(`SELECT count(*) FROM users WHERE email='new@example.com'`).Scan(&created); err != nil || created != 0 {
		t.Fatalf("failed acceptance leaked an account: count=%d err=%v", created, err)
	}
	if err := f.core.RevokeInvite(f.ctx, f.owner.ID, f.space.ID, invite.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.core.InspectInvite(f.ctx, token); !errors.Is(err, ErrConflict) {
		t.Fatalf("revoked invite error = %v", err)
	}
	_, expiredToken, err := f.core.CreateInvite(f.ctx, f.owner.ID, f.space.ID, "expired@example.com", "editor")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`UPDATE workspace_invites SET expires_at=? WHERE email='expired@example.com'`, time.Now().UTC().Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.core.InspectInvite(f.ctx, expiredToken); !errors.Is(err, ErrConflict) {
		t.Fatalf("expired invite error = %v", err)
	}
	if _, _, err := f.core.InspectInvite(f.ctx, "invalid-token"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("invalid token error = %v", err)
	}
}
