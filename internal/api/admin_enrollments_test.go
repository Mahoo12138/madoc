package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
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

type enrollmentFixture struct {
	t            *testing.T
	db           *sql.DB
	handler      http.Handler
	identity     *auth.Service
	site         *site.Store
	adminID      string
	adminSession string
	csrfCookie   *http.Cookie
	csrfToken    string
}

// newEnrollmentFixture builds a single-administrator instance with a wide
// activation budget so only the rate limit test has to think about limits.
func newEnrollmentFixture(t *testing.T) *enrollmentFixture {
	t.Helper()
	return newEnrollmentFixtureWithLimits(t, site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, Instance: 60})
}

func newEnrollmentFixtureWithLimits(t *testing.T, limits site.EnrollmentLimits) *enrollmentFixture {
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
	csrf := auth.NewCSRF([]byte("enrollment-test-secret"))
	recorder := httptest.NewRecorder()
	csrfToken, err := csrf.Issue(recorder, false)
	if err != nil {
		t.Fatal(err)
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("CSRF cookies = %d", len(cookies))
	}
	siteStore := site.NewWithEnrollmentLimits(conn, limits)
	domain := core.New(conn, siteStore)
	assetRoot := t.TempDir()
	handler := New(identity, csrf, domain, siteStore, asset.New(conn, domain, assetRoot, 25), account.New(conn, assetRoot), nil, false).Routes()
	fixture := &enrollmentFixture{
		t: t, db: conn, handler: handler, identity: identity, site: siteStore,
		adminID: admin.ID, adminSession: session, csrfCookie: cookies[0], csrfToken: csrfToken,
	}
	if fixture.mode() != "invite_only" {
		t.Fatalf("a fresh instance must start in invite_only, got %q", fixture.mode())
	}
	return fixture
}

func (f *enrollmentFixture) request(method, path, body, session string, withCSRF bool) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.requestWithHeaders(method, path, body, session, nil, withCSRF)
}

// requestWithHeaders lets a test add the browser-supplied origin signals that
// the anonymous activation endpoint inspects.
func (f *enrollmentFixture) requestWithHeaders(method, path, body, session string, headers map[string]string, withCSRF bool) *httptest.ResponseRecorder {
	f.t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	if session != "" {
		request.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: session})
	}
	if withCSRF {
		request.AddCookie(f.csrfCookie)
		request.Header.Set(auth.CSRFHeader, f.csrfToken)
	}
	request.Header.Set("Content-Type", "application/json")
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	response := httptest.NewRecorder()
	f.handler.ServeHTTP(response, request)
	return response
}

func (f *enrollmentFixture) mode() string {
	f.t.Helper()
	settings, err := f.site.Ensure(context.Background())
	if err != nil {
		f.t.Fatal(err)
	}
	return settings.RegistrationMode
}

// setRegistrationMode goes through the real settings endpoint so the instance
// sees exactly the state transition an administrator would produce.
func (f *enrollmentFixture) patchSettings(changes string) {
	f.t.Helper()
	settings, err := f.site.Ensure(context.Background())
	if err != nil {
		f.t.Fatal(err)
	}
	body := `{"expectedRevision":` + strconv.Itoa(settings.Revision) + `,"changes":` + changes + `}`
	if response := f.request(http.MethodPatch, "/admin/settings", body, f.adminSession, true); response.Code != http.StatusOK {
		f.t.Fatalf("patching settings %s: status=%d body=%s", changes, response.Code, response.Body.String())
	}
}

func (f *enrollmentFixture) setRegistrationMode(mode string) {
	f.t.Helper()
	f.patchSettings(`{"registrationMode":"` + mode + `"}`)
	if f.mode() != mode {
		f.t.Fatalf("registrationMode = %q, want %q", f.mode(), mode)
	}
}

func (f *enrollmentFixture) addUser(name, email string, isAdmin bool) string {
	f.t.Helper()
	id := uuid.NewString()
	hash, err := auth.HashPassword("password123")
	if err != nil {
		f.t.Fatal(err)
	}
	now := time.Now().UTC()
	if _, err := f.db.Exec(`INSERT INTO users(id,name,email,password_hash,is_admin,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, id, name, email, hash, boolInt(isAdmin), now, now); err != nil {
		f.t.Fatal(err)
	}
	return id
}

func (f *enrollmentFixture) addAdmin(email string) (string, string) {
	f.t.Helper()
	id := f.addUser("Second", email, true)
	return id, f.sessionFor(id)
}

func (f *enrollmentFixture) sessionFor(userID string) string {
	f.t.Helper()
	session, err := f.identity.CreateSession(context.Background(), userID)
	if err != nil {
		f.t.Fatal(err)
	}
	return session
}

type createdEnrollment struct {
	enrollment site.Enrollment
	token      string
	url        string
}

func (f *enrollmentFixture) create(email string, grant bool) createdEnrollment {
	f.t.Helper()
	return f.createAs(f.adminSession, email, grant)
}

func (f *enrollmentFixture) createRawAs(session, email string, grant bool) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.request(http.MethodPost, "/admin/account-enrollments",
		`{"email":"`+email+`","canCreateWorkspace":`+strconv.FormatBool(grant)+`}`, session, true)
}

func (f *enrollmentFixture) createAs(session, email string, grant bool) createdEnrollment {
	f.t.Helper()
	response := f.createRawAs(session, email, grant)
	if response.Code != http.StatusCreated {
		f.t.Fatalf("create enrollment: status=%d body=%s", response.Code, response.Body.String())
	}
	var body createEnrollmentResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		f.t.Fatal(err)
	}
	return createdEnrollment{enrollment: body.Enrollment, token: body.Token, url: body.URL}
}

func (f *enrollmentFixture) list() []site.Enrollment {
	f.t.Helper()
	response := f.request(http.MethodGet, "/admin/account-enrollments", "", f.adminSession, false)
	if response.Code != http.StatusOK {
		f.t.Fatalf("list enrollments: status=%d body=%s", response.Code, response.Body.String())
	}
	var body enrollmentListResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		f.t.Fatal(err)
	}
	return body.Enrollments
}

func (f *enrollmentFixture) listBody() string {
	f.t.Helper()
	response := f.request(http.MethodGet, "/admin/account-enrollments", "", f.adminSession, false)
	if response.Code != http.StatusOK {
		f.t.Fatalf("list enrollments: status=%d body=%s", response.Code, response.Body.String())
	}
	return response.Body.String()
}

func (f *enrollmentFixture) revoke(id string) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.request(http.MethodDelete, "/admin/account-enrollments/"+id, "", f.adminSession, true)
}

func (f *enrollmentFixture) complete(token, name, password string) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.request(http.MethodPost, "/auth/account-enrollments/complete",
		`{"token":"`+token+`","name":"`+name+`","password":"`+password+`"}`, "", false)
}

func (f *enrollmentFixture) completeWithHeaders(token, name, password string, headers map[string]string) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.requestWithHeaders(http.MethodPost, "/auth/account-enrollments/complete",
		`{"token":"`+token+`","name":"`+name+`","password":"`+password+`"}`, "", headers, false)
}

type enrollmentRecord struct {
	kind       string
	email      string
	status     string
	expiresAt  time.Time
	createdBy  *string
	consumedAt *time.Time
	canCreate  bool
}

func (f *enrollmentFixture) row(id string) enrollmentRecord {
	f.t.Helper()
	var record enrollmentRecord
	var grant sql.NullInt64
	err := f.db.QueryRow(`SELECT kind,email,status,expires_at,created_by,consumed_at,can_create_workspace FROM account_enrollments WHERE id=?`, id).
		Scan(&record.kind, &record.email, &record.status, &record.expiresAt, &record.createdBy, &record.consumedAt, &grant)
	if err != nil {
		f.t.Fatal(err)
	}
	record.canCreate = grant.Valid && grant.Int64 != 0
	return record
}

func (f *enrollmentFixture) enrollmentCount() int {
	f.t.Helper()
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM account_enrollments`).Scan(&count); err != nil {
		f.t.Fatal(err)
	}
	return count
}

type accountRow struct {
	id                 string
	name               string
	passwordHash       string
	isAdmin            bool
	disabled           bool
	canCreateWorkspace bool
	signupSource       string
	emailVerified      *string
	revision           int
}

func (f *enrollmentFixture) account(email string) (accountRow, error) {
	f.t.Helper()
	var row accountRow
	var admin, disabled, canCreate int
	err := f.db.QueryRow(`SELECT id,name,password_hash,is_admin,disabled,can_create_workspace,signup_source,email_verified_at,admin_revision FROM users WHERE email=?`, email).
		Scan(&row.id, &row.name, &row.passwordHash, &admin, &disabled, &canCreate, &row.signupSource, &row.emailVerified, &row.revision)
	if err != nil {
		return accountRow{}, err
	}
	row.isAdmin, row.disabled, row.canCreateWorkspace = admin != 0, disabled != 0, canCreate != 0
	return row, nil
}

func (f *enrollmentFixture) mustAccount(email string) accountRow {
	f.t.Helper()
	row, err := f.account(email)
	if err != nil {
		f.t.Fatalf("account %s missing: %v", email, err)
	}
	return row
}

func (f *enrollmentFixture) userCount() int {
	f.t.Helper()
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM users`).Scan(&count); err != nil {
		f.t.Fatal(err)
	}
	return count
}

func (f *enrollmentFixture) sessionCount(userID string) int {
	f.t.Helper()
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM sessions WHERE user_id=?`, userID).Scan(&count); err != nil {
		f.t.Fatal(err)
	}
	return count
}

func (f *enrollmentFixture) auditActions() []string {
	f.t.Helper()
	rows, err := f.db.Query(`SELECT action FROM admin_audit_events ORDER BY id`)
	if err != nil {
		f.t.Fatal(err)
	}
	defer rows.Close()
	actions := []string{}
	for rows.Next() {
		var action string
		if err := rows.Scan(&action); err != nil {
			f.t.Fatal(err)
		}
		actions = append(actions, action)
	}
	if err := rows.Err(); err != nil {
		f.t.Fatal(err)
	}
	return actions
}

func (f *enrollmentFixture) auditChanges() string {
	f.t.Helper()
	var changes string
	if err := f.db.QueryRow(`SELECT COALESCE(group_concat(changes_json,'|'),'') FROM (SELECT changes_json FROM admin_audit_events ORDER BY id)`).Scan(&changes); err != nil {
		f.t.Fatal(err)
	}
	return changes
}

// patchUserCredential drives the management API so every side effect that
// accompanies losing authority is exactly what production would do.
func (f *enrollmentFixture) patchUserCredential(session, userID string, revision int, key string, value bool) {
	f.t.Helper()
	body := `{"expectedRevision":` + strconv.Itoa(revision) + `,"changes":{"` + key + `":` + strconv.FormatBool(value) + `}}`
	if response := f.request(http.MethodPatch, "/admin/users/"+userID, body, session, true); response.Code != http.StatusOK {
		f.t.Fatalf("patching %s: status=%d body=%s", key, response.Code, response.Body.String())
	}
}

// TestAccountEnrollmentEndpointsRequireAnActiveAdministrator covers AUTH-01 for
// this slice: a signed-in non-administrator changes nothing at all.
func TestAccountEnrollmentEndpointsRequireAnActiveAdministrator(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	member := fixture.addUser("Member", "member@example.test", false)
	memberSession := fixture.sessionFor(member)
	before := fixture.userCount()

	for _, call := range []struct{ method, path, body string }{
		{http.MethodGet, "/admin/account-enrollments", ""},
		{http.MethodPost, "/admin/account-enrollments", `{"email":"intruder@example.test","canCreateWorkspace":false}`},
		{http.MethodDelete, "/admin/account-enrollments/anything", ""},
	} {
		response := fixture.request(call.method, call.path, call.body, memberSession, true)
		assertAPIError(t, response, http.StatusForbidden, "ADMIN_REQUIRED")
	}
	if got := fixture.enrollmentCount(); got != 0 {
		t.Fatalf("non-administrator created enrollment rows: %d", got)
	}
	if got := fixture.userCount(); got != before {
		t.Fatalf("user count changed: %d -> %d", before, got)
	}
	if rows := fixture.auditActions(); len(rows) != 0 {
		t.Fatalf("rejected requests wrote audit rows: %v", rows)
	}
	assertAPIError(t, fixture.request(http.MethodGet, "/admin/account-enrollments", "", "", false), http.StatusUnauthorized, "UNAUTHORIZED")
}

// TestAccountEnrollmentCompletesInClosedRegistrationMode is the boundary that
// makes this slice different from every other signup path: an administrator's
// explicit approval is not subject to registrationMode.
func TestAccountEnrollmentCompletesInClosedRegistrationMode(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	fixture.setRegistrationMode("closed")

	created := fixture.create("approved@example.test", true)
	if created.token == "" || created.url != enrollmentActivatePath+created.token {
		t.Fatalf("create response = %+v", created)
	}
	if created.enrollment.Status != site.EnrollmentPending || created.enrollment.Kind != site.KindAdminCreated ||
		created.enrollment.Email != "approved@example.test" || created.enrollment.CreatedBy == nil || *created.enrollment.CreatedBy != fixture.adminID {
		t.Fatalf("created enrollment = %#v", created.enrollment)
	}
	if !created.enrollment.CanCreateWorkspace || created.enrollment.ConsumedAt != nil {
		t.Fatalf("grant not bound to the record: %#v", created.enrollment)
	}
	stored := fixture.row(created.enrollment.ID)
	if stored.status != site.EnrollmentPending || stored.createdBy == nil || *stored.createdBy != fixture.adminID || !stored.canCreate {
		t.Fatalf("stored enrollment = %#v", stored)
	}
	if remaining := time.Until(stored.expiresAt); remaining <= 23*time.Hour || remaining > 24*time.Hour {
		t.Fatalf("expiry = %v, want about 24 hours", remaining)
	}

	response := fixture.complete(created.token, "Approved", "password123")
	if response.Code != http.StatusOK {
		t.Fatalf("activation status=%d body=%s", response.Code, response.Body.String())
	}
	var activated struct {
		User      auth.User `json:"user"`
		CSRFToken string    `json:"csrfToken"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &activated); err != nil {
		t.Fatal(err)
	}
	if activated.CSRFToken == "" || activated.User.ID == "" {
		t.Fatalf("activation response = %s", response.Body.String())
	}
	if activated.User.Capabilities.CanManageSite || !activated.User.Capabilities.CanCreateWorkspace {
		t.Fatalf("capabilities of the new account = %#v", activated.User.Capabilities)
	}

	account := fixture.mustAccount("approved@example.test")
	if account.signupSource != "admin_created" || !account.canCreateWorkspace || account.isAdmin || account.disabled {
		t.Fatalf("created account = %#v", account)
	}
	// Nobody vouched for the mailbox here, so it must not be marked verified.
	if account.emailVerified != nil {
		t.Fatalf("email_verified_at = %v, want NULL", *account.emailVerified)
	}
	if !auth.CheckPassword(account.passwordHash, "password123") {
		t.Fatal("the stored hash does not match the password the person chose")
	}
	if rows := fixture.row(created.enrollment.ID); rows.status != site.EnrollmentConsumed || rows.consumedAt == nil {
		t.Fatalf("enrollment after activation = %#v", rows)
	}
	if got := fixture.sessionCount(account.id); got != 1 {
		t.Fatalf("sessions for the new account = %d, want exactly the one from activation", got)
	}
	if _, err := fixture.identity.Resolve(context.Background(), sessionCookieValue(response, auth.SessionCookie)); err != nil {
		t.Fatalf("the session issued at activation does not resolve: %v", err)
	}
	if actions := fixture.auditActions(); len(actions) != 3 ||
		actions[0] != site.ActionSettingsChanged || actions[1] != site.ActionEnrollmentCreated || actions[2] != site.ActionAccountEnrolled {
		t.Fatalf("audit actions = %v", actions)
	}
	if changes := fixture.auditChanges(); !strings.Contains(changes, `"email":"approved@example.test"`) ||
		!strings.Contains(changes, `"canCreateWorkspace":true`) || !strings.Contains(changes, `"revokedExisting":0`) {
		t.Fatalf("audit changes = %s", changes)
	}
}

func sessionCookieValue(response *httptest.ResponseRecorder, name string) string {
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == name {
			return cookie.Value
		}
	}
	return ""
}

// TestRegistrationModeSwitchesDoNotInvalidateEnrollments pins the other half of
// the boundary: an issued approval is withdrawn by revoking it, never by moving
// the registration mode.
func TestRegistrationModeSwitchesDoNotInvalidateEnrollments(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	issuedWhileOpen := fixture.create("steady@example.test", false)
	fixture.setRegistrationMode("closed")
	if response := fixture.complete(issuedWhileOpen.token, "Steady", "password123"); response.Code != http.StatusOK {
		t.Fatalf("activation after closing registration: status=%d body=%s", response.Code, response.Body.String())
	}
	fixture.mustAccount("steady@example.test")

	issuedWhileClosed := fixture.create("reopened@example.test", false)
	fixture.setRegistrationMode("invite_only")
	if response := fixture.complete(issuedWhileClosed.token, "Reopened", "password123"); response.Code != http.StatusOK {
		t.Fatalf("activation after reopening invites: status=%d body=%s", response.Code, response.Body.String())
	}
	if row := fixture.mustAccount("reopened@example.test"); row.canCreateWorkspace {
		t.Fatal("a false grant became true through the registration mode")
	}
}

// TestEnrollmentGrantIsExplicitNotDerived proves the initial workspace creation
// grant is the one the administrator bound to the record, never a default read
// out of the site settings at activation time.
func TestEnrollmentGrantIsExplicitNotDerived(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	// Turn on every default that could leak into a false grant.
	fixture.patchSettings(`{"inviteDefaultCanCreateWorkspace":true,"allowWorkspaceOwnerInviteNewUsers":true}`)
	restricted := fixture.create("restricted@example.test", false)
	granted := fixture.create("granted@example.test", true)

	for name, attempt := range map[string]createdEnrollment{"restricted": restricted, "granted": granted} {
		if response := fixture.complete(attempt.token, "Account", "password123"); response.Code != http.StatusOK {
			t.Fatalf("%s activation status=%d body=%s", name, response.Code, response.Body.String())
		}
	}
	restrictedAccount := fixture.mustAccount("restricted@example.test")
	grantedAccount := fixture.mustAccount("granted@example.test")
	if restrictedAccount.canCreateWorkspace || !grantedAccount.canCreateWorkspace {
		t.Fatalf("grants came from the settings instead of the records: restricted=%v granted=%v",
			restrictedAccount.canCreateWorkspace, grantedAccount.canCreateWorkspace)
	}
	// The consequence has to be real, not just a column: this account cannot
	// create a workspace even though every default says it could.
	restrictedSession := fixture.sessionFor(restrictedAccount.id)
	create := fixture.request(http.MethodPost, "/workspaces", `{"name":"nope"}`, restrictedSession, true)
	assertAPIError(t, create, http.StatusForbidden, "WORKSPACE_CREATION_DENIED")
	var workspaces int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM workspaces`).Scan(&workspaces); err != nil {
		t.Fatal(err)
	}
	if workspaces != 0 {
		t.Fatalf("a workspace was created without the grant: %d", workspaces)
	}
	grantedSession := fixture.sessionFor(grantedAccount.id)
	if response := fixture.request(http.MethodPost, "/workspaces", `{"name":"allowed"}`, grantedSession, true); response.Code != http.StatusCreated {
		t.Fatalf("the explicitly granted account could not create a workspace: status=%d body=%s", response.Code, response.Body.String())
	}
}

// TestAccountEnrollmentRefusesExistingAccountsWithoutTouchingThem covers §11.3:
// the administrator is pointed at user management; this flow never becomes a
// password reset or a permission rewrite.
func TestAccountEnrollmentRefusesExistingAccountsWithoutTouchingThem(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	existing := fixture.addUser("Existing", "existing@example.test", false)
	fixture.sessionFor(existing)
	before := fixture.mustAccount("existing@example.test")
	users := fixture.userCount()

	// Normalization must still collide with the stored account.
	assertAPIError(t, fixture.createRawAs(fixture.adminSession, " Existing@Example.test ", true), http.StatusConflict, "EMAIL_ALREADY_REGISTERED")
	if got := fixture.enrollmentCount(); got != 0 {
		t.Fatalf("an enrollment was recorded for an existing account: %d", got)
	}
	if rows := fixture.auditActions(); len(rows) != 0 {
		t.Fatalf("a refused request wrote audit rows: %v", rows)
	}
	if after := fixture.mustAccount("existing@example.test"); after != before {
		t.Fatalf("existing account changed: %#v -> %#v", before, after)
	}
	if got := fixture.sessionCount(existing); got != 1 {
		t.Fatalf("existing sessions changed: %d", got)
	}
	if got := fixture.userCount(); got != users {
		t.Fatalf("user count changed: %d -> %d", users, got)
	}

	// The same invariant has to hold when the account appears *after* the
	// approval was issued (RACE-08): handling it here would be an account
	// takeover dressed up as account creation.
	late := fixture.create("late@example.test", false)
	lateAccount := fixture.addUser("Late", "late@example.test", false)
	fixture.sessionFor(lateAccount)
	lateBefore := fixture.mustAccount("late@example.test")
	assertAPIError(t, fixture.complete(late.token, "Late", "another-password"), http.StatusConflict, "EMAIL_ALREADY_REGISTERED")
	if rows := fixture.row(late.enrollment.ID); rows.status != site.EnrollmentPending || rows.consumedAt != nil {
		t.Fatalf("enrollment was consumed by a refused activation: %#v", rows)
	}
	if got := fixture.mustAccount("late@example.test"); got.passwordHash != lateBefore.passwordHash || got.revision != lateBefore.revision {
		t.Fatalf("the existing account was rewritten by activation: %#v -> %#v", lateBefore, got)
	}
	if got := fixture.sessionCount(lateAccount); got != 1 {
		t.Fatalf("sessions of the existing account = %d, want them untouched", got)
	}
	if got := fixture.userCount(); got != users+1 {
		t.Fatalf("user count = %d, want only the inserted account added", got)
	}
}

// TestAccountEnrollmentRegenerationRevokesThePreviousLink covers the rule that
// one approval may never have two usable entrances.
func TestAccountEnrollmentRegenerationRevokesThePreviousLink(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	first := fixture.create("rotated@example.test", false)
	second := fixture.create("rotated@example.test", true)
	if first.enrollment.ID == second.enrollment.ID {
		t.Fatal("regeneration reused the same record")
	}
	if rows := fixture.row(first.enrollment.ID); rows.status != site.EnrollmentRevoked {
		t.Fatalf("previous enrollment = %#v, want revoked", rows)
	}
	if rows := fixture.row(second.enrollment.ID); rows.status != site.EnrollmentPending {
		t.Fatalf("replacement enrollment = %#v, want pending", rows)
	}
	assertAPIError(t, fixture.complete(first.token, "Rotated", "password123"), http.StatusNotFound, "NOT_FOUND")
	if _, err := fixture.account("rotated@example.test"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("the revoked token created an account: %v", err)
	}
	if response := fixture.complete(second.token, "Rotated", "password123"); response.Code != http.StatusOK {
		t.Fatalf("the replacement token did not work: status=%d body=%s", response.Code, response.Body.String())
	}
	// The replacement carries the grant chosen for it, not the one the
	// superseded record had.
	if account := fixture.mustAccount("rotated@example.test"); !account.canCreateWorkspace {
		t.Fatalf("the explicit grant did not follow the new record: %#v", account)
	}
	if changes := fixture.auditChanges(); !strings.Contains(changes, `"revokedExisting":1`) {
		t.Fatalf("audit changes do not report the superseded record: %s", changes)
	}
}

// TestAccountEnrollmentRevocationIsScopedToOneRecord covers §11.3: revoking one
// approval must not quietly cancel another, even for the same mailbox.
func TestAccountEnrollmentRevocationIsScopedToOneRecord(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	alpha := fixture.create("alpha@example.test", false)
	beta := fixture.create("beta@example.test", false)

	if response := fixture.revoke(alpha.enrollment.ID); response.Code != http.StatusNoContent {
		t.Fatalf("revoke status=%d body=%s", response.Code, response.Body.String())
	}
	if rows := fixture.row(alpha.enrollment.ID); rows.status != site.EnrollmentRevoked {
		t.Fatalf("revoked enrollment = %#v", rows)
	}
	if rows := fixture.row(beta.enrollment.ID); rows.status != site.EnrollmentPending {
		t.Fatalf("revoking one record touched another mailbox: %#v", rows)
	}
	assertAPIError(t, fixture.complete(alpha.token, "Alpha", "password123"), http.StatusNotFound, "NOT_FOUND")
	if response := fixture.complete(beta.token, "Beta", "password123"); response.Code != http.StatusOK {
		t.Fatalf("the untouched enrollment stopped working: status=%d body=%s", response.Code, response.Body.String())
	}
	fixture.mustAccount("beta@example.test")

	// Revoking twice changes nothing: the record simply has nothing left to
	// withdraw, and inventing success here would hide that fact.
	assertAPIError(t, fixture.revoke(alpha.enrollment.ID), http.StatusNotFound, "NOT_FOUND")

	// Same mailbox, two records: the superseded one is untouched because the two
	// were separate decisions.
	gamma := fixture.create("gamma@example.test", false)
	regenerated := fixture.create("gamma@example.test", false)
	if got := fixture.revoke(regenerated.enrollment.ID); got.Code != http.StatusNoContent {
		t.Fatalf("revoking the live record: status=%d body=%s", got.Code, got.Body.String())
	}
	if rows := fixture.row(gamma.enrollment.ID); rows.status != site.EnrollmentRevoked {
		t.Fatalf("revoking the live record rewrote the superseded one: %#v", rows)
	}
	if got := fixture.enrollmentCount(); got != 4 {
		t.Fatalf("enrollment rows = %d, want every decision preserved", got)
	}
	revocations := 0
	for _, action := range fixture.auditActions() {
		if action == site.ActionEnrollmentRevoked {
			revocations++
		}
	}
	if revocations != 2 {
		t.Fatalf("revocation audit rows = %d in %v, want 2", revocations, fixture.auditActions())
	}
}

// TestEnrollmentCompletionRequiresAnAuthorizedIssuer covers the re-check at
// activation time: an approval does not outlive the authority of its author.
// Authority is removed through the management API, so the accompanying session
// revocation is part of what is being asserted.
func TestEnrollmentCompletionRequiresAnAuthorizedIssuer(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	secondID, secondSession := fixture.addAdmin("second@example.test")

	fromSecond := fixture.createAs(secondSession, "disabled-issuer@example.test", false)
	fromAdmin := fixture.createAs(fixture.adminSession, "demoted-issuer@example.test", false)

	secondRow := fixture.mustAccount("second@example.test")
	fixture.patchUserCredential(fixture.adminSession, secondID, secondRow.revision, "disabled", true)
	assertAPIError(t, fixture.complete(fromSecond.token, "Disabled Issuer", "password123"), http.StatusForbidden, "ADMIN_REQUIRED")
	if _, err := fixture.account("disabled-issuer@example.test"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("an account was created for a disabled issuer: %v", err)
	}
	if rows := fixture.row(fromSecond.enrollment.ID); rows.status != site.EnrollmentPending {
		t.Fatalf("enrollment changed while refused: %#v", rows)
	}
	// Disabling revoked the issuer's sessions, so this request needs a fresh one
	// to represent them after they are re-enabled.
	fixture.patchUserCredential(fixture.adminSession, secondID, fixture.mustAccount("second@example.test").revision, "disabled", false)
	revivedSession := fixture.sessionFor(secondID)

	adminRow := fixture.mustAccount("admin@example.test")
	fixture.patchUserCredential(revivedSession, fixture.adminID, adminRow.revision, "isAdmin", false)
	assertAPIError(t, fixture.complete(fromAdmin.token, "Demoted Issuer", "password123"), http.StatusForbidden, "ADMIN_REQUIRED")
	if _, err := fixture.account("demoted-issuer@example.test"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("an account was created after the issuer was demoted: %v", err)
	}
	if rows := fixture.row(fromAdmin.enrollment.ID); rows.status != site.EnrollmentPending {
		t.Fatalf("enrollment changed while refused: %#v", rows)
	}
	if got := fixture.userCount(); got != 2 {
		t.Fatalf("users = %d, want the two administrators only", got)
	}
}

// TestEnrollmentRefusalsAreIndistinguishable covers the anti-enumeration rule:
// whatever the reason, a token that cannot be used looks exactly like a token
// that never existed.
func TestEnrollmentRefusalsAreIndistinguishable(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	valid := fixture.create("outcomes@example.test", false)
	if response := fixture.complete(valid.token, "Consumed", "password123"); response.Code != http.StatusOK {
		t.Fatalf("consuming the token: status=%d body=%s", response.Code, response.Body.String())
	}
	revoked := fixture.create("revoked-token@example.test", false)
	if got := fixture.revoke(revoked.enrollment.ID); got.Code != http.StatusNoContent {
		t.Fatalf("revoke status=%d", got.Code)
	}
	expired := fixture.create("expired-token@example.test", false)
	if _, err := fixture.db.Exec(`UPDATE account_enrollments SET expires_at=? WHERE id=?`, time.Now().UTC().Add(-time.Minute), expired.enrollment.ID); err != nil {
		t.Fatal(err)
	}

	unknown := uuid.NewString() + "." + strings.Repeat("A", 43)
	responses := map[string]*httptest.ResponseRecorder{
		"unknown token":   fixture.complete(unknown, "Nobody", "password123"),
		"malformed token": fixture.complete("not-a-token", "Nobody", "password123"),
		"revoked":         fixture.complete(revoked.token, "Nobody", "password123"),
		"consumed":        fixture.complete(valid.token, "Nobody", "password123"),
		"expired":         fixture.complete(expired.token, "Nobody", "password123"),
	}
	reference := responses["unknown token"].Body.String()
	for name, response := range responses {
		assertAPIError(t, response, http.StatusNotFound, "NOT_FOUND")
		if response.Body.String() != reference {
			t.Fatalf("%s answer differs from an unknown token: %s vs %s", name, response.Body.String(), reference)
		}
		if response.Header().Get("Cache-Control") != responses["consumed"].Header().Get("Cache-Control") {
			t.Fatalf("%s leaks a different cache header", name)
		}
	}
	if rows := fixture.row(expired.enrollment.ID); rows.status != site.EnrollmentPending {
		t.Fatalf("an expired record changed state: %#v", rows)
	}
	if got := fixture.userCount(); got != 2 {
		t.Fatalf("users = %d, want the administrator plus the one successful activation", got)
	}
}

// TestEnrollmentTokenIsNeverExposedAfterCreation covers §11.3 and §12.5: the only
// place the plain token appears is the response that creates the record.
func TestEnrollmentTokenIsNeverExposedAfterCreation(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	// Everything the server writes while the token is alive has to stay clean.
	var logged strings.Builder
	original := log.Writer()
	log.SetOutput(&logged)
	defer log.SetOutput(original)

	created := fixture.create("secret@example.test", false)
	secret := strings.TrimPrefix(created.token, created.enrollment.ID+".")
	if secret == "" || secret == created.token {
		t.Fatalf("unexpected token shape: %q", created.token)
	}
	listed := fixture.listBody()
	for _, forbidden := range []string{created.token, secret} {
		if strings.Contains(listed, forbidden) {
			t.Fatalf("the list leaked the token: %s", listed)
		}
	}
	// The token must not even exist as a field in the payload.
	var parsed enrollmentListResponse
	if err := json.Unmarshal([]byte(listed), &parsed); err != nil {
		t.Fatal(err)
	}
	var shapes map[string]any
	if err := json.Unmarshal([]byte(listed), &shapes); err != nil {
		t.Fatal(err)
	}
	for key := range shapes["enrollments"].([]any)[0].(map[string]any) {
		if strings.Contains(strings.ToLower(key), "token") {
			t.Fatalf("the payload exposes a token field: %q", key)
		}
	}
	if changes := fixture.auditChanges(); strings.Contains(changes, secret) || strings.Contains(changes, created.token) {
		t.Fatalf("audit leaked the token: %s", changes)
	}
	// Completing the activation must not resurrect it anywhere readable either.
	if response := fixture.complete(created.token, "Secret", "password123"); response.Code != http.StatusOK {
		t.Fatalf("activation status=%d body=%s", response.Code, response.Body.String())
	}
	if strings.Contains(fixture.listBody(), secret) || strings.Contains(fixture.auditChanges(), secret) {
		t.Fatal("the token reappeared after activation")
	}
	log.SetOutput(original)
	if strings.Contains(logged.String(), secret) || strings.Contains(logged.String(), created.token) {
		t.Fatalf("the token reached the server log: %s", logged.String())
	}
}

// TestEnrollmentCompletionIsRateLimitedPerEmail covers the single-instance
// protection of §11.5 in the dimension that names the protected resource.
func TestEnrollmentCompletionIsRateLimitedPerEmail(t *testing.T) {
	fixture := newEnrollmentFixtureWithLimits(t, site.EnrollmentLimits{Window: time.Minute, PerEmail: 2, Instance: 30})
	created := fixture.create("budget@example.test", false)
	if response := fixture.complete(created.token, "Budget", "password123"); response.Code != http.StatusOK {
		t.Fatalf("first activation status=%d body=%s", response.Code, response.Body.String())
	}
	// One more attempt is admitted and simply finds nothing left to do.
	assertAPIError(t, fixture.complete(created.token, "Budget", "password123"), http.StatusNotFound, "NOT_FOUND")
	limited := fixture.complete(created.token, "Budget", "password123")
	assertAPIError(t, limited, http.StatusTooManyRequests, "RATE_LIMITED")
	if retryAfter := limited.Header().Get("Retry-After"); retryAfter == "" {
		t.Fatal("429 without Retry-After")
	}
	if got := fixture.userCount(); got != 2 {
		t.Fatalf("users = %d, want the administrator and one activation", got)
	}
}

// TestEnrollmentCompletionIsRateLimitedAcrossTheInstance covers the other half:
// rotating mailboxes must not buy an unlimited number of expensive attempts.
func TestEnrollmentCompletionIsRateLimitedAcrossTheInstance(t *testing.T) {
	fixture := newEnrollmentFixtureWithLimits(t, site.EnrollmentLimits{Window: time.Minute, PerEmail: 10, Instance: 3})
	tokens := []string{}
	for index := 0; index < 4; index++ {
		tokens = append(tokens, fixture.create("burst"+strconv.Itoa(index)+"@example.test", false).token)
	}
	for index, token := range tokens {
		response := fixture.complete(token, "Burst", "password123")
		if index < 3 {
			if response.Code != http.StatusOK {
				t.Fatalf("attempt %d status=%d body=%s", index, response.Code, response.Body.String())
			}
			continue
		}
		assertAPIError(t, response, http.StatusTooManyRequests, "RATE_LIMITED")
		if response.Header().Get("Retry-After") == "" {
			t.Fatal("instance limit without Retry-After")
		}
	}
	if got := fixture.userCount(); got != 4 {
		t.Fatalf("users = %d, want the administrator plus three allowed activations", got)
	}
	if rows := fixture.row(enrollmentIDsFor(fixture, "burst3@example.test")[0]); rows.status != site.EnrollmentPending {
		t.Fatalf("the throttled enrollment changed: %#v", rows)
	}
}

func (f *enrollmentFixture) listEnrollmentAudit(action string) []site.AuditEvent {
	f.t.Helper()
	query := "/admin/audit-events?targetType=account_enrollment"
	if action != "" {
		query += "&action=" + action
	}
	response := f.request(http.MethodGet, query, "", f.adminSession, false)
	if response.Code != http.StatusOK {
		f.t.Fatalf("audit query %s: status=%d body=%s", query, response.Code, response.Body.String())
	}
	var body auditEventsResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		f.t.Fatal(err)
	}
	return body.Events
}

// TestEnrollmentActionsAreQueryableInTheAuditTrail covers read side of the new
// actions: what the write side recorded has to be findable, and the target type
// has to be part of the whitelist rather than silently unknown.
func TestEnrollmentActionsAreQueryableInTheAuditTrail(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	superseded := fixture.create("audited@example.test", false)
	replacement := fixture.create("audited@example.test", false)
	if got := fixture.revoke(replacement.enrollment.ID); got.Code != http.StatusNoContent {
		t.Fatalf("revoking the live record: status=%d body=%s", got.Code, got.Body.String())
	}
	if response := fixture.complete(fixture.create("audited2@example.test", false).token, "Audited", "password123"); response.Code != http.StatusOK {
		t.Fatalf("activation status=%d body=%s", response.Code, response.Body.String())
	}
	if rows := fixture.row(superseded.enrollment.ID); rows.status != site.EnrollmentRevoked {
		t.Fatalf("the superseded record = %#v", rows)
	}

	events := fixture.listEnrollmentAudit("")
	var created, revoked int
	for _, event := range events {
		switch event.Action {
		case site.ActionEnrollmentCreated:
			created++
			if event.TargetType != "account_enrollment" || event.TargetID == nil {
				t.Fatalf("enrollment audit target = %+v", event)
			}
		case site.ActionEnrollmentRevoked:
			revoked++
		default:
			t.Fatalf("unexpected action in the enrollment trail: %s", event.Action)
		}
		if event.ActorID == nil || *event.ActorID != fixture.adminID {
			t.Fatalf("audit actor = %v, want the issuing administrator", event.ActorID)
		}
	}
	if created != 3 || revoked != 1 {
		t.Fatalf("created=%d revoked=%d, want 3 and 1", created, revoked)
	}
	// The account-side row is one row about a user, not about the record.
	enrolled := fixture.listEnrollmentAudit(site.ActionAccountEnrolled)
	if len(enrolled) != 0 {
		t.Fatalf("account.enrolled is filed against the user target: %+v", enrolled)
	}
	accountEvents := func(action string) []site.AuditEvent {
		t.Helper()
		response := fixture.request(http.MethodGet, "/admin/audit-events?targetType=user&action="+action, "", fixture.adminSession, false)
		if response.Code != http.StatusOK {
			t.Fatalf("audit query: status=%d body=%s", response.Code, response.Body.String())
		}
		var body auditEventsResponse
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body.Events
	}
	rows := accountEvents(site.ActionAccountEnrolled)
	if len(rows) != 1 || rows[0].TargetID == nil || *rows[0].TargetID != fixture.mustAccount("audited2@example.test").id {
		t.Fatalf("account.enrolled rows = %+v", rows)
	}
	if rows[0].Changes["signupSource"] != site.KindAdminCreated {
		t.Fatalf("account.enrolled changes = %#v", rows[0].Changes)
	}
	// An unknown action is rejected rather than ignored, as everywhere else.
	assertAPIError(t, fixture.request(http.MethodGet, "/admin/audit-events?action=enrollment.burninated", "", fixture.adminSession, false), http.StatusBadRequest, "INVALID_REQUEST")
}

func enrollmentIDsFor(f *enrollmentFixture, email string) []string {
	f.t.Helper()
	rows, err := f.db.Query(`SELECT id FROM account_enrollments WHERE email=? ORDER BY id`, email)
	if err != nil {
		f.t.Fatal(err)
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			f.t.Fatal(err)
		}
		ids = append(ids, id)
	}
	return ids
}

// TestEnrollmentCompletionRejectsCrossSiteRequests covers the anonymous CSRF
// story: there is no session to bind a token to, so the request still has to be
// provably same-origin instead of relying on cookies nobody has yet.
func TestEnrollmentCompletionRejectsCrossSiteRequests(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	// Each refusal needs its own record so one verdict cannot depend on the
	// state another case left behind.
	index := 0
	for name, headers := range map[string]map[string]string{
		"foreign origin":                {"Origin": "https://evil.test"},
		"cross-site fetch":              {"Sec-Fetch-Site": "cross-site"},
		"another same-site application": {"Sec-Fetch-Site": "same-site"},
		"unparsable origin":             {"Origin": "http://[::1"},
	} {
		created := fixture.create("origin"+strconv.Itoa(index)+"@example.test", false)
		index++
		response := fixture.completeWithHeaders(created.token, "Origin", "password123", headers)
		assertAPIError(t, response, http.StatusForbidden, "CSRF_INVALID")
		if _, err := fixture.account("origin" + strconv.Itoa(index-1) + "@example.test"); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("%s created an account: %v", name, err)
		}
		if rows := fixture.row(created.enrollment.ID); rows.status != site.EnrollmentPending {
			t.Fatalf("%s changed the record: %#v", name, rows)
		}
		fixture.revoke(created.enrollment.ID)
	}
	// A same-origin browser request, an explicit protocol/host match and a plain
	// API client all get through: only third-party pages are fenced off.
	index = 0
	for name, headers := range map[string]map[string]string{
		"same-origin browser": {"Sec-Fetch-Site": "same-origin"},
		"matching origin":     {"Origin": "http://example.com"},
		"api client":          {},
	} {
		created := fixture.create("same-origin"+strconv.Itoa(index)+"@example.test", false)
		index++
		if response := fixture.completeWithHeaders(created.token, "Same Origin", "password123", headers); response.Code != http.StatusOK {
			t.Fatalf("%s refused: status=%d body=%s", name, response.Code, response.Body.String())
		}
	}
}

// TestEnrollmentInputValidation covers the shared account rules: a refusal is a
// client-visible 400 and never leaves a partial row behind.
func TestEnrollmentInputValidation(t *testing.T) {
	for name, body := range map[string]string{
		"missing @":      `{"email":"nope","canCreateWorkspace":false}`,
		"empty":          `{"email":"","canCreateWorkspace":false}`,
		"unknown field":  `{"email":"ok@example.test","canCreateWorkspace":false,"extra":true}`,
		"email not text": `{"email":42,"canCreateWorkspace":false}`,
	} {
		fixture := newEnrollmentFixture(t)
		response := fixture.request(http.MethodPost, "/admin/account-enrollments", body, fixture.adminSession, true)
		assertAPIError(t, response, http.StatusBadRequest, "INVALID_REQUEST")
		if got := fixture.enrollmentCount(); got != 0 {
			t.Fatalf("%s stored a row: %d", name, got)
		}
		if rows := fixture.auditActions(); len(rows) != 0 {
			t.Fatalf("%s wrote audit rows: %v", name, rows)
		}
	}

	fixture := newEnrollmentFixture(t)
	created := fixture.create("rules@example.test", false)
	for name, body := range map[string]string{
		"short password": `{"token":"` + created.token + `","name":"Rules","password":"short"}`,
		"empty name":     `{"token":"` + created.token + `","name":"   ","password":"password123"}`,
		"missing token":  `{"name":"Rules","password":"password123"}`,
		"unknown field":  `{"token":"` + created.token + `","name":"Rules","password":"password123","extra":1}`,
	} {
		response := fixture.request(http.MethodPost, "/auth/account-enrollments/complete", body, "", false)
		assertAPIError(t, response, http.StatusBadRequest, "INVALID_REQUEST")
		if _, err := fixture.account("rules@example.test"); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("%s created an account: %v", name, err)
		}
	}
	if rows := fixture.row(created.enrollment.ID); rows.status != site.EnrollmentPending {
		t.Fatalf("invalid attempts consumed the record: %#v", rows)
	}
}

// TestEnrollmentCompletionDoesNotSelfLock covers FAIL-03 for this slice: every
// read inside the transaction has to use it, because the pool allows a single
// open connection.
func TestEnrollmentCompletionDoesNotSelfLock(t *testing.T) {
	fixture := newEnrollmentFixture(t)
	created := fixture.create("lock@example.test", false)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		request := httptest.NewRequest(http.MethodPost, "/auth/account-enrollments/complete",
			strings.NewReader(`{"token":"`+created.token+`","name":"Lock","password":"password123"}`)).WithContext(ctx)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		fixture.handler.ServeHTTP(response, request)
		done <- response
	}()
	select {
	case response := <-done:
		if response.Code != http.StatusOK {
			t.Fatalf("activation status=%d body=%s", response.Code, response.Body.String())
		}
	case <-time.After(8 * time.Second):
		t.Fatal("activation self-locked on the single database connection")
	}
	fixture.mustAccount("lock@example.test")
}
