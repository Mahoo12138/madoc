package core

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"madoc/internal/auth"
	"madoc/internal/db"
	"madoc/internal/site"
)

// writeSiteSettings replaces the stored settings document. Loading it later
// either succeeds or reports ErrCorrupt; nothing here can silently repair it.
func writeSiteSettings(t *testing.T, conn *sql.DB, mode string, allowOwnerInviteNewUsers, inviteDefaultCanCreateWorkspace bool) {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"schemaVersion":                         1,
		"revision":                              1,
		"registrationMode":                      mode,
		"allowWorkspaceOwnerInviteNewUsers":     allowOwnerInviteNewUsers,
		"inviteDefaultCanCreateWorkspace":       inviteDefaultCanCreateWorkspace,
		"publicSignupDefaultCanCreateWorkspace": false,
		"origin":                                "new",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE server_config SET value=? WHERE key='site_settings'`, string(body)); err != nil {
		t.Fatal(err)
	}
}

func countRows(t *testing.T, conn *sql.DB, query string, args ...any) int {
	t.Helper()
	var count int
	if err := conn.QueryRow(query, args...).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

// addOwner returns a workspace owner who is not a site administrator, so the
// workspace owner path can be exercised without the administrator exemption
// hiding behind it. Owners still need the explicit creation grant.
func (f *fixture) addOwner(email string) auth.User {
	owner := f.addUser(email, "owner")
	if _, err := f.db.Exec(`UPDATE users SET can_create_workspace=1 WHERE id=?`, owner.ID); err != nil {
		f.t.Fatal(err)
	}
	owner.CanCreateWorkspace = true
	owner.ApplyCapabilities()
	return owner
}

func inviteStatus(t *testing.T, conn *sql.DB, email string) string {
	t.Helper()
	var status string
	if err := conn.QueryRow(`SELECT status FROM workspace_invites WHERE email=?`, email).Scan(&status); err != nil {
		t.Fatalf("invite for %s: %v", email, err)
	}
	return status
}

// TestInviteCreationFollowsRegistrationMatrix covers §5.1 and §5.2: whether a
// workspace owner may address an invite to somebody without an account.
func TestInviteCreationFollowsRegistrationMatrix(t *testing.T) {
	tests := []struct {
		name               string
		mode               string
		allowOwnerInvites  bool
		inviterIsRegular   bool
		targetHasAccount   bool
		targetDisabled     bool
		wantErr            error
		wantInviteRowCount int
	}{
		{name: "closed admin", mode: "closed", inviterIsRegular: false, wantErr: site.ErrRegistrationClosed, wantInviteRowCount: 0},
		{name: "closed owner", mode: "closed", inviterIsRegular: true, wantErr: site.ErrRegistrationClosed, wantInviteRowCount: 0},
		{name: "invite only admin without owner switch", mode: "invite_only", allowOwnerInvites: false, inviterIsRegular: false, wantInviteRowCount: 1},
		{name: "invite only owner without owner switch", mode: "invite_only", allowOwnerInvites: false, inviterIsRegular: true, wantErr: site.ErrInviteNewUserDenied, wantInviteRowCount: 0},
		{name: "invite only owner with owner switch", mode: "invite_only", allowOwnerInvites: true, inviterIsRegular: true, wantInviteRowCount: 1},
		{name: "closed keeps existing accounts invitable", mode: "closed", targetHasAccount: true, wantInviteRowCount: 1},
		{name: "closed still refuses disabled existing accounts", mode: "closed", targetHasAccount: true, targetDisabled: true, wantErr: ErrInviteTargetDisabled, wantInviteRowCount: 0},
		{name: "invite only refuses disabled existing accounts", mode: "invite_only", allowOwnerInvites: true, targetHasAccount: true, targetDisabled: true, wantErr: ErrInviteTargetDisabled, wantInviteRowCount: 0},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			f := newFixture(t)
			writeSiteSettings(t, f.db, test.mode, test.allowOwnerInvites, false)
			inviter := f.owner
			if test.inviterIsRegular {
				inviter = f.addOwner("second-owner@example.com")
			}
			target := uuid.NewString() + "@example.com"
			if test.targetHasAccount {
				target = f.addUser(uuid.NewString()+"@example.com", "").Email
			}
			if test.targetDisabled {
				if _, err := f.db.Exec(`UPDATE users SET disabled=1 WHERE email=?`, target); err != nil {
					t.Fatal(err)
				}
			}
			invite, _, err := f.core.CreateInvite(f.ctx, inviter.ID, f.space.ID, target, "viewer")
			if test.wantErr != nil {
				if !errors.Is(err, test.wantErr) {
					t.Fatalf("CreateInvite error = %v, want %v", err, test.wantErr)
				}
				if invite != (Invite{}) {
					t.Fatalf("rejected invite returned %#v", invite)
				}
			} else if err != nil {
				t.Fatalf("CreateInvite: %v", err)
			}
			if got := countRows(t, f.db, `SELECT count(*) FROM workspace_invites WHERE email=?`, target); got != test.wantInviteRowCount {
				t.Fatalf("stored invites for %s = %d, want %d", target, got, test.wantInviteRowCount)
			}
			if test.wantErr != nil && !test.targetHasAccount {
				// Nothing about a rejected new user may be persisted, including
				// the account that never came to exist.
				if got := countRows(t, f.db, `SELECT count(*) FROM users WHERE email=?`, target); got != 0 {
					t.Fatalf("rejected invite created %d users", got)
				}
			}
		})
	}
}

// TestInviteCreationStillRequiresOwnership is INVITE-04: site administrator does
// not imply workspace ownership.
func TestInviteCreationStillRequiresOwnership(t *testing.T) {
	f := newFixture(t)
	writeSiteSettings(t, f.db, "invite_only", true, true)
	other, err := f.core.CreateWorkspace(f.ctx, f.addOwner("lone-owner@example.com").ID, "Elsewhere")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.core.CreateInvite(f.ctx, f.owner.ID, other.ID, "stranger@example.com", "viewer"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("administrator invited into a foreign workspace: %v", err)
	}
	if got := countRows(t, f.db, `SELECT count(*) FROM workspace_invites`); got != 0 {
		t.Fatalf("cross-workspace invite stored %d rows", got)
	}
}

// TestInviteOwnerMayStillInviteExistingAccounts is INVITE-03: turning the owner
// switch off must not remove the member invitation button.
func TestInviteOwnerMayStillInviteExistingAccounts(t *testing.T) {
	f := newFixture(t)
	writeSiteSettings(t, f.db, "invite_only", false, false)
	owner := f.addOwner("restricted-owner@example.com")
	existing := f.addUser("present@example.com", "")
	if _, _, err := f.core.CreateInvite(f.ctx, owner.ID, f.space.ID, "absent@example.com", "editor"); !errors.Is(err, site.ErrInviteNewUserDenied) {
		t.Fatalf("restricted owner invited a new user: %v", err)
	}
	_, token, err := f.core.CreateInvite(f.ctx, owner.ID, f.space.ID, existing.Email, "editor")
	if err != nil {
		t.Fatalf("restricted owner could not invite an existing account: %v", err)
	}
	if _, workspace, err := f.core.AcceptInvite(f.ctx, token, "", "", &existing); err != nil || workspace.Role != "editor" {
		t.Fatalf("existing account join: workspace=%#v err=%v", workspace, err)
	}
	if got := countRows(t, f.db, `SELECT count(*) FROM workspace_invites WHERE email='absent@example.com'`); got != 0 {
		t.Fatalf("denied invite stored %d rows", got)
	}
}

// TestInviteAcceptanceClosedModeBlocksNewAccount is INVITE-01: a closed site
// must not leave half-created accounts behind.
func TestInviteAcceptanceClosedModeBlocksNewAccount(t *testing.T) {
	f := newFixture(t)
	writeSiteSettings(t, f.db, "invite_only", true, true)
	_, token, err := f.core.CreateInvite(f.ctx, f.owner.ID, f.space.ID, "closed-mode@example.com", "viewer")
	if err != nil {
		t.Fatal(err)
	}
	before := countRows(t, f.db, `SELECT count(*) FROM users`)
	writeSiteSettings(t, f.db, "closed", true, true)
	if _, _, err := f.core.AcceptInvite(f.ctx, token, "Closed Mode", "password123", nil); !errors.Is(err, site.ErrRegistrationClosed) {
		t.Fatalf("closed mode acceptance error = %v", err)
	}
	if got := countRows(t, f.db, `SELECT count(*) FROM users`); got != before {
		t.Fatalf("users = %d, want %d", got, before)
	}
	if got := countRows(t, f.db, `SELECT count(*) FROM workspace_members WHERE role='viewer'`); got != 0 {
		t.Fatalf("closed acceptance wrote %d memberships", got)
	}
	if status := inviteStatus(t, f.db, "closed-mode@example.com"); status != "pending" {
		t.Fatalf("invite status = %q, want pending", status)
	}
}

// TestInviteAcceptanceExistingAccountIgnoresMode is INVITE-02: joining with an
// existing account is not a registration.
func TestInviteAcceptanceExistingAccountIgnoresMode(t *testing.T) {
	f := newFixture(t)
	writeSiteSettings(t, f.db, "invite_only", false, false)
	owner := f.addOwner("closed-owner@example.com")
	member := f.addUser("present-member@example.com", "")
	if _, err := f.db.Exec(`UPDATE users SET can_create_workspace=1,disabled=0 WHERE id=?`, member.ID); err != nil {
		t.Fatal(err)
	}
	_, token, err := f.core.CreateInvite(f.ctx, owner.ID, f.space.ID, member.Email, "viewer")
	if err != nil {
		t.Fatal(err)
	}
	writeSiteSettings(t, f.db, "closed", false, false)
	member.CanCreateWorkspace = true
	member.ApplyCapabilities()
	if _, workspace, err := f.core.AcceptInvite(f.ctx, token, "", "", &member); err != nil || workspace.Role != "viewer" {
		t.Fatalf("existing account join under closed mode: workspace=%#v err=%v", workspace, err)
	}
	var source string
	var canCreate int
	if err := f.db.QueryRow(`SELECT signup_source,can_create_workspace FROM users WHERE id=?`, member.ID).Scan(&source, &canCreate); err != nil {
		t.Fatal(err)
	}
	if canCreate != 1 {
		t.Fatalf("existing account capability changed: canCreate=%d source=%q", canCreate, source)
	}
	if status := inviteStatus(t, f.db, member.Email); status != "accepted" {
		t.Fatalf("invite status = %q, want accepted", status)
	}
}

// TestInviteAcceptanceUsesPolicyAtAcceptanceTime is INVITE-07 and the §5.5 rows
// for a tightened owner switch: an invite issued under a permissive policy
// cannot create an account once that policy is gone.
func TestInviteAcceptanceUsesPolicyAtAcceptanceTime(t *testing.T) {
	tests := []struct {
		name    string
		mode    string
		allow   bool
		wantErr error
	}{
		{name: "owner switch removed", mode: "invite_only", allow: false, wantErr: site.ErrInviteNewUserDenied},
		{name: "registration closed", mode: "closed", allow: true, wantErr: site.ErrRegistrationClosed},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			f := newFixture(t)
			writeSiteSettings(t, f.db, "invite_only", true, true)
			owner := f.addOwner("permissive-owner@example.com")
			_, token, err := f.core.CreateInvite(f.ctx, owner.ID, f.space.ID, "late-tightening@example.com", "viewer")
			if err != nil {
				t.Fatal(err)
			}
			writeSiteSettings(t, f.db, test.mode, test.allow, true)
			// The whole admission happens under one transaction and one pooled
			// connection, so a stray global handle shows up here rather than
			// corrupting state.
			acceptCtx, cancel := context.WithTimeout(f.ctx, 15*time.Second)
			defer cancel()
			if _, _, err := f.core.AcceptInvite(acceptCtx, token, "Late", "password123", nil); !errors.Is(err, test.wantErr) {
				t.Fatalf("acceptance after tightening error = %v, want %v", err, test.wantErr)
			}
			if got := countRows(t, f.db, `SELECT count(*) FROM users WHERE email='late-tightening@example.com'`); got != 0 {
				t.Fatalf("tightened acceptance created %d users", got)
			}
			if got := countRows(t, f.db, `SELECT count(*) FROM workspace_members WHERE workspace_id=?`, f.space.ID); got != 2 {
				t.Fatalf("memberships after refusal = %d, want 2", got)
			}
			if status := inviteStatus(t, f.db, "late-tightening@example.com"); status != "pending" {
				t.Fatalf("invite status = %q, want pending", status)
			}
		})
	}
}

// TestInviteAcceptanceRechecksInviterIdentity covers §5.5: the inviter may lose
// the account or the workspace role between issuing and acceptance.
func TestInviteAcceptanceRechecksInviterIdentity(t *testing.T) {
	t.Run("inviter disabled", func(t *testing.T) {
		f := newFixture(t)
		writeSiteSettings(t, f.db, "invite_only", true, true)
		inviter := f.addOwner("soon-disabled@example.com")
		_, token, err := f.core.CreateInvite(f.ctx, inviter.ID, f.space.ID, "orphan@example.com", "viewer")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.db.Exec(`UPDATE users SET disabled=1 WHERE id=?`, inviter.ID); err != nil {
			t.Fatal(err)
		}
		if _, _, err := f.core.AcceptInvite(f.ctx, token, "Orphan", "password123", nil); !errors.Is(err, ErrForbidden) {
			t.Fatalf("disabled inviter acceptance error = %v", err)
		}
		if got := countRows(t, f.db, `SELECT count(*) FROM users WHERE email='orphan@example.com'`); got != 0 {
			t.Fatalf("acceptance created %d users", got)
		}
		if status := inviteStatus(t, f.db, "orphan@example.com"); status != "pending" {
			t.Fatalf("invite status = %q, want pending", status)
		}
	})
	t.Run("inviter demoted", func(t *testing.T) {
		f := newFixture(t)
		writeSiteSettings(t, f.db, "invite_only", true, true)
		inviter := f.addOwner("soon-demoted@example.com")
		_, token, err := f.core.CreateInvite(f.ctx, inviter.ID, f.space.ID, "downgraded@example.com", "viewer")
		if err != nil {
			t.Fatal(err)
		}
		if err := f.core.UpdateMember(f.ctx, f.owner.ID, f.space.ID, inviter.ID, "editor"); err != nil {
			t.Fatal(err)
		}
		if _, _, err := f.core.AcceptInvite(f.ctx, token, "Downgraded", "password123", nil); !errors.Is(err, ErrForbidden) {
			t.Fatalf("demoted inviter acceptance error = %v", err)
		}
		if got := countRows(t, f.db, `SELECT count(*) FROM users WHERE email='downgraded@example.com'`); got != 0 {
			t.Fatalf("acceptance created %d users", got)
		}
	})
	t.Run("inviter removed", func(t *testing.T) {
		f := newFixture(t)
		writeSiteSettings(t, f.db, "invite_only", true, true)
		inviter := f.addOwner("soon-removed@example.com")
		_, token, err := f.core.CreateInvite(f.ctx, inviter.ID, f.space.ID, "abandoned@example.com", "viewer")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.db.Exec(`DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?`, f.space.ID, inviter.ID); err != nil {
			t.Fatal(err)
		}
		if _, _, err := f.core.AcceptInvite(f.ctx, token, "Abandoned", "password123", nil); !errors.Is(err, ErrForbidden) {
			t.Fatalf("removed inviter acceptance error = %v", err)
		}
		if got := countRows(t, f.db, `SELECT count(*) FROM users WHERE email='abandoned@example.com'`); got != 0 {
			t.Fatalf("acceptance created %d users", got)
		}
	})
}

// TestInviteTargetDisabledCannotAccept covers §5.5: presenting the token never
// re-enables a disabled account, and the invitation page cannot be reached by
// creating a membership for it.
func TestInviteTargetDisabledCannotAccept(t *testing.T) {
	f := newFixture(t)
	writeSiteSettings(t, f.db, "invite_only", true, true)
	target := f.addUser("blocked-member@example.com", "")
	_, token, err := f.core.CreateInvite(f.ctx, f.owner.ID, f.space.ID, target.Email, "editor")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`UPDATE users SET disabled=1 WHERE id=?`, target.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.core.CreateInvite(f.ctx, f.owner.ID, f.space.ID, target.Email, "editor"); !errors.Is(err, ErrInviteTargetDisabled) {
		t.Fatalf("inviting a disabled account again: %v", err)
	}
	if _, _, err := f.core.AcceptInvite(f.ctx, token, "Blocked", "password123", nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("disabled target acceptance error = %v", err)
	}
	if got := countRows(t, f.db, `SELECT count(*) FROM workspace_members WHERE user_id=?`, target.ID); got != 0 {
		t.Fatalf("disabled target gained %d memberships", got)
	}
	if status := inviteStatus(t, f.db, target.Email); status != "pending" {
		t.Fatalf("invite status = %q, want pending", status)
	}
}

// TestInviteAdmissionReflectsCurrentPolicy drives the invitation page flag.
func TestInviteAdmissionReflectsCurrentPolicy(t *testing.T) {
	tests := []struct {
		name string
		mode string
		// A mode that refuses new accounts can still carry invites addressed to
		// existing users; the page flag has to stay false for them too.
		inviteExisting bool
		allow          bool
		regular        bool
		wantCreate     bool
	}{
		{name: "closed", mode: "closed", inviteExisting: true, allow: true, wantCreate: false},
		{name: "administrator owner", mode: "invite_only", allow: false, wantCreate: true},
		{name: "restricted regular owner", mode: "invite_only", inviteExisting: true, allow: false, regular: true, wantCreate: false},
		{name: "permitted regular owner", mode: "invite_only", allow: true, regular: true, wantCreate: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			f := newFixture(t)
			writeSiteSettings(t, f.db, test.mode, test.allow, true)
			inviter := f.owner
			if test.regular {
				inviter = f.addOwner("admission-owner@example.com")
			}
			target := "admission@example.com"
			if test.inviteExisting {
				target = f.addUser("admission-existing@example.com", "").Email
			}
			_, token, err := f.core.CreateInvite(f.ctx, inviter.ID, f.space.ID, target, "viewer")
			if err != nil {
				t.Fatal(err)
			}
			invite, workspaceName, canCreate, err := f.core.InviteAdmission(f.ctx, token)
			if err != nil {
				t.Fatal(err)
			}
			if workspaceName != "Test" || invite.InviterID != inviter.ID || invite.Email != target || canCreate != test.wantCreate {
				t.Fatalf("admission = %#v/%q/%v, want %v", invite, workspaceName, canCreate, test.wantCreate)
			}
		})
	}
}

func TestInviteAdmissionFailsClosedOnCorruptSettings(t *testing.T) {
	f := newFixture(t)
	writeSiteSettings(t, f.db, "invite_only", true, true)
	_, token, err := f.core.CreateInvite(f.ctx, f.owner.ID, f.space.ID, "admission-corrupt@example.com", "viewer")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`UPDATE server_config SET value='{"registrationMode":"invite_only"}' WHERE key='site_settings'`); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := f.core.InviteAdmission(f.ctx, token); !errors.Is(err, site.ErrCorrupt) {
		t.Fatalf("InviteAdmission error = %v", err)
	}
	if _, _, err := f.core.CreateInvite(f.ctx, f.owner.ID, f.space.ID, "admission-later@example.com", "viewer"); !errors.Is(err, site.ErrCorrupt) {
		t.Fatalf("CreateInvite error = %v", err)
	}
}

// TestInviteAcceptanceSurvivesSingleConnection proves FAIL-03 for the new reads
// inside the acceptance transaction: everything must go through the same *sql.Tx
// because the pool hands out one connection at a time.
func TestInviteAcceptanceSurvivesSingleConnection(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	maxOpen := 1
	if got := conn.Stats().MaxOpenConnections; got != maxOpen {
		t.Fatalf("MaxOpenConnections = %d, want %d", got, maxOpen)
	}
	authService := auth.New(conn)
	owner, _, err := authService.SetupAdmin(context.Background(), "Owner", "owner@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	domain := New(conn, site.New(conn))
	space, err := domain.CreateWorkspace(context.Background(), owner.ID, "Test")
	if err != nil {
		t.Fatal(err)
	}
	writeSiteSettings(t, conn, "invite_only", true, true)
	_, token, err := domain.CreateInvite(context.Background(), owner.ID, space.ID, "single-connection@example.com", "viewer")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	go func() {
		_, _, err := domain.AcceptInvite(ctx, token, "Single", "password123", nil)
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("acceptance deadlocked or failed: %v", err)
		}
	case <-time.After(20 * time.Second):
		t.Fatal("AcceptInvite blocked instead of using the transaction handle")
	}
	var count int
	if err := conn.QueryRow(`SELECT count(*) FROM users WHERE email='single-connection@example.com'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("created users = %d err=%v", count, err)
	}
}
