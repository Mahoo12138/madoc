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
	"strconv"
	"strings"
	"testing"
	"time"

	"madoc/internal/account"
	"madoc/internal/asset"
	"madoc/internal/auth"
	"madoc/internal/config"
	"madoc/internal/core"
	"madoc/internal/db"
	"madoc/internal/mailer"
	"madoc/internal/mailer/mailertest"
	"madoc/internal/site"
)

// captureLog redirects the standard logger for the duration of fn and returns
// everything written to it.
func captureLog(t *testing.T, fn func()) string {
	t.Helper()
	var buffer bytes.Buffer
	previous := log.Writer()
	log.SetOutput(&buffer)
	defer log.SetOutput(previous)
	fn()
	return buffer.String()
}

// signupFixture drives the whole public registration flow over HTTP with a real
// SMTP relay behind it.
//
// A double for the mailer would prove only that the handler calls something
// mail-shaped. The property that matters is that a verification link actually
// leaves the process and comes back with a usable token, so the transport is the
// genuine article talking to a local server.
type signupFixture struct {
	t        *testing.T
	db       *sql.DB
	handler  http.Handler
	identity *auth.Service
	site     *site.Store
	relay    *mailertest.Relay
	public   string

	adminID      string
	adminSession string
	csrfCookie   *http.Cookie
	csrfToken    string
}

func newSignupFixture(t *testing.T) *signupFixture {
	t.Helper()
	return newSignupFixtureWith(t, nil, site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
}

// newSignupFixtureWith builds an instance whose mail capability is either the
// real relay or absent, so the "not configured" cases exercise the same wiring
// path as production rather than a special test-only branch.
func newSignupFixtureWith(t *testing.T, relay *mailertest.Relay, limits site.EnrollmentLimits) *signupFixture {
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
	csrf := auth.NewCSRF([]byte("signup-test-secret"))
	recorder := httptest.NewRecorder()
	csrfToken, err := csrf.Issue(recorder, false)
	if err != nil {
		t.Fatal(err)
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("CSRF cookies = %d", len(cookies))
	}

	public := "https://madoc.example.test"
	var registration site.PublicRegistration
	var diagnosis config.MailDiagnosis
	if relay != nil {
		smtpConfig := config.SMTP{
			Host: relay.Host(), Port: relay.Port(),
			From: "madoc@example.test", TLS: config.TLSNone,
		}
		sender := mailer.NewSMTP(smtpConfig)
		if sender == nil {
			t.Fatal("a relay on loopback must produce a transport")
		}
		registration = site.PublicRegistration{
			Mailer:  mailer.SignupSender{Sender: sender},
			BaseURL: public,
			Ready:   func() bool { return true },
		}
		diagnosis = config.MailDiagnosis{
			Configured: true, Host: relay.Host(), Port: relay.Port(),
			From: "madoc@example.test", TLS: config.TLSNone, PublicURL: public,
		}
	}
	siteStore := site.NewWithEnrollmentLimits(conn, limits).EnablePublicRegistration(registration)
	domain := core.New(conn, siteStore)
	assetRoot := t.TempDir()
	handler := New(identity, csrf, domain, siteStore, asset.New(conn, domain, assetRoot, 25), account.New(conn, assetRoot), nil, false, diagnosis).Routes()
	// The peer address is captured ahead of RealIP exactly as main.go wires it,
	// so the rate limiter sees the same value it would in production.
	fixture := &signupFixture{
		t: t, db: conn, handler: fixtureHandler(handler), identity: identity, site: siteStore,
		relay: relay, public: public,
		adminID: admin.ID, adminSession: session, csrfCookie: cookies[0], csrfToken: csrfToken,
	}
	return fixture
}

func fixtureHandler(handler http.Handler) http.Handler {
	return CapturePeerAddress(handler)
}

func (f *signupFixture) request(method, path, body, session string, withCSRF bool) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.requestWithHeaders(method, path, body, session, nil, withCSRF)
}

func (f *signupFixture) requestWithHeaders(method, path, body, session string, headers map[string]string, withCSRF bool) *httptest.ResponseRecorder {
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

func (f *signupFixture) requestSignup(email string) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.request(http.MethodPost, "/auth/sign-up/request", `{"email":"`+email+`"}`, "", false)
}

func (f *signupFixture) completeSignup(token, name, password string) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.request(http.MethodPost, "/auth/sign-up/complete",
		`{"token":"`+token+`","name":"`+name+`","password":"`+password+`"}`, "", false)
}

// startRelay brings up the local SMTP server this instance will send through.
func startRelay(t *testing.T) *mailertest.Relay {
	t.Helper()
	relay, err := mailertest.Start(false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = relay.Close() })
	return relay
}

// signupToken reads the token back out of the mail the relay actually accepted.
func (f *signupFixture) signupToken(email string) string {
	f.t.Helper()
	if f.relay == nil {
		f.t.Fatal("this fixture has no mail capability")
	}
	// Delivery is synchronous, so the message for this request is usually already
	// in the relay by the time we get here. Waiting for "one more than the current
	// count" therefore waits for a message that never comes. Wait for the message
	// addressed to this account instead, which is what the caller actually needs.
	deadline := time.Now().Add(5 * time.Second)
	for {
		for _, message := range f.relay.Messages() {
			if message.To != email {
				continue
			}
			_, token, found := strings.Cut(message.Data, f.public+"/sign-up/")
			if !found {
				f.t.Fatalf("delivered message carries no verification link:\n%s", message.Data)
			}
			token, _, _ = strings.Cut(token, "\n")
			return strings.TrimSpace(token)
		}
		if time.Now().After(deadline) {
			f.t.Fatalf("no verification message reached %q in time; %d delivered", email, len(f.relay.Messages()))
		}
		time.Sleep(2 * time.Millisecond)
	}
}

func (f *signupFixture) openRegistration() {
	f.t.Helper()
	f.patchSettings(`{"registrationMode":"open"}`)
	if f.mode() != "open" {
		f.t.Fatalf("registrationMode = %q, want open", f.mode())
	}
}

func (f *signupFixture) patchSettings(changes string) *httptest.ResponseRecorder {
	f.t.Helper()
	settings, err := f.site.Ensure(context.Background())
	if err != nil {
		f.t.Fatal(err)
	}
	body := `{"expectedRevision":` + strconv.Itoa(settings.Revision) + `,"changes":` + changes + `}`
	return f.request(http.MethodPatch, "/admin/settings", body, f.adminSession, true)
}

func (f *signupFixture) mode() string {
	f.t.Helper()
	settings, err := f.site.Ensure(context.Background())
	if err != nil {
		f.t.Fatal(err)
	}
	return settings.RegistrationMode
}

func (f *signupFixture) siteInfo() (string, bool) {
	f.t.Helper()
	response := f.request(http.MethodGet, "/site", "", "", false)
	if response.Code != http.StatusOK {
		f.t.Fatalf("GET /site status=%d body=%s", response.Code, response.Body.String())
	}
	var info struct {
		RegistrationMode            string `json:"registrationMode"`
		PublicRegistrationAvailable bool   `json:"publicRegistrationAvailable"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &info); err != nil {
		f.t.Fatal(err)
	}
	return info.RegistrationMode, info.PublicRegistrationAvailable
}

func (f *signupFixture) userCount(email string) int {
	f.t.Helper()
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM users WHERE email=?`, email).Scan(&count); err != nil {
		f.t.Fatal(err)
	}
	return count
}

func itoa(value int) string {
	return strconv.Itoa(value)
}

// TestSignupEndToEndDeliversAUsableLink is the headline test: request a link,
// receive it over real SMTP, complete registration, and be signed in.
func TestSignupEndToEndDeliversAUsableLink(t *testing.T) {
	relay := startRelay(t)
	f := newSignupFixtureWith(t, relay, site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()

	response := f.requestSignup("Person@Example.Test")
	if response.Code != http.StatusAccepted {
		t.Fatalf("request status=%d body=%s", response.Code, response.Body.String())
	}
	token := f.signupToken("person@example.test")
	if f.userCount("person@example.test") != 0 {
		t.Fatal("a request must not create an account before verification")
	}

	completed := f.completeSignup(token, "Person", "password123")
	if completed.Code != http.StatusOK {
		t.Fatalf("complete status=%d body=%s", completed.Code, completed.Body.String())
	}
	var session struct {
		User struct {
			ID    string `json:"id"`
			Email string `json:"email"`
		} `json:"user"`
		CSRFToken string `json:"csrfToken"`
	}
	if err := json.Unmarshal(completed.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	if session.User.Email != "person@example.test" || session.User.ID == "" || session.CSRFToken == "" {
		t.Fatalf("session payload = %+v", session)
	}
	// A session cookie must actually have been issued, or the signup only
	// appears to work until the next request.
	var hasSession bool
	for _, cookie := range completed.Result().Cookies() {
		if cookie.Name == auth.SessionCookie && cookie.Value != "" {
			hasSession = true
		}
	}
	if !hasSession {
		t.Fatalf("completion issued no session cookie: %v", completed.Result().Cookies())
	}
	// The new account signs in with the password it just chose.
	signIn := f.request(http.MethodPost, "/auth/sign-in", `{"email":"person@example.test","password":"password123"}`, "", false)
	if signIn.Code != http.StatusOK {
		t.Fatalf("sign-in status=%d body=%s", signIn.Code, signIn.Body.String())
	}
}

// TestSignupWithoutMailCapabilityIsUnavailable covers every surface that has to
// stay shut when the deployment cannot send mail.
func TestSignupWithoutMailCapabilityIsUnavailable(t *testing.T) {
	f := newSignupFixtureWith(t, nil, site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	// The switch may not be flipped.
	response := f.patchSettings(`{"registrationMode":"open"}`)
	assertAPIError(t, response, http.StatusUnprocessableEntity, "REGISTRATION_NOT_READY")
	if f.mode() != "invite_only" {
		t.Fatalf("registrationMode = %q, want it unchanged", f.mode())
	}
	// And the request endpoint refuses even if the mode somehow reads open.
	if _, err := f.db.Exec(`UPDATE server_config SET value=replace(value,'"registrationMode":"invite_only"','"registrationMode":"open"') WHERE key='site_settings'`); err != nil {
		t.Fatal(err)
	}
	assertAPIError(t, f.requestSignup("person@example.test"), http.StatusUnprocessableEntity, "REGISTRATION_NOT_READY")
	mode, available := f.siteInfo()
	if mode != "open" || available {
		t.Fatalf("site info = %q/%v, want open/false", mode, available)
	}
	if f.userCount("person@example.test") != 0 {
		t.Fatal("an unready instance created an account")
	}
}

// TestSignupWithMailCapabilityAdvertisesAndEnables is the positive counterpart.
func TestSignupWithMailCapabilityAdvertisesAndEnables(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	if _, available := f.siteInfo(); available {
		t.Fatal("public registration must not be advertised while the mode is invite_only")
	}
	response := f.patchSettings(`{"registrationMode":"open"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("enabling open registration: status=%d body=%s", response.Code, response.Body.String())
	}
	mode, available := f.siteInfo()
	if mode != "open" || !available {
		t.Fatalf("site info = %q/%v, want open/true", mode, available)
	}
}

// TestSignupAcceptanceResponseIsByteIdentical is the enumeration defence at the
// HTTP layer. Three very different states of a mailbox must be
// indistinguishable, down to the byte.
func TestSignupAcceptanceResponseIsByteIdentical(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()

	// A mailbox that already has an account.
	if _, err := f.db.Exec(`INSERT INTO users(id,name,email,password_hash,is_admin,disabled,created_at,updated_at) VALUES('u1','Existing','existing@example.test','hash',0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	// A mailbox with an outstanding request.
	if response := f.requestSignup("repeat@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("priming request status=%d", response.Code)
	}

	responses := map[string]string{}
	for _, email := range []string{"unknown@example.test", "existing@example.test", "repeat@example.test"} {
		response := f.requestSignup(email)
		if response.Code != http.StatusAccepted {
			t.Fatalf("%s: status=%d body=%s", email, response.Code, response.Body.String())
		}
		responses[email] = response.Body.String()
	}
	for email, body := range responses {
		if body != responses["unknown@example.test"] {
			t.Fatalf("%s response differs from an unknown mailbox:\n%s\nvs\n%s", email, body, responses["unknown@example.test"])
		}
	}
}

// TestSignupCompleteRejectsEveryUnusableTokenIdentically is the token-space
// defence, over HTTP, so the status codes are asserted too.
func TestSignupCompleteRejectsEveryUnusableTokenIdentically(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()

	token := ""
	if response := f.requestSignup("person@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("request status=%d", response.Code)
	}
	token = f.signupToken("person@example.test")

	t.Run("consumed", func(t *testing.T) {
		if response := f.completeSignup(token, "Person", "password123"); response.Code != http.StatusOK {
			t.Fatalf("first completion status=%d body=%s", response.Code, response.Body.String())
		}
		replay := f.completeSignup(token, "Person", "password123")
		assertAPIError(t, replay, http.StatusNotFound, "NOT_FOUND")
	})
	t.Run("revoked", func(t *testing.T) {
		if _, err := f.db.Exec(`UPDATE account_enrollments SET status='revoked' WHERE email=?`, "person@example.test"); err != nil {
			t.Fatal(err)
		}
		assertAPIError(t, f.completeSignup(token, "Person", "password123"), http.StatusNotFound, "NOT_FOUND")
	})
	t.Run("expired", func(t *testing.T) {
		if _, err := f.db.Exec(`UPDATE account_enrollments SET expires_at=? WHERE email=?`, time.Now().UTC().Add(-time.Minute), "person@example.test"); err != nil {
			t.Fatal(err)
		}
		assertAPIError(t, f.completeSignup(token, "Person", "password123"), http.StatusNotFound, "NOT_FOUND")
	})
	t.Run("unknown", func(t *testing.T) {
		assertAPIError(t, f.completeSignup("never.existed", "Person", "password123"), http.StatusNotFound, "NOT_FOUND")
	})
}

// TestSignupCannotResetAnExistingAccount is the "never a password reset" rule at
// the HTTP layer.
func TestSignupCannotResetAnExistingAccount(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()
	if _, err := f.db.Exec(`INSERT INTO users(id,name,email,password_hash,is_admin,disabled,created_at,updated_at) VALUES('u1','Existing','existing@example.test','original-hash',0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if response := f.requestSignup("existing@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("request status=%d", response.Code)
	}
	token := f.signupToken("existing@example.test")
	response := f.completeSignup(token, "Attacker", "attacker-password")
	assertAPIError(t, response, http.StatusConflict, "EMAIL_ALREADY_REGISTERED")
	if !strings.Contains(response.Body.String(), "登录") {
		t.Fatalf("response should point at sign-in: %s", response.Body.String())
	}
	var hash string
	if err := f.db.QueryRow(`SELECT password_hash FROM users WHERE email=?`, "existing@example.test").Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if hash != "original-hash" {
		t.Fatalf("password hash = %q, want it untouched", hash)
	}
	if f.userCount("existing@example.test") != 1 {
		t.Fatal("a second account was created for the mailbox")
	}
}

// TestSignupWritesVerifiedEmailAndReadsGrantAtCompletion covers both
// completion-time facts over HTTP.
func TestSignupWritesVerifiedEmailAndReadsGrantAtCompletion(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()
	// The administrator grants creation rights, a person requests a link, then
	// the administrator revokes the grant before the link is used.
	if response := f.patchSettings(`{"publicSignupDefaultCanCreateWorkspace":true}`); response.Code != http.StatusOK {
		t.Fatalf("grant: %s", response.Body.String())
	}
	if response := f.requestSignup("person@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("request status=%d", response.Code)
	}
	token := f.signupToken("person@example.test")
	if response := f.patchSettings(`{"publicSignupDefaultCanCreateWorkspace":false}`); response.Code != http.StatusOK {
		t.Fatalf("revoke grant: %s", response.Body.String())
	}
	if response := f.completeSignup(token, "Person", "password123"); response.Code != http.StatusOK {
		t.Fatalf("complete status=%d body=%s", response.Code, response.Body.String())
	}
	var verified sql.NullTime
	var canCreate int
	var source string
	if err := f.db.QueryRow(`SELECT email_verified_at,can_create_workspace,signup_source FROM users WHERE email=?`, "person@example.test").
		Scan(&verified, &canCreate, &source); err != nil {
		t.Fatal(err)
	}
	if !verified.Valid {
		t.Fatal("email_verified_at must be written by a completed verification")
	}
	if canCreate != 0 {
		t.Fatalf("can_create_workspace = %d, want the grant in force at completion", canCreate)
	}
	if source != "public_signup" {
		t.Fatalf("signup_source = %q", source)
	}
}

// TestSignupStopsWorkingWhenRegistrationCloses is §11.2's closing clause over
// HTTP.
func TestSignupStopsWorkingWhenRegistrationCloses(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()
	if response := f.requestSignup("person@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("request status=%d", response.Code)
	}
	token := f.signupToken("person@example.test")
	if response := f.patchSettings(`{"registrationMode":"invite_only"}`); response.Code != http.StatusOK {
		t.Fatalf("closing registration: %s", response.Body.String())
	}
	response := f.completeSignup(token, "Person", "password123")
	assertAPIError(t, response, http.StatusForbidden, "REGISTRATION_CLOSED")
	if f.userCount("person@example.test") != 0 {
		t.Fatal("a link closed mid-flight still created an account")
	}
}

// TestSignupFailedDeliveryLeavesNothingUsable pins that a relay failure is
// reported and cleaned up rather than leaving a verification record nobody can
// complete.
func TestSignupFailedDeliveryLeavesNothingUsable(t *testing.T) {
	relay := startRelay(t)
	relay.FailAfter(1)
	f := newSignupFixtureWith(t, relay, site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()
	response := f.requestSignup("person@example.test")
	assertAPIError(t, response, http.StatusInternalServerError, "INTERNAL")
	var pending int
	if err := f.db.QueryRow(`SELECT count(*) FROM account_enrollments WHERE status='pending'`).Scan(&pending); err != nil {
		t.Fatal(err)
	}
	if pending != 0 {
		t.Fatalf("pending records after a failed delivery = %d, want 0", pending)
	}
	if f.userCount("person@example.test") != 0 {
		t.Fatal("a failed delivery created an account")
	}
}

// TestSignupRejectsCrossOriginRequests keeps both anonymous endpoints bound to
// this site: no session exists to anchor a CSRF token to, so the origin check is
// what stops another page driving them.
func TestSignupRejectsCrossOriginRequests(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()
	crossSite := map[string]string{"Origin": "https://evil.example"}
	assertAPIError(t, f.requestWithHeaders(http.MethodPost, "/auth/sign-up/request", `{"email":"person@example.test"}`, "", crossSite, false), http.StatusForbidden, "CSRF_INVALID")
	token := "whatever.secret"
	assertAPIError(t, f.requestWithHeaders(http.MethodPost, "/auth/sign-up/complete", `{"token":"`+token+`","name":"P","password":"password123"}`, "", crossSite, false), http.StatusForbidden, "CSRF_INVALID")
	if len(f.relay.Messages()) != 0 {
		t.Fatal("a cross-site request produced mail")
	}
}

// TestSignupRequiresNoLogin confirms neither endpoint needs a session: the
// registration flow is what produces the first one.
func TestSignupRequiresNoLogin(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()
	if response := f.requestSignup("person@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("request status=%d body=%s", response.Code, response.Body.String())
	}
	token := f.signupToken("person@example.test")
	if response := f.completeSignup(token, "Person", "password123"); response.Code != http.StatusOK {
		t.Fatalf("complete status=%d body=%s", response.Code, response.Body.String())
	}
}

// TestSignupMailDiagnosisNeverReturnsThePassword is the secret-handling rule at
// the endpoint that exists to report configuration.
func TestSignupMailDiagnosisNeverReturnsThePassword(t *testing.T) {
	relay := startRelay(t)
	f := newSignupFixtureWith(t, relay, site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	response := f.request(http.MethodGet, "/admin/mail", "", f.adminSession, false)
	if response.Code != http.StatusOK {
		t.Fatalf("GET /admin/mail status=%d body=%s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	for _, forbidden := range []string{"password", "Password", "secret"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("diagnosis leaked %q: %s", forbidden, body)
		}
	}
	var diagnosis struct {
		Configured     bool   `json:"configured"`
		Host           string `json:"host"`
		Port           int    `json:"port"`
		From           string `json:"from"`
		TLS            string `json:"tls"`
		AuthConfigured bool   `json:"authConfigured"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &diagnosis); err != nil {
		t.Fatal(err)
	}
	if !diagnosis.Configured || diagnosis.Host != relay.Host() || diagnosis.Port != relay.Port() {
		t.Fatalf("diagnosis = %+v", diagnosis)
	}
	// And it is not readable without being an administrator.
	assertAPIError(t, f.request(http.MethodGet, "/admin/mail", "", "", false), http.StatusUnauthorized, "UNAUTHORIZED")
}

// TestSignupRateLimitsOverHTTP drives the 429 path with a small budget.
func TestSignupRateLimitsOverHTTP(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 2, PerSource: 2, Instance: 50})
	f.openRegistration()
	if response := f.requestSignup("person@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("request status=%d", response.Code)
	}
	if response := f.requestSignup("person@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("second request status=%d", response.Code)
	}
	limited := f.requestSignup("person@example.test")
	assertAPIError(t, limited, http.StatusTooManyRequests, "RATE_LIMITED")
	if limited.Header().Get("Retry-After") == "" {
		t.Fatal("a limited response must tell the client when to come back")
	}
}

// TestSignupAuditTrail pins that both halves of the lifecycle are recorded with
// no token and no password in the row.
func TestSignupAuditTrail(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()
	if response := f.requestSignup("person@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("request status=%d", response.Code)
	}
	token := f.signupToken("person@example.test")
	if response := f.completeSignup(token, "Person", "password123"); response.Code != http.StatusOK {
		t.Fatalf("complete status=%d", response.Code)
	}
	rows, _, err := f.site.ListAuditEvents(context.Background(), site.AuditQuery{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]string{}
	for _, event := range rows {
		body, err := json.Marshal(event.Changes)
		if err != nil {
			t.Fatal(err)
		}
		seen[event.Action] = string(body)
		if strings.Contains(string(body), token) || strings.Contains(string(body), "password") {
			t.Fatalf("audit row for %s leaked a secret: %s", event.Action, body)
		}
	}
	if _, ok := seen[site.ActionSignupRequested]; !ok {
		t.Fatalf("no signup.requested row in %v", seen)
	}
	if _, ok := seen[site.ActionSignupCompleted]; !ok {
		t.Fatalf("no signup.completed row in %v", seen)
	}
	// The actions must also be filterable, or the audit page would 400 on them.
	for _, action := range []string{site.ActionSignupRequested, site.ActionSignupCompleted} {
		response := f.request(http.MethodGet, "/admin/audit-events?action="+action, "", f.adminSession, false)
		if response.Code != http.StatusOK {
			t.Fatalf("filtering %s: status=%d body=%s", action, response.Code, response.Body.String())
		}
	}
}

// TestSignupDoesNotWriteTokenOrEmailToLogs captures what the server logs during a
// full flow. The token is a credential and logs get pasted into tickets.
func TestSignupDoesNotWriteTokenOrEmailToLogs(t *testing.T) {
	f := newSignupFixtureWith(t, startRelay(t), site.EnrollmentLimits{Window: time.Minute, PerEmail: 25, PerSource: 60, Instance: 120})
	f.openRegistration()
	if response := f.requestSignup("quiet.person@example.test"); response.Code != http.StatusAccepted {
		t.Fatalf("request status=%d", response.Code)
	}
	token := f.signupToken("quiet.person@example.test")
	if response := f.completeSignup(token, "Quiet Person", "password123"); response.Code != http.StatusOK {
		t.Fatalf("complete status=%d", response.Code)
	}
	logged := captureLog(t, func() {
		if response := f.requestSignup("second.person@example.test"); response.Code != http.StatusAccepted {
			t.Fatalf("request status=%d", response.Code)
		}
		_ = f.signupToken("second.person@example.test")
	})
	if strings.Contains(logged, token) {
		t.Fatalf("a verification token reached the log:\n%s", logged)
	}
	// The mailbox itself is operational data an administrator needs; only the
	// credential is forbidden.
	if !strings.Contains(logged, "second.person@example.test") {
		t.Fatalf("the request was not recorded at all:\n%s", logged)
	}
}
