package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"madoc/internal/account"
	"madoc/internal/asset"
	"madoc/internal/auth"
	"madoc/internal/core"
	"madoc/internal/db"
	"madoc/internal/site"
)

func TestAdminSettingsHTTPAuthorizationAndInitialization(t *testing.T) {
	t.Run("unauthenticated", func(t *testing.T) {
		fixture := newAdminSettingsFixture(t)
		response := fixture.request(http.MethodGet, "/admin/settings", "", "", false)
		assertAPIError(t, response, http.StatusUnauthorized, "UNAUTHORIZED")
	})
	t.Run("non-admin does not initialize", func(t *testing.T) {
		fixture := newAdminSettingsFixture(t)
		if _, err := fixture.db.Exec(`DELETE FROM server_config WHERE key='site_settings'`); err != nil {
			t.Fatal(err)
		}
		session := fixture.addUserSession(t, false)
		response := fixture.request(http.MethodGet, "/admin/settings", "", session, false)
		assertAPIError(t, response, http.StatusForbidden, "ADMIN_REQUIRED")
		var count int
		if err := fixture.db.QueryRow(`SELECT count(*) FROM server_config WHERE key='site_settings'`).Scan(&count); err != nil || count != 0 {
			t.Fatalf("non-admin initialized settings: count=%d err=%v", count, err)
		}
	})
	t.Run("administrator", func(t *testing.T) {
		fixture := newAdminSettingsFixture(t)
		response := fixture.request(http.MethodGet, "/admin/settings", "", fixture.adminSession, false)
		if response.Code != http.StatusOK {
			t.Fatalf("GET status=%d body=%s", response.Code, response.Body.String())
		}
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
		}
		var settings site.Settings
		if err := json.Unmarshal(response.Body.Bytes(), &settings); err != nil {
			t.Fatal(err)
		}
		if settings.SchemaVersion != 1 || settings.Revision != 0 || settings.UpdatedAt == "" || !settings.Implemented[site.KeyInviteDefaultCanCreateWorkspace] {
			t.Fatalf("GET settings = %#v", settings)
		}
	})
}

func TestSessionAndMeExposeMatchingCapabilities(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	sessionResponse := fixture.request(http.MethodGet, "/auth/session", "", fixture.adminSession, false)
	meResponse := fixture.request(http.MethodGet, "/me", "", fixture.adminSession, false)
	if sessionResponse.Code != http.StatusOK || meResponse.Code != http.StatusOK {
		t.Fatalf("session/me status = %d/%d", sessionResponse.Code, meResponse.Code)
	}
	var sessionBody struct {
		User auth.User `json:"user"`
	}
	var me auth.User
	if err := json.Unmarshal(sessionResponse.Body.Bytes(), &sessionBody); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(meResponse.Body.Bytes(), &me); err != nil {
		t.Fatal(err)
	}
	if sessionBody.User.Capabilities != me.Capabilities || !me.Capabilities.CanManageSite || !me.Capabilities.CanCreateWorkspace {
		t.Fatalf("session/me capabilities = %#v/%#v", sessionBody.User.Capabilities, me.Capabilities)
	}
}

func TestAdminSettingsHTTPValidationConflictAndReadiness(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		status int
		code   string
	}{
		{name: "bad request", body: `{"expectedRevision":0,"changes":{"inviteDefaultCanCreateWorkspace":"true"}}`, status: http.StatusBadRequest, code: "INVALID_REQUEST"},
		{name: "revision conflict", body: `{"expectedRevision":9,"changes":{"inviteDefaultCanCreateWorkspace":true}}`, status: http.StatusConflict, code: "REVISION_CONFLICT"},
		{name: "registration not ready", body: `{"expectedRevision":0,"changes":{"registrationMode":"open"}}`, status: http.StatusUnprocessableEntity, code: "REGISTRATION_NOT_READY"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			fixture := newAdminSettingsFixture(t)
			response := fixture.request(http.MethodPatch, "/admin/settings", test.body, fixture.adminSession, true)
			assertAPIError(t, response, test.status, test.code)
		})
	}
}

const storedOpenSiteSettings = `{"schemaVersion":1,"revision":0,"registrationMode":"open","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false,"origin":"new"}`

func TestAdminSettingsHTTPStoredOpenRegistrationIsInternalError(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	if _, err := fixture.db.Exec(`UPDATE server_config SET value=? WHERE key='site_settings'`, storedOpenSiteSettings); err != nil {
		t.Fatal(err)
	}
	// GET must not render a stored mode that no write path can produce: doing so
	// would show the page a value whose "retry" can never succeed.
	read := fixture.request(http.MethodGet, "/admin/settings", "", fixture.adminSession, false)
	assertAPIError(t, read, http.StatusInternalServerError, "INTERNAL")
	if strings.Contains(read.Body.String(), "open") {
		t.Fatalf("GET leaked the stored open mode: %s", read.Body.String())
	}
	// An unrelated change must surface as a corrupt-document failure, not as the
	// 422 that only a requested switch to "open" is allowed to produce, and the
	// stored document must survive untouched.
	for _, body := range []string{
		`{"expectedRevision":0,"changes":{"inviteDefaultCanCreateWorkspace":true}}`,
		`{"expectedRevision":0,"changes":{"registrationMode":"invite_only"}}`,
	} {
		response := fixture.request(http.MethodPatch, "/admin/settings", body, fixture.adminSession, true)
		assertAPIError(t, response, http.StatusInternalServerError, "INTERNAL")
	}
	var raw string
	if err := fixture.db.QueryRow(`SELECT value FROM server_config WHERE key='site_settings'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if raw != storedOpenSiteSettings {
		t.Fatalf("stored document was rewritten: %s", raw)
	}
	var count int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM admin_audit_events`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rejected update wrote audit rows: count=%d err=%v", count, err)
	}
}

func TestAdminSettingsHTTPSavesAuditedWhitelist(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	body := `{"expectedRevision":0,"changes":{"inviteDefaultCanCreateWorkspace":true}}`
	response := fixture.request(http.MethodPatch, "/admin/settings", body, fixture.adminSession, true)
	if response.Code != http.StatusOK {
		t.Fatalf("PATCH status=%d body=%s", response.Code, response.Body.String())
	}
	var settings site.Settings
	if err := json.Unmarshal(response.Body.Bytes(), &settings); err != nil {
		t.Fatal(err)
	}
	if settings.Revision != 1 || !settings.InviteDefaultCanCreateWorkspace {
		t.Fatalf("PATCH settings = %#v", settings)
	}
	var count int
	var action, targetType, targetID, changes string
	var requestID sql.NullString
	if err := fixture.db.QueryRow(`SELECT count(*),action,target_type,target_id,changes_json,request_id FROM admin_audit_events`).Scan(&count, &action, &targetType, &targetID, &changes, &requestID); err != nil {
		t.Fatal(err)
	}
	if count != 1 || action != site.ActionSettingsChanged || targetType != "site_settings" || targetID != "site_settings" || requestID.Valid {
		t.Fatalf("audit metadata count=%d action=%q target=%q/%q request=%#v", count, action, targetType, targetID, requestID)
	}
	if changes != `{"inviteDefaultCanCreateWorkspace":{"from":false,"to":true}}` {
		t.Fatalf("audit changes = %s", changes)
	}
}

func TestAdminSettingsHTTPConcurrentPatch(t *testing.T) {
	fixture := newAdminSettingsFixture(t)
	start := make(chan struct{})
	statuses := make(chan int, 2)
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			response := fixture.request(http.MethodPatch, "/admin/settings", `{"expectedRevision":0,"changes":{"inviteDefaultCanCreateWorkspace":true}}`, fixture.adminSession, true)
			statuses <- response.Code
		}()
	}
	close(start)
	workers.Wait()
	close(statuses)
	actual := make([]int, 0, 2)
	for status := range statuses {
		actual = append(actual, status)
	}
	sort.Ints(actual)
	want := []int{http.StatusOK, http.StatusConflict}
	if len(actual) != len(want) || actual[0] != want[0] || actual[1] != want[1] {
		t.Fatalf("concurrent PATCH statuses = %v, want %v", actual, want)
	}
	var auditCount int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM admin_audit_events`).Scan(&auditCount); err != nil || auditCount != 1 {
		t.Fatalf("concurrent audit count=%d err=%v", auditCount, err)
	}
}

type adminSettingsFixture struct {
	t            *testing.T
	db           *sql.DB
	handler      http.Handler
	identity     *auth.Service
	csrf         *auth.CSRF
	adminSession string
	csrfCookie   *http.Cookie
	csrfToken    string
}

func newAdminSettingsFixture(t *testing.T) *adminSettingsFixture {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Open(filepath.Join(t.TempDir(), "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	identity := auth.New(conn)
	admin, session, err := identity.SetupAdmin(ctx, "Admin", "admin@example.test", "password123")
	if err != nil {
		t.Fatal(err)
	}
	if !admin.IsAdmin {
		t.Fatal("setup user is not an administrator")
	}
	siteStore := site.New(conn)
	domain := core.New(conn, siteStore)
	csrf := auth.NewCSRF([]byte("admin-settings-test-secret"))
	cookieRecorder := httptest.NewRecorder()
	csrfToken, err := csrf.Issue(cookieRecorder, false)
	if err != nil {
		t.Fatal(err)
	}
	cookies := cookieRecorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("CSRF cookies = %d", len(cookies))
	}
	assetRoot := t.TempDir()
	handler := New(identity, csrf, domain, siteStore, asset.New(conn, domain, assetRoot, 25), account.New(conn, assetRoot), nil, false).Routes()
	return &adminSettingsFixture{t: t, db: conn, handler: handler, identity: identity, csrf: csrf, adminSession: session, csrfCookie: cookies[0], csrfToken: csrfToken}
}

func (fixture *adminSettingsFixture) addUserSession(t *testing.T, admin bool) string {
	t.Helper()
	id := uuid.NewString()
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec(`INSERT INTO users(id,name,email,password_hash,is_admin,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, id, "User", id+"@example.test", hash, admin, time.Now().UTC(), time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	session, err := fixture.identity.CreateSession(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return session
}

func (fixture *adminSettingsFixture) request(method, path, body, session string, withCSRF bool) *httptest.ResponseRecorder {
	fixture.t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	if session != "" {
		request.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: session})
	}
	if withCSRF {
		request.AddCookie(fixture.csrfCookie)
		request.Header.Set(auth.CSRFHeader, fixture.csrfToken)
	}
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	fixture.handler.ServeHTTP(response, request)
	return response
}

func assertAPIError(t *testing.T, response *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status=%d body=%s, want %d", response.Code, response.Body.String(), status)
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != code {
		t.Fatalf("error code=%q body=%s, want %q", body.Error.Code, response.Body.String(), code)
	}
}
