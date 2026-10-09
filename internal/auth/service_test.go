package auth

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"madoc/internal/db"
)

func TestDisabledAndExpiredSessionsAreRejected(t *testing.T) {
	ctx := context.Background()
	conn, err := db.Open(filepath.Join(t.TempDir(), "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	service := New(conn)
	user, session, err := service.SetupAdmin(ctx, "Owner", "owner@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	var source string
	var canCreate int
	if err := conn.QueryRow(`SELECT signup_source,can_create_workspace FROM users WHERE id=?`, user.ID).Scan(&source, &canCreate); err != nil {
		t.Fatal(err)
	}
	if source != "setup" || canCreate != 1 || !user.Capabilities.CanManageSite || !user.Capabilities.CanCreateWorkspace {
		t.Fatalf("setup account fields source=%q canCreate=%d capabilities=%#v", source, canCreate, user.Capabilities)
	}
	if _, err := service.Resolve(ctx, session); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE users SET disabled=1 WHERE id=?`, user.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Resolve(ctx, session); !errors.Is(err, ErrDisabled) {
		t.Fatalf("disabled session error = %v", err)
	}
	if _, _, err := service.SignIn(ctx, user.Email, "password123"); !errors.Is(err, ErrDisabled) {
		t.Fatalf("disabled sign-in error = %v", err)
	}
	if _, err := conn.Exec(`UPDATE users SET disabled=0 WHERE id=?`, user.ID); err != nil {
		t.Fatal(err)
	}
	expired, err := service.CreateSession(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE sessions SET expires_at=? WHERE id=?`, time.Now().UTC().Add(-time.Hour), expired); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Resolve(ctx, expired); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired session error = %v", err)
	}
}

func TestApplyCapabilitiesUsesAdminOverrideAndDisabledGuard(t *testing.T) {
	user := User{ID: "user", IsAdmin: true, CanCreateWorkspace: false}
	user.ApplyCapabilities()
	if !user.Capabilities.CanManageSite || !user.Capabilities.CanCreateWorkspace {
		t.Fatalf("admin capabilities = %#v", user.Capabilities)
	}
	user.Disabled = true
	user.ApplyCapabilities()
	if user.Capabilities.CanManageSite || user.Capabilities.CanCreateWorkspace {
		t.Fatalf("disabled capabilities = %#v", user.Capabilities)
	}
}
