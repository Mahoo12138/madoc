package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"madoc/internal/auth"
	"madoc/internal/site"
)

func adminUserID(t *testing.T, fixture *adminSettingsFixture) string {
	t.Helper()
	var id string
	if err := fixture.db.QueryRow(`SELECT id FROM users WHERE is_admin=1`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func setOwnerInvites(t *testing.T, fixture *adminSettingsFixture, allow bool) {
	t.Helper()
	settings, err := fixture.site.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	_, err = fixture.site.Update(context.Background(), site.Actor{ID: adminUserID(t, fixture), IsAdmin: true, CanCreateWorkspace: true}, settings.Revision, map[string]json.RawMessage{
		"allowWorkspaceOwnerInviteNewUsers": json.RawMessage(strconv.FormatBool(allow)),
	})
	if err != nil {
		t.Fatal(err)
	}
}

func setRegistrationMode(t *testing.T, fixture *adminSettingsFixture, mode string) {
	t.Helper()
	settings, err := fixture.site.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	_, err = fixture.site.Update(context.Background(), site.Actor{ID: adminUserID(t, fixture), IsAdmin: true, CanCreateWorkspace: true}, settings.Revision, map[string]json.RawMessage{
		"registrationMode": json.RawMessage(`"` + mode + `"`),
	})
	if err != nil {
		t.Fatal(err)
	}
}

// addWorkspaceOwner creates a regular user who owns their own workspace. It is
// the only way to exercise the owner path without the administrator exemption
// that the fixture's setup account carries.
func addWorkspaceOwner(t *testing.T, fixture *adminSettingsFixture) (string, string, string) {
	t.Helper()
	ctx := context.Background()
	id := uuid.NewString()
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if _, err := fixture.db.Exec(`INSERT INTO users(id,name,email,password_hash,can_create_workspace,created_at,updated_at) VALUES(?,?,?,?,1,?,?)`, id, "Owner", id+"@example.test", hash, now, now); err != nil {
		t.Fatal(err)
	}
	workspace, err := fixture.domain.CreateWorkspace(ctx, id, "Owned")
	if err != nil {
		t.Fatal(err)
	}
	session, err := fixture.identity.CreateSession(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	return id, workspace.ID, session
}

func addMemberUser(t *testing.T, fixture *adminSettingsFixture) string {
	t.Helper()
	id := uuid.NewString()
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	email := id + "@example.test"
	now := time.Now().UTC()
	if _, err := fixture.db.Exec(`INSERT INTO users(id,name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)`, id, "Member", email, hash, now, now); err != nil {
		t.Fatal(err)
	}
	return email
}

func inviteCount(t *testing.T, fixture *adminSettingsFixture) int {
	t.Helper()
	var count int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM workspace_invites`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestSiteInfoIsAnonymousAndMinimal(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	response := fixture.request(http.MethodGet, "/site", "", "", false)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	keys := make([]string, 0, len(body))
	for key := range body {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	if strings.Join(keys, ",") != "publicRegistrationAvailable,registrationMode" {
		t.Fatalf("response keys = %v body=%s", keys, response.Body.String())
	}
	var info struct {
		RegistrationMode            string `json:"registrationMode"`
		PublicRegistrationAvailable bool   `json:"publicRegistrationAvailable"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	if info.RegistrationMode != "invite_only" || info.PublicRegistrationAvailable {
		t.Fatalf("site info = %#v, want invite_only/false", info)
	}
	for _, leaked := range []string{"inviteDefaultCanCreateWorkspace", "allowWorkspaceOwner", "server_config", "origin", "revision", "upgradedInstance", "secret", "smtp", "dataDir"} {
		if strings.Contains(response.Body.String(), leaked) {
			t.Fatalf("public response leaked %q: %s", leaked, response.Body.String())
		}
	}
}

func TestSiteInfoReportsStoredMode(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	setRegistrationMode(t, fixture, "closed")
	response := fixture.request(http.MethodGet, "/site", "", "", false)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var info struct {
		RegistrationMode            string `json:"registrationMode"`
		PublicRegistrationAvailable bool   `json:"publicRegistrationAvailable"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	if info.RegistrationMode != "closed" || info.PublicRegistrationAvailable {
		t.Fatalf("site info = %#v", info)
	}
}

// TestSiteInfoFailsClosed proves the anonymous endpoint never repairs a broken
// document and never advertises registration on its own: falling back to a
// default would tell visitors that accounts are available when no write path
// can actually create one.
func TestSiteInfoFailsClosed(t *testing.T) {
	t.Run("missing document is not created", func(t *testing.T) {
		fixture := newAdminSettingsFixture(t)
		if _, err := fixture.db.Exec(`DELETE FROM server_config WHERE key='site_settings'`); err != nil {
			t.Fatal(err)
		}
		response := fixture.request(http.MethodGet, "/site", "", "", false)
		assertAPIError(t, response, http.StatusInternalServerError, "INTERNAL")
		var count int
		if err := fixture.db.QueryRow(`SELECT count(*) FROM server_config WHERE key='site_settings'`).Scan(&count); err != nil || count != 0 {
			t.Fatalf("anonymous GET initialized settings: count=%d err=%v", count, err)
		}
	})
	t.Run("corrupt document", func(t *testing.T) {
		fixture := newAdminSettingsFixture(t)
		if _, err := fixture.db.Exec(`UPDATE server_config SET value='{}' WHERE key='site_settings'`); err != nil {
			t.Fatal(err)
		}
		assertAPIError(t, fixture.request(http.MethodGet, "/site", "", "", false), http.StatusInternalServerError, "INTERNAL")
	})
	t.Run("stored open mode is never served", func(t *testing.T) {
		fixture := newAdminSettingsFixture(t)
		if _, err := fixture.db.Exec(`UPDATE server_config SET value=? WHERE key='site_settings'`, storedOpenSiteSettings); err != nil {
			t.Fatal(err)
		}
		response := fixture.request(http.MethodGet, "/site", "", "", false)
		assertAPIError(t, response, http.StatusInternalServerError, "INTERNAL")
		if strings.Contains(response.Body.String(), "open") {
			t.Fatalf("response leaked the unusable mode: %s", response.Body.String())
		}
	})
}

// TestCreateInviteHTTPRestrictsNewUsers is INVITE-03 over HTTP: a regular owner
// without the new-user switch loses those invitations but keeps the ability to
// invite accounts that already exist.
func TestCreateInviteHTTPRestrictsNewUsers(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	_, workspaceID, ownerSession := addWorkspaceOwner(t, fixture)
	// The new-install default already forbids regular owners from introducing
	// new users, so this needs no extra change to show the verdict.
	response := fixture.request(http.MethodPost, "/workspaces/"+workspaceID+"/invites", `{"email":"stranger@example.test","role":"viewer"}`, ownerSession, true)
	assertAPIError(t, response, http.StatusForbidden, "INVITE_NEW_USER_DENIED")
	if got := inviteCount(t, fixture); got != 0 {
		t.Fatalf("denied invite stored %d rows", got)
	}
	member := addMemberUser(t, fixture)
	allowed := fixture.request(http.MethodPost, "/workspaces/"+workspaceID+"/invites", `{"email":"`+member+`","role":"viewer"}`, ownerSession, true)
	if allowed.Code != http.StatusCreated {
		t.Fatalf("existing account invite status=%d body=%s", allowed.Code, allowed.Body.String())
	}
	if got := inviteCount(t, fixture); got != 1 {
		t.Fatalf("invites = %d, want 1", got)
	}
}

// TestCreateInviteHTTPClosedRegistration covers the closed row of §5.1,
// including that owning a workspace as an administrator grants no exemption.
func TestCreateInviteHTTPClosedRegistration(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	_, workspaceID, ownerSession := addWorkspaceOwner(t, fixture)
	setRegistrationMode(t, fixture, "closed")
	response := fixture.request(http.MethodPost, "/workspaces/"+workspaceID+"/invites", `{"email":"closed-out@example.test","role":"viewer"}`, ownerSession, true)
	assertAPIError(t, response, http.StatusForbidden, "REGISTRATION_CLOSED")
	adminWorkspace, err := fixture.domain.CreateWorkspace(context.Background(), adminUserID(t, fixture), "Admin owned")
	if err != nil {
		t.Fatal(err)
	}
	adminAttempt := fixture.request(http.MethodPost, "/workspaces/"+adminWorkspace.ID+"/invites", `{"email":"closed-admin-out@example.test","role":"viewer"}`, fixture.adminSession, true)
	assertAPIError(t, adminAttempt, http.StatusForbidden, "REGISTRATION_CLOSED")
	if got := inviteCount(t, fixture); got != 0 {
		t.Fatalf("closed mode stored %d invite rows", got)
	}
}

func TestCreateInviteHTTPRefusesDisabledTarget(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	_, workspaceID, ownerSession := addWorkspaceOwner(t, fixture)
	target := addMemberUser(t, fixture)
	if _, err := fixture.db.Exec(`UPDATE users SET disabled=1 WHERE email=?`, target); err != nil {
		t.Fatal(err)
	}
	response := fixture.request(http.MethodPost, "/workspaces/"+workspaceID+"/invites", `{"email":"`+target+`","role":"viewer"}`, ownerSession, true)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != "FORBIDDEN" || !strings.Contains(body.Error.Message, "禁用") {
		t.Fatalf("disabled target response = %#v", body.Error)
	}
	if got := inviteCount(t, fixture); got != 0 {
		t.Fatalf("disabled target invite stored %d rows", got)
	}
}

// TestAcceptInviteHTTPExplainsRefusal locks the contract the invitation page
// relies on: acceptance refusals carry a Chinese, user-facing message and a
// stable code, never an internal identifier.
func TestAcceptInviteHTTPExplainsRefusal(t *testing.T) {
	tests := []struct {
		name    string
		mode    string
		owner   bool
		wantErr string
	}{
		{name: "closed", mode: "closed", wantErr: "REGISTRATION_CLOSED"},
		{name: "owner switch off", mode: "invite_only", owner: true, wantErr: "INVITE_NEW_USER_DENIED"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			fixture := newAdminSettingsFixture(t)
			workspaceID := ""
			if test.owner {
				_, workspaceID, _ = addWorkspaceOwner(t, fixture)
			} else {
				adminWorkspace, err := fixture.domain.CreateWorkspace(context.Background(), adminUserID(t, fixture), "Owned")
				if err != nil {
					t.Fatal(err)
				}
				workspaceID = adminWorkspace.ID
			}
			inviter := fixture.adminSession
			if test.owner {
				// The workspace and its inviter come from one call: a second
				// user would not own the first one's workspace. Owners start
				// permitted so the invite can be issued at all.
				setOwnerInvites(t, fixture, true)
				_, workspaceID, inviter = addWorkspaceOwner(t, fixture)
			}
			created := fixture.request(http.MethodPost, "/workspaces/"+workspaceID+"/invites", `{"email":"accept-refusal@example.test","role":"viewer"}`, inviter, true)
			if created.Code != http.StatusCreated {
				t.Fatalf("invite status=%d body=%s", created.Code, created.Body.String())
			}
			var issued struct {
				Token string `json:"token"`
			}
			if err := json.Unmarshal(created.Body.Bytes(), &issued); err != nil {
				t.Fatal(err)
			}
			if test.mode == "closed" {
				setRegistrationMode(t, fixture, "closed")
			} else {
				setOwnerInvites(t, fixture, false)
			}
			// The invite was issued while the policy allowed it: acceptance must
			// re-read the policy instead of trusting that snapshot.
			response := fixture.request(http.MethodPost, "/invites/"+issued.Token+"/accept", `{"name":"Refused","password":"password123"}`, "", false)
			if response.Code != http.StatusForbidden {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
			var body struct {
				Error struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Error.Code != test.wantErr {
				t.Fatalf("error code = %q, want %q", body.Error.Code, test.wantErr)
			}
			if !strings.ContainsAny(body.Error.Message, "当前策略") {
				t.Fatalf("acceptance message is not user facing: %q", body.Error.Message)
			}
			var count int
			if err := fixture.db.QueryRow(`SELECT count(*) FROM users WHERE email='accept-refusal@example.test'`).Scan(&count); err != nil || count != 0 {
				t.Fatalf("refused acceptance created %d users err=%v", count, err)
			}
		})
	}
}

// TestInspectInviteHTTPReportsAdmission drives the invitation page choice
// between "register and join" and "no new accounts may be created".
func TestInspectInviteHTTPReportsAdmission(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	adminWorkspace, err := fixture.domain.CreateWorkspace(context.Background(), adminUserID(t, fixture), "Owned")
	if err != nil {
		t.Fatal(err)
	}
	created := fixture.request(http.MethodPost, "/workspaces/"+adminWorkspace.ID+"/invites", `{"email":"admission@example.test","role":"viewer"}`, fixture.adminSession, true)
	if created.Code != http.StatusCreated {
		t.Fatalf("administrator invite status=%d body=%s", created.Code, created.Body.String())
	}
	var issued struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &issued); err != nil {
		t.Fatal(err)
	}
	// Administrators may introduce new users even while the owner switch is off,
	// and the page has to learn that without another round trip.
	open := fixture.request(http.MethodGet, "/invites/"+issued.Token, "", "", false)
	if open.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", open.Code, open.Body.String())
	}
	var before struct {
		WorkspaceName    string `json:"workspaceName"`
		CanCreateAccount bool   `json:"canCreateAccount"`
		Invite           struct {
			ID        string `json:"id"`
			InviterID string `json:"inviterId"`
		} `json:"invite"`
	}
	if err := json.Unmarshal(open.Body.Bytes(), &before); err != nil {
		t.Fatal(err)
	}
	if before.WorkspaceName != "Owned" || !before.CanCreateAccount || before.Invite.InviterID != adminUserID(t, fixture) {
		t.Fatalf("invite admission = %#v", before)
	}
	setRegistrationMode(t, fixture, "closed")
	closed := fixture.request(http.MethodGet, "/invites/"+issued.Token, "", "", false)
	if closed.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", closed.Code, closed.Body.String())
	}
	var after struct {
		CanCreateAccount bool `json:"canCreateAccount"`
	}
	if err := json.Unmarshal(closed.Body.Bytes(), &after); err != nil {
		t.Fatal(err)
	}
	if after.CanCreateAccount {
		t.Fatalf("closed mode still offers account creation: %s", closed.Body.String())
	}
}
