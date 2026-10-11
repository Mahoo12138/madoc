package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sort"
	"strconv"
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

// roomSpy records realtime revocations so a test can prove the API asked the
// hub to drop a user's connections after the database change committed.
type roomSpy struct {
	mu       sync.Mutex
	revoked  []string
	sessions []string
}

func (s *roomSpy) Active(string) bool    { return false }
func (s *roomSpy) RefreshUser(auth.User) {}
func (s *roomSpy) RevokeOtherSessions(userID, keepSession string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revoked = append(s.revoked, userID+"|"+keepSession)
}
func (s *roomSpy) RevokeSession(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions = append(s.sessions, sessionID)
}
func (s *roomSpy) revocations() []string {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.revoked...)
}

type adminUsersFixture struct {
	t            *testing.T
	db           *sql.DB
	handler      http.Handler
	identity     *auth.Service
	site         *site.Store
	domain       *core.Service
	adminID      string
	adminSession string
	csrfCookie   *http.Cookie
	csrfToken    string
	rooms        *roomSpy
}

func newAdminUsersFixture(t *testing.T) *adminUsersFixture {
	t.Helper()
	return newAdminUsersFixtureWithRealtime(t, &roomSpy{})
}

// newAdminUsersFixtureWithRealtime builds the same fixture but lets a test swap
// the hub, including nil, to prove a missing revocation channel is reported
// instead of being silently swallowed.
func newAdminUsersFixtureWithRealtime(t *testing.T, realtime RoomInspector) *adminUsersFixture {
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
	siteStore := site.New(conn)
	csrf := auth.NewCSRF([]byte("admin-users-test-secret"))
	recorder := httptest.NewRecorder()
	csrfToken, err := csrf.Issue(recorder, false)
	if err != nil {
		t.Fatal(err)
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("CSRF cookies = %d", len(cookies))
	}
	assetRoot := t.TempDir()
	domain := core.New(conn, siteStore)
	handler := New(identity, csrf, domain, siteStore, asset.New(conn, domain, assetRoot, 25), account.New(conn, assetRoot), realtime, false).Routes()
	spy, _ := realtime.(*roomSpy)
	return &adminUsersFixture{
		t: t, db: conn, handler: handler, identity: identity, site: siteStore, domain: domain,
		adminID: admin.ID, adminSession: session, csrfCookie: cookies[0], csrfToken: csrfToken, rooms: spy,
	}
}

// addUser inserts an account with the legacy defaults an upgraded instance has
// and returns its id.
func (f *adminUsersFixture) addUser(name, email string, isAdmin bool, createdAt string) string {
	f.t.Helper()
	id := uuid.NewString()
	hash, err := auth.HashPassword("password123")
	if err != nil {
		f.t.Fatal(err)
	}
	if _, err := f.db.Exec(`INSERT INTO users(id,name,email,password_hash,is_admin,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
		id, name, email, hash, boolInt(isAdmin), createdAt, createdAt); err != nil {
		f.t.Fatal(err)
	}
	return id
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func (f *adminUsersFixture) sessionFor(userID string) string {
	f.t.Helper()
	session, err := f.identity.CreateSession(context.Background(), userID)
	if err != nil {
		f.t.Fatal(err)
	}
	return session
}

func (f *adminUsersFixture) request(method, path, body, session string, withCSRF bool) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.requestWithContext(context.Background(), method, path, body, session, withCSRF)
}

func (f *adminUsersFixture) requestWithContext(ctx context.Context, method, path, body, session string, withCSRF bool) *httptest.ResponseRecorder {
	f.t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(ctx)
	if session != "" {
		request.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: session})
	}
	if withCSRF {
		request.AddCookie(f.csrfCookie)
		request.Header.Set(auth.CSRFHeader, f.csrfToken)
	}
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	f.handler.ServeHTTP(response, request)
	return response
}

type userRow struct {
	isAdmin   bool
	disabled  bool
	canCreate bool
	revision  int
}

func (f *adminUsersFixture) userRow(userID string) userRow {
	f.t.Helper()
	var row userRow
	var admin, disabled, canCreate int
	if err := f.db.QueryRow(`SELECT is_admin,disabled,can_create_workspace,admin_revision FROM users WHERE id=?`, userID).
		Scan(&admin, &disabled, &canCreate, &row.revision); err != nil {
		f.t.Fatal(err)
	}
	row.isAdmin, row.disabled, row.canCreate = admin != 0, disabled != 0, canCreate != 0
	return row
}

func (f *adminUsersFixture) sessionCount(userID string) int {
	f.t.Helper()
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM sessions WHERE user_id=?`, userID).Scan(&count); err != nil {
		f.t.Fatal(err)
	}
	return count
}

type auditRow struct {
	action   string
	targetID string
	changes  string
}

func (f *adminUsersFixture) auditRows() []auditRow {
	f.t.Helper()
	rows, err := f.db.Query(`SELECT action,target_id,changes_json FROM admin_audit_events ORDER BY id`)
	if err != nil {
		f.t.Fatal(err)
	}
	defer rows.Close()
	result := []auditRow{}
	for rows.Next() {
		var row auditRow
		if err := rows.Scan(&row.action, &row.targetID, &row.changes); err != nil {
			f.t.Fatal(err)
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		f.t.Fatal(err)
	}
	return result
}

func (f *adminUsersFixture) patchUser(userID string, revision int, changes string) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.patchUserAs(f.adminSession, userID, revision, changes)
}

func (f *adminUsersFixture) patchUserAs(session, userID string, revision int, changes string) *httptest.ResponseRecorder {
	f.t.Helper()
	body := `{"expectedRevision":` + strconv.Itoa(revision) + `,"changes":` + changes + `}`
	return f.request(http.MethodPatch, "/admin/users/"+userID, body, session, true)
}

// TestAdminUsersRequireActiveAdministrator proves the middleware verdict is not
// cosmetic: a non-administrator leaves every row untouched.
func TestAdminUsersRequireActiveAdministrator(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	member := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	memberSession := fixture.sessionFor(member)
	before := fixture.userRow(member)
	if got := fixture.sessionCount(member); got != 1 {
		t.Fatalf("member sessions = %d", got)
	}

	for _, path := range []struct{ method, path string }{
		{http.MethodGet, "/admin/users"},
		{http.MethodGet, "/admin/users/" + member},
		{http.MethodPatch, "/admin/users/" + member},
		{http.MethodDelete, "/admin/users/" + member + "/sessions"},
	} {
		response := fixture.request(path.method, path.path, `{"expectedRevision":0,"changes":{"disabled":true}}`, memberSession, true)
		assertAPIError(t, response, http.StatusForbidden, "ADMIN_REQUIRED")
	}
	after := fixture.userRow(member)
	if before != after {
		t.Fatalf("member row changed: %#v -> %#v", before, after)
	}
	if got := fixture.sessionCount(member); got != 1 {
		t.Fatalf("member sessions after rejected requests = %d", got)
	}
	if rows := fixture.auditRows(); len(rows) != 0 {
		t.Fatalf("rejected requests wrote audit rows: %#v", rows)
	}
	if got := fixture.rooms.revocations(); len(got) != 0 {
		t.Fatalf("rejected requests revoked realtime sessions: %v", got)
	}
}

// TestAdminUserDisableThenEnableDropsSessions covers USER-01: disabling kills
// every session, re-enabling does not resurrect them, and the account can sign
// in again afterwards.
func TestAdminUserDisableThenEnableDropsSessions(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	oldSession := fixture.sessionFor(target)
	if _, err := fixture.identity.Resolve(context.Background(), oldSession); err != nil {
		t.Fatalf("session should resolve before disabling: %v", err)
	}

	response := fixture.patchUser(target, 0, `{"disabled":true}`)
	if response.Code != http.StatusOK {
		t.Fatalf("disable status=%d body=%s", response.Code, response.Body.String())
	}
	var disabled site.AdminUser
	if err := json.Unmarshal(response.Body.Bytes(), &disabled); err != nil {
		t.Fatal(err)
	}
	if !disabled.Disabled || disabled.Revision != 1 || disabled.EffectiveCanCreateWorkspace {
		t.Fatalf("disable response = %#v", disabled)
	}
	if row := fixture.userRow(target); !row.disabled || row.revision != 1 {
		t.Fatalf("users row after disable = %#v", row)
	}
	if got := fixture.sessionCount(target); got != 0 {
		t.Fatalf("sessions survived disabling: %d", got)
	}
	if _, err := fixture.identity.Resolve(context.Background(), oldSession); err == nil {
		t.Fatal("old session still resolves after disabling")
	}
	if got := fixture.rooms.revocations(); len(got) != 1 || got[0] != target+"|" {
		t.Fatalf("realtime revocations = %v, want one for %s", got, target)
	}
	rows := fixture.auditRows()
	if len(rows) != 1 || rows[0].action != site.ActionUserDisabled || rows[0].targetID != target {
		t.Fatalf("audit rows = %#v", rows)
	}
	if rows[0].changes != `{"disabled":{"from":false,"to":true},"sessionsRevoked":1}` {
		t.Fatalf("audit changes = %s", rows[0].changes)
	}

	enabled := fixture.patchUser(target, 1, `{"disabled":false}`)
	if enabled.Code != http.StatusOK {
		t.Fatalf("enable status=%d body=%s", enabled.Code, enabled.Body.String())
	}
	if row := fixture.userRow(target); row.disabled || row.revision != 2 {
		t.Fatalf("users row after enable = %#v", row)
	}
	// Re-enabling restores the ability to sign in, never the old session.
	if got := fixture.sessionCount(target); got != 0 {
		t.Fatalf("old session resurrected: %d", got)
	}
	if _, err := fixture.identity.Resolve(context.Background(), oldSession); err == nil {
		t.Fatal("old session resurrected after re-enabling")
	}
	if _, _, err := fixture.identity.SignIn(context.Background(), "member@example.test", "password123"); err != nil {
		t.Fatalf("sign in after re-enabling failed: %v", err)
	}
	if rows := fixture.auditRows(); len(rows) != 2 || rows[1].action != site.ActionUserEnabled || rows[1].changes != `{"disabled":{"from":true,"to":false}}` {
		t.Fatalf("audit rows after enable = %#v", rows)
	}
}

// TestAdminUserSoleOwnerRiskWarnsWithoutBlocking covers USER-02: the drawer
// reports the risk, disabling still works, and nothing is transferred.
func TestAdminUserSoleOwnerRiskWarnsWithoutBlocking(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	sole := fixture.addUser("Sole", "sole@example.test", false, "2026-01-01T00:00:00Z")
	other := fixture.addUser("Other", "other@example.test", false, "2026-01-02T00:00:00Z")
	fixture.privateWorkspace(sole)
	shared := fixture.privateWorkspace(sole)
	if _, err := fixture.db.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,'owner',?)`, shared, other, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}

	response := fixture.request(http.MethodGet, "/admin/users/"+sole, "", fixture.adminSession, false)
	if response.Code != http.StatusOK {
		t.Fatalf("detail status=%d body=%s", response.Code, response.Body.String())
	}
	var detail site.AdminUserDetail
	if err := json.Unmarshal(response.Body.Bytes(), &detail); err != nil {
		t.Fatal(err)
	}
	if detail.Stats.MemberWorkspaces != 2 || detail.Stats.OwnedWorkspaces != 2 || !detail.Stats.SoleOwnerRisk {
		t.Fatalf("sole owner stats = %#v", detail.Stats)
	}
	// Private content stays out of the management payload.
	if strings.Contains(response.Body.String(), "private") {
		t.Fatalf("detail leaked workspace content: %s", response.Body.String())
	}
	var sharedDetail site.AdminUserDetail
	sharedResponse := fixture.request(http.MethodGet, "/admin/users/"+other, "", fixture.adminSession, false)
	if err := json.Unmarshal(sharedResponse.Body.Bytes(), &sharedDetail); err != nil {
		t.Fatal(err)
	}
	if sharedDetail.Stats.SoleOwnerRisk {
		t.Fatalf("shared workspace reported as sole owner risk: %#v", sharedDetail.Stats)
	}
	// A co-owner who cannot sign in does not remove the risk: the workspace
	// would have nobody able to manage it once this account is disabled. The
	// pair below is isolated so the verdict cannot come from another workspace.
	risky := fixture.addUser("Risky", "risky@example.test", false, "2026-01-03T00:00:00Z")
	backup := fixture.addUser("Backup", "backup@example.test", false, "2026-01-04T00:00:00Z")
	fixture.workspaceWithOwners(risky, risky, backup)
	riskOf := func(userID string) site.AdminUserStats {
		t.Helper()
		response := fixture.request(http.MethodGet, "/admin/users/"+userID, "", fixture.adminSession, false)
		if response.Code != http.StatusOK {
			t.Fatalf("detail status=%d body=%s", response.Code, response.Body.String())
		}
		var detail site.AdminUserDetail
		if err := json.Unmarshal(response.Body.Bytes(), &detail); err != nil {
			t.Fatal(err)
		}
		return detail.Stats
	}
	if riskOf(risky).SoleOwnerRisk {
		t.Fatal("a workspace with an enabled co-owner was reported as sole owner risk")
	}
	if _, err := fixture.db.Exec(`UPDATE users SET disabled=1 WHERE id=?`, backup); err != nil {
		t.Fatal(err)
	}
	if !riskOf(risky).SoleOwnerRisk {
		t.Fatal("a disabled co-owner hid the sole owner risk")
	}

	disable := fixture.patchUser(sole, 0, `{"disabled":true}`)
	if disable.Code != http.StatusOK {
		t.Fatalf("disabling the sole owner was blocked: status=%d body=%s", disable.Code, disable.Body.String())
	}
	var members int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM workspace_members WHERE user_id=?`, sole).Scan(&members); err != nil {
		t.Fatal(err)
	}
	if members != 2 {
		t.Fatalf("disabling removed memberships: %d", members)
	}
	var owned int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM workspaces WHERE created_by=?`, sole).Scan(&owned); err != nil {
		t.Fatal(err)
	}
	if owned != 2 {
		t.Fatalf("disabling transferred ownership: %d", owned)
	}
}

// workspaceWithOwners inserts a workspace whose owner member rows are exactly
// the given users, so a risk assertion cannot be satisfied by another workspace.
func (f *adminUsersFixture) workspaceWithOwners(creator string, owners ...string) string {
	f.t.Helper()
	id := uuid.NewString()
	now := time.Now().UTC()
	if _, err := f.db.Exec(`INSERT INTO workspaces(id,name,created_by,created_at,updated_at) VALUES(?,?,?,?,?)`, id, "workspace", creator, now, now); err != nil {
		f.t.Fatal(err)
	}
	for _, owner := range owners {
		if _, err := f.db.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,'owner',?)`, id, owner, now); err != nil {
			f.t.Fatal(err)
		}
	}
	return id
}

func (f *adminUsersFixture) privateWorkspace(userID string) string {
	f.t.Helper()
	id := uuid.NewString()
	now := time.Now().UTC()
	if _, err := f.db.Exec(`INSERT INTO workspaces(id,name,created_by,created_at,updated_at) VALUES(?,?,?,?,?)`, id, "private workspace", userID, now, now); err != nil {
		f.t.Fatal(err)
	}
	if _, err := f.db.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,'owner',?)`, id, userID, now); err != nil {
		f.t.Fatal(err)
	}
	return id
}

// TestAdminUserLastActiveAdminProtections covers §6.5: no operation may leave
// the site without an enabled administrator, and nobody disables themselves.
func TestAdminUserLastActiveAdminProtections(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	self := fixture.patchUser(fixture.adminID, 0, `{"disabled":true}`)
	assertAPIError(t, self, http.StatusForbidden, "SELF_DISABLE_FORBIDDEN")
	if row := fixture.userRow(fixture.adminID); row.disabled || row.revision != 0 {
		t.Fatalf("self disable changed the row: %#v", row)
	}
	if got := fixture.sessionCount(fixture.adminID); got != 1 {
		t.Fatalf("self disable dropped sessions: %d", got)
	}

	demote := fixture.patchUser(fixture.adminID, 0, `{"isAdmin":false}`)
	assertAPIError(t, demote, http.StatusConflict, "LAST_ACTIVE_ADMIN")
	if row := fixture.userRow(fixture.adminID); !row.isAdmin || row.revision != 0 {
		t.Fatalf("single admin was demoted: %#v", row)
	}
	if rows := fixture.auditRows(); len(rows) != 0 {
		t.Fatalf("rejected requests wrote audit rows: %#v", rows)
	}

	// A combined change is judged as a whole: the legal capability change must
	// not be persisted when the identity change breaks the invariant.
	combined := fixture.patchUser(fixture.adminID, 0, `{"isAdmin":false,"canCreateWorkspace":false}`)
	assertAPIError(t, combined, http.StatusConflict, "LAST_ACTIVE_ADMIN")
	if row := fixture.userRow(fixture.adminID); !row.isAdmin || !row.canCreate || row.revision != 0 {
		t.Fatalf("combined change partially persisted: %#v", row)
	}

	second := fixture.addUser("Second", "second@example.test", true, "2026-01-02T00:00:00Z")
	secondSession := fixture.sessionFor(second)
	// With a second administrator present the last-admin invariant would not
	// fire, so this isolates the self-disable rule itself.
	assertAPIError(t, fixture.patchUser(fixture.adminID, 0, `{"disabled":true}`), http.StatusForbidden, "SELF_DISABLE_FORBIDDEN")
	if row := fixture.userRow(fixture.adminID); row.disabled || row.revision != 0 {
		t.Fatalf("self disable with a backup admin changed the row: %#v", row)
	}
	if got := fixture.sessionCount(fixture.adminID); got != 1 {
		t.Fatalf("self disable dropped the operator's sessions: %d", got)
	}
	if got := fixture.patchUser(fixture.adminID, 0, `{"isAdmin":false}`); got.Code != http.StatusOK {
		t.Fatalf("demoting with a second admin present: status=%d body=%s", got.Code, got.Body.String())
	}
	if row := fixture.userRow(fixture.adminID); row.isAdmin || row.revision != 1 {
		t.Fatalf("demotion did not persist: %#v", row)
	}
	// The demoted administrator's own sessions are revoked so stale identity
	// snapshots in open tabs cannot keep acting as administrators.
	if got := fixture.sessionCount(fixture.adminID); got != 0 {
		t.Fatalf("demotion kept the operator's sessions: %d", got)
	}
	// The remaining administrator is now the only one, so it may neither demote
	// nor disable itself; both requests must be refused by the surviving admin.
	assertAPIError(t, fixture.patchUserAs(secondSession, second, 0, `{"isAdmin":false}`), http.StatusConflict, "LAST_ACTIVE_ADMIN")
	assertAPIError(t, fixture.patchUserAs(secondSession, second, 0, `{"disabled":true}`), http.StatusForbidden, "SELF_DISABLE_FORBIDDEN")
	if row := fixture.userRow(second); !row.isAdmin || row.disabled || row.revision != 0 {
		t.Fatalf("last admin row changed: %#v", row)
	}
}

// TestAdminUsersMutualAdminChangesKeepOneAdministrator covers RACE-03: two
// administrators acting on each other cannot both succeed.
func TestAdminUsersMutualAdminChangesKeepOneAdministrator(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	second := fixture.addUser("Second", "second@example.test", true, "2026-01-02T00:00:00Z")
	secondSession := fixture.sessionFor(second)

	start := make(chan struct{})
	statuses := make(chan int, 2)
	var workers sync.WaitGroup
	for _, job := range []struct{ session, target string }{
		{fixture.adminSession, second},
		{secondSession, fixture.adminID},
	} {
		workers.Add(1)
		go func(session, target string) {
			defer workers.Done()
			<-start
			body := `{"expectedRevision":0,"changes":{"isAdmin":false}}`
			statuses <- fixture.request(http.MethodPatch, "/admin/users/"+target, body, session, true).Code
		}(job.session, job.target)
	}
	close(start)
	workers.Wait()
	close(statuses)
	actual := []int{}
	for status := range statuses {
		actual = append(actual, status)
	}
	sort.Ints(actual)
	if actual[0] != http.StatusOK || actual[1] == http.StatusOK {
		t.Fatalf("mutual demotion statuses = %v, want exactly one success", actual)
	}
	var activeAdmins int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM users WHERE is_admin=1 AND disabled=0`).Scan(&activeAdmins); err != nil {
		t.Fatal(err)
	}
	if activeAdmins != 1 {
		t.Fatalf("active administrators = %d, want 1", activeAdmins)
	}
	if rows := fixture.auditRows(); len(rows) != 1 {
		t.Fatalf("audit rows = %#v, want one committed change", rows)
	}
}

// TestAdminUserPatchRevisionConflict covers RACE-01 for the user resource.
func TestAdminUserPatchRevisionConflict(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	first := fixture.patchUser(target, 0, `{"canCreateWorkspace":true}`)
	second := fixture.patchUser(target, 0, `{"canCreateWorkspace":false}`)
	if first.Code != http.StatusOK {
		t.Fatalf("first patch status=%d body=%s", first.Code, first.Body.String())
	}
	assertAPIError(t, second, http.StatusConflict, "REVISION_CONFLICT")
	row := fixture.userRow(target)
	if !row.canCreate || row.revision != 1 {
		t.Fatalf("conflicting patch mutated the row: %#v", row)
	}
	rows := fixture.auditRows()
	if len(rows) != 1 || rows[0].action != site.ActionUserWorkspaceCreationChanged {
		t.Fatalf("audit rows = %#v", rows)
	}
	if rows[0].changes != `{"canCreateWorkspace":{"from":false,"to":true}}` {
		t.Fatalf("audit changes = %s", rows[0].changes)
	}
}

// TestAdminUserPatchRejectsWeakBooleans pins §9.4: only strict JSON booleans
// are accepted, unknown keys and empty change sets never reach the database.
func TestAdminUserPatchRejectsWeakBooleans(t *testing.T) {
	bodies := []string{
		`{"expectedRevision":0,"changes":{"disabled":null}}`,
		`{"expectedRevision":0,"changes":{"disabled":"true"}}`,
		`{"expectedRevision":0,"changes":{"disabled":1}}`,
		`{"expectedRevision":0,"changes":{"disabled":0}}`,
		`{"expectedRevision":0,"changes":{"email":"x@example.test"}}`,
		`{"expectedRevision":0,"changes":{}}`,
		`{"changes":{"disabled":true}}`,
		`{"expectedRevision":0}`,
		`{"expectedRevision":0,"changes":{"isAdmin":true},"extra":1}`,
	}
	for _, body := range bodies {
		fixture := newAdminUsersFixture(t)
		target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
		response := fixture.request(http.MethodPatch, "/admin/users/"+target, body, fixture.adminSession, true)
		assertAPIError(t, response, http.StatusBadRequest, "INVALID_REQUEST")
		if row := fixture.userRow(target); row.isAdmin || row.disabled || row.canCreate || row.revision != 0 {
			t.Fatalf("rejected body %s changed the row: %#v", body, row)
		}
		if rows := fixture.auditRows(); len(rows) != 0 {
			t.Fatalf("rejected body %s wrote audit rows: %#v", body, rows)
		}
	}
}

// TestAdminUserSessionRevocationKeepsAccountUsable covers §6.4: revoking is a
// logout, not a lockout.
func TestAdminUserSessionRevocationKeepsAccountUsable(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	session := fixture.sessionFor(target)
	before := fixture.userRow(target)

	response := fixture.request(http.MethodDelete, "/admin/users/"+target+"/sessions", "", fixture.adminSession, true)
	if response.Code != http.StatusNoContent {
		t.Fatalf("revoke status=%d body=%s", response.Code, response.Body.String())
	}
	if got := fixture.sessionCount(target); got != 0 {
		t.Fatalf("sessions after revocation = %d", got)
	}
	if _, err := fixture.identity.Resolve(context.Background(), session); err == nil {
		t.Fatal("revoked session still resolves")
	}
	after := fixture.userRow(target)
	if before != after {
		t.Fatalf("revocation changed account fields: %#v -> %#v", before, after)
	}
	if got := fixture.rooms.revocations(); len(got) != 1 || got[0] != target+"|" {
		t.Fatalf("realtime revocations = %v", got)
	}
	rows := fixture.auditRows()
	if len(rows) != 1 || rows[0].action != site.ActionUserSessionsRevoked || rows[0].changes != `{"sessionsRevoked":1}` {
		t.Fatalf("audit rows = %#v", rows)
	}
	if _, _, err := fixture.identity.SignIn(context.Background(), "member@example.test", "password123"); err != nil {
		t.Fatalf("account cannot sign in after revocation: %v", err)
	}
	// Revoking again is harmless and idempotent; it never blocks a fresh login.
	if again := fixture.request(http.MethodDelete, "/admin/users/"+target+"/sessions", "", fixture.adminSession, true); again.Code != http.StatusNoContent {
		t.Fatalf("second revoke status=%d", again.Code)
	}
	if _, _, err := fixture.identity.SignIn(context.Background(), "member@example.test", "password123"); err != nil {
		t.Fatalf("account cannot sign in after a repeated revocation: %v", err)
	}
}

// TestAdminUserAdminRoleChangeRevokesSessions covers §6.5: an identity change
// invalidates stale snapshots in both directions.
func TestAdminUserAdminRoleChangeRevokesSessions(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	first := fixture.sessionFor(target)
	second := fixture.sessionFor(target)

	grant := fixture.patchUser(target, 0, `{"isAdmin":true}`)
	if grant.Code != http.StatusOK {
		t.Fatalf("grant status=%d body=%s", grant.Code, grant.Body.String())
	}
	var granted site.AdminUser
	if err := json.Unmarshal(grant.Body.Bytes(), &granted); err != nil {
		t.Fatal(err)
	}
	if !granted.IsAdmin || !granted.EffectiveCanCreateWorkspace || granted.Revision != 1 {
		t.Fatalf("grant response = %#v", granted)
	}
	if got := fixture.sessionCount(target); got != 0 {
		t.Fatalf("granting admin kept %d sessions", got)
	}
	for _, session := range []string{first, second} {
		if _, err := fixture.identity.Resolve(context.Background(), session); err == nil {
			t.Fatal("session survived an identity change")
		}
	}
	rows := fixture.auditRows()
	if len(rows) != 1 || rows[0].action != site.ActionUserAdminRoleChanged || rows[0].changes != `{"isAdmin":{"from":false,"to":true},"sessionsRevoked":2}` {
		t.Fatalf("audit rows = %#v", rows)
	}

	revoke := fixture.patchUser(target, 1, `{"isAdmin":false}`)
	if revoke.Code != http.StatusOK {
		t.Fatalf("revoke admin status=%d body=%s", revoke.Code, revoke.Body.String())
	}
	var revoked site.AdminUser
	if err := json.Unmarshal(revoke.Body.Bytes(), &revoked); err != nil {
		t.Fatal(err)
	}
	if revoked.IsAdmin || revoked.EffectiveCanCreateWorkspace || revoked.Revision != 2 {
		t.Fatalf("revoke response = %#v", revoked)
	}
	if got := fixture.rooms.revocations(); len(got) != 2 {
		t.Fatalf("realtime revocations = %v, want one per identity change", got)
	}
}

// TestAdminUserCapabilityChangeKeepsEditingSessions covers §6.5: only the
// ability to create new workspaces changes, so collaboration must continue.
func TestAdminUserCapabilityChangeKeepsEditingSessions(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	fixture.sessionFor(target)
	workspace := fixture.privateWorkspace(target)

	response := fixture.patchUser(target, 0, `{"canCreateWorkspace":false}`)
	if response.Code != http.StatusOK {
		t.Fatalf("capability patch status=%d body=%s", response.Code, response.Body.String())
	}
	if got := fixture.sessionCount(target); got != 1 {
		t.Fatalf("capability change dropped %d sessions", got-1)
	}
	if got := fixture.rooms.revocations(); len(got) != 0 {
		t.Fatalf("capability change revoked realtime sessions: %v", got)
	}
	var members int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM workspace_members WHERE user_id=?`, target).Scan(&members); err != nil {
		t.Fatal(err)
	}
	if members != 1 {
		t.Fatalf("capability change altered memberships: %d", members)
	}
	var owned int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM workspaces WHERE created_by=?`, target).Scan(&owned); err != nil {
		t.Fatal(err)
	}
	if owned != 1 || workspace == "" {
		t.Fatalf("capability change altered owned workspaces: %d", owned)
	}
}

// TestAdminUserListFiltersSearchAndPaginates covers §9.3: validated filters,
// a stable server-generated cursor, and no client-supplied ordering.
func TestAdminUserListFiltersSearchAndPaginates(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	first := fixture.addUser("u1", "u1@example.test", false, "2026-01-01T00:00:00Z")
	second := fixture.addUser("u2", "u2@example.test", false, "2026-01-02T00:00:00Z")
	fixture.addUser("u3", "u3@example.test", true, "2026-01-03T00:00:00Z")
	fixture.sessionFor(first)

	listUsers := func(query string) site.UserListResult {
		t.Helper()
		response := fixture.request(http.MethodGet, "/admin/users"+query, "", fixture.adminSession, false)
		if response.Code != http.StatusOK {
			t.Fatalf("list %s status=%d body=%s", query, response.Code, response.Body.String())
		}
		var result site.UserListResult
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	ids := func(result site.UserListResult) []string {
		values := []string{}
		for _, user := range result.Users {
			values = append(values, user.Name)
		}
		return values
	}

	page := listUsers("?q=u&limit=2")
	if got := ids(page); len(got) != 2 || got[0] != "u3" || got[1] != "u2" {
		t.Fatalf("first page = %v, want [u3 u2]", got)
	}
	if page.NextCursor == nil || *page.NextCursor == "" {
		t.Fatal("first page has no cursor")
	}
	if strings.Contains(*page.NextCursor, "LIMIT") || strings.Contains(*page.NextCursor, "2026") {
		t.Fatalf("cursor leaks query internals: %q", *page.NextCursor)
	}
	cont := listUsers("?q=u&limit=2&cursor=" + *page.NextCursor)
	if got := ids(cont); len(got) != 1 || got[0] != "u1" {
		t.Fatalf("second page = %v, want [u1]", cont.Users)
	}
	if cont.NextCursor != nil {
		t.Fatalf("last page cursor = %v, want null", *cont.NextCursor)
	}

	admins := listUsers("?q=u&role=admin")
	if got := ids(admins); len(got) != 1 || got[0] != "u3" {
		t.Fatalf("role=admin = %v", got)
	}
	members := listUsers("?q=u&role=user")
	if got := ids(members); len(got) != 2 {
		t.Fatalf("role=user = %v", got)
	}
	if got := ids(listUsers("?q=u2")); len(got) != 1 || got[0] != "u2" {
		t.Fatalf("q=u2 = %v", got)
	}
	if got := ids(listUsers("?q=@example.test&limit=100")); len(got) != 4 {
		t.Fatalf("email search = %v, want every account", got)
	}
	disabled := fixture.patchUser(second, 0, `{"disabled":true}`)
	if disabled.Code != http.StatusOK {
		t.Fatalf("disable status=%d", disabled.Code)
	}
	if got := ids(listUsers("?status=disabled")); len(got) != 1 || got[0] != "u2" {
		t.Fatalf("status=disabled = %v", got)
	}
	if got := ids(listUsers("?status=enabled&q=u")); len(got) != 2 {
		t.Fatalf("status=enabled = %v", got)
	}

	for _, query := range []string{"?status=all", "?role=root", "?limit=0", "?limit=101", "?limit=abc", "?cursor=not+base64"} {
		response := fixture.request(http.MethodGet, "/admin/users"+query, "", fixture.adminSession, false)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("query %s status=%d body=%s, want 400", query, response.Code, response.Body.String())
		}
		assertAPIError(t, response, http.StatusBadRequest, "INVALID_REQUEST")
	}
	// A well-formed cursor that names no real row is rejected too.
	response := fixture.request(http.MethodGet, "/admin/users?cursor="+uuid.NewString(), "", fixture.adminSession, false)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unknown cursor status=%d body=%s", response.Code, response.Body.String())
	}
	var listed site.AdminUser
	for _, user := range listUsers("?q=u1").Users {
		listed = user
	}
	if listed.Revision != 0 || listed.SignupSource != "legacy" || listed.CanCreateWorkspace || listed.EffectiveCanCreateWorkspace {
		t.Fatalf("listed user = %#v", listed)
	}
}

// TestAdminUsersStayAvailableWhenSettingsAreCorrupt pins the fail-closed
// boundary: locking out an account is decided only by user columns, so it must
// keep working when an unrelated configuration document is unreadable. Taking
// this emergency path hostage to site_settings is what FAIL-04 does not ask for.
func TestAdminUsersStayAvailableWhenSettingsAreCorrupt(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	fixture.sessionFor(target)
	if _, err := fixture.db.Exec(`UPDATE server_config SET value='{"schemaVersion":9}' WHERE key='site_settings'`); err != nil {
		t.Fatal(err)
	}
	if got := fixture.request(http.MethodGet, "/admin/users?q=member", "", fixture.adminSession, false); got.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", got.Code, got.Body.String())
	}
	if got := fixture.request(http.MethodGet, "/admin/users/"+target, "", fixture.adminSession, false); got.Code != http.StatusOK {
		t.Fatalf("detail status=%d body=%s", got.Code, got.Body.String())
	}
	if response := fixture.patchUser(target, 0, `{"disabled":true}`); response.Code != http.StatusOK {
		t.Fatalf("disable status=%d body=%s", response.Code, response.Body.String())
	}
	if row := fixture.userRow(target); !row.disabled || row.revision != 1 {
		t.Fatalf("users row after disable = %#v", row)
	}
	if got := fixture.sessionCount(target); got != 0 {
		t.Fatalf("sessions survived disabling: %d", got)
	}
	revoke := fixture.request(http.MethodDelete, "/admin/users/"+target+"/sessions", "", fixture.adminSession, true)
	if revoke.Code != http.StatusNoContent {
		t.Fatalf("revoke status=%d body=%s", revoke.Code, revoke.Body.String())
	}
	rows := fixture.auditRows()
	if len(rows) != 2 || rows[0].action != site.ActionUserDisabled || rows[1].action != site.ActionUserSessionsRevoked {
		t.Fatalf("audit rows = %#v", rows)
	}
}

// TestSiteOperationsFailClosedOnCorruptSettings is the other half of the
// boundary: operations that really do read the policy must not fall back to a
// permissive answer when it is unreadable.
func TestSiteOperationsFailClosedOnCorruptSettings(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	// The invite is issued while the document is still readable: only the
	// operations that consume the policy are meant to be affected.
	workspace := fixture.privateWorkspace(fixture.adminID)
	invite, token, err := fixture.domain.CreateInvite(context.Background(), fixture.adminID, workspace, "newcomer@example.test", "editor")
	if err != nil {
		t.Fatal(err)
	}
	if invite.ID == "" || token == "" {
		t.Fatal("invite was not created")
	}
	if _, err := fixture.db.Exec(`UPDATE server_config SET value='{"schemaVersion":9}' WHERE key='site_settings'`); err != nil {
		t.Fatal(err)
	}
	// Public site information must not render a fabricated "registration open".
	assertAPIError(t, fixture.request(http.MethodGet, "/site", "", "", false), http.StatusInternalServerError, "INTERNAL")
	// Creating an account from an invite reads the invite default, so it has to
	// fail closed and must not leave a half-created account behind.
	accept := fixture.request(http.MethodPost, "/invites/"+token+"/accept", `{"name":"Newcomer","password":"password123"}`, "", false)
	assertAPIError(t, accept, http.StatusInternalServerError, "INTERNAL")
	var users int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM users WHERE email='newcomer@example.test'`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users != 0 {
		t.Fatalf("corrupt settings let an account be created: %d", users)
	}
	// The settings endpoints themselves must report the corruption instead of
	// silently re-initialising over the administrator's stored document.
	assertAPIError(t, fixture.request(http.MethodGet, "/admin/settings", "", fixture.adminSession, false), http.StatusInternalServerError, "INTERNAL")
	// Creating a workspace is decided by the actor's own grants, not by the
	// policy document, so it is not one of the operations that must close.
	create := fixture.request(http.MethodPost, "/workspaces", `{"name":"still works"}`, fixture.adminSession, true)
	if create.Code != http.StatusCreated {
		t.Fatalf("workspace creation status=%d body=%s", create.Code, create.Body.String())
	}
}

// TestAdminUserRevocationReportsUnavailableHub covers §8.6: a realtime
// revocation that cannot be delivered is reported as a diagnosable error, while
// the already committed database state is left alone.
func TestAdminUserRevocationReportsUnavailableHub(t *testing.T) {
	fixture := newAdminUsersFixtureWithRealtime(t, nil)
	target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	fixture.sessionFor(target)

	var logged bytes.Buffer
	original := log.Writer()
	log.SetOutput(&logged)
	defer log.SetOutput(original)
	response := fixture.patchUser(target, 0, `{"disabled":true}`)
	if response.Code != http.StatusOK {
		t.Fatalf("disable status=%d body=%s", response.Code, response.Body.String())
	}
	if !strings.Contains(logged.String(), "realtime revocation unavailable") {
		t.Fatalf("missing hub was swallowed silently; log = %q", logged.String())
	}
	if row := fixture.userRow(target); !row.disabled || row.revision != 1 {
		t.Fatalf("committed state was rolled back: %#v", row)
	}
	if got := fixture.sessionCount(target); got != 0 {
		t.Fatalf("sessions survived disabling: %d", got)
	}
}

// TestAdminUserWriteDoesNotSelfLock covers FAIL-03: the pool allows a single
// open connection, so a transaction that reads users and writes audit through
// the global handle instead of its own handle would hang forever.
func TestAdminUserWriteDoesNotSelfLock(t *testing.T) {
	fixture := newAdminUsersFixture(t)
	target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	fixture.sessionFor(target)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		done <- fixture.requestWithContext(ctx, http.MethodPatch, "/admin/users/"+target, `{"expectedRevision":0,"changes":{"disabled":true}}`, fixture.adminSession, true)
	}()
	select {
	case response := <-done:
		if response.Code != http.StatusOK {
			t.Fatalf("patch status=%d body=%s", response.Code, response.Body.String())
		}
	case <-time.After(8 * time.Second):
		t.Fatal("management write self-locked on the single database connection")
	}
	if got := fixture.sessionCount(target); got != 0 {
		t.Fatalf("sessions after disabling = %d", got)
	}
}
