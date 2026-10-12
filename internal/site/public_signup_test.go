package site

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

// signupSchema extends the shared leaf-package schema with the two things the
// registration flow reads and writes that the settings tests never touch: the
// verification records and the verified-mail timestamp on users.
const signupSchema = `
CREATE TABLE account_enrollments (
    id                   TEXT PRIMARY KEY,
    kind                 TEXT NOT NULL CHECK (kind IN ('public_signup', 'admin_created')),
    email                TEXT NOT NULL,
    token_hash           TEXT NOT NULL UNIQUE,
    status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'revoked')),
    expires_at           DATETIME NOT NULL,
    created_at           DATETIME NOT NULL,
    consumed_at          DATETIME,
    created_by           TEXT,
    can_create_workspace INTEGER CHECK (can_create_workspace IN (0, 1))
);
CREATE INDEX idx_account_enrollments_email_status ON account_enrollments(email, status);
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email_verified_at DATETIME;
ALTER TABLE users ADD COLUMN name TEXT;
`

// recordingMailer captures what would have been delivered. The HTTP-level
// tests use a real SMTP relay instead; this double exists for the store-level
// cases that only care about which record a link belongs to.
type recordingMailer struct {
	sent []sentMail
	err  error
}

type sentMail struct {
	To   string
	Link string
}

func (m *recordingMailer) SendSignupVerification(to, link string) error {
	if m.err != nil {
		return m.err
	}
	m.sent = append(m.sent, sentMail{To: to, Link: link})
	return nil
}

func readyPublicRegistration() PublicRegistration {
	return PublicRegistration{
		Mailer:  &recordingMailer{},
		BaseURL: "https://madoc.example.test",
		Ready:   func() bool { return true },
	}
}

// tokenFromLink pulls the opaque token back out of a delivered link, which is
// the only place the plaintext token ever exists.
func tokenFromLink(link string) string {
	_, token, found := strings.Cut(link, PublicSignupPath)
	if !found {
		return ""
	}
	return token
}

func newSignupStore(t *testing.T, registration PublicRegistration, limits EnrollmentLimits) *Store {
	t.Helper()
	conn := openSignupTestDB(t)
	return NewWithEnrollmentLimits(conn, limits).EnablePublicRegistration(registration)
}

func openSignupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "signup.db")
	conn, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(on)")
	if err != nil {
		t.Fatal(err)
	}
	// The production pool allows one connection; keeping the same limit here is
	// what makes a stray global-handle read inside a transaction fail here
	// instead of in production.
	conn.SetMaxOpenConns(1)
	if _, err := conn.Exec(siteSchema + signupSchema); err != nil {
		conn.Close()
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO server_config(key,value,updated_at) VALUES('site_settings',?,CURRENT_TIMESTAMP)`, defaultSiteSettings); err != nil {
		conn.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

// storeSiteSettings rewrites individual fields of the settings document so a
// test can state a precondition without going through the update rules under
// test. Fields are patched onto whatever is already stored rather than replaced
// from defaults: a test that changes one setting must not silently reset the
// others and then fail for an unrelated reason.
//
// The values are ordinary Go values, not JSON fragments: the document is
// re-encoded here, and a quoted string would survive as a literal quote.
func storeSiteSettings(t *testing.T, conn *sql.DB, fields map[string]any) {
	t.Helper()
	var raw string
	if err := conn.QueryRow(`SELECT value FROM server_config WHERE key='site_settings'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	doc := map[string]any{}
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		t.Fatal(err)
	}
	for key, value := range fields {
		doc[key] = value
	}
	body, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE server_config SET value=? WHERE key='site_settings'`, string(body)); err != nil {
		t.Fatal(err)
	}
}

func enablePublicMode(t *testing.T, conn *sql.DB, canCreateWorkspace bool) {
	t.Helper()
	storeSiteSettings(t, conn, map[string]any{
		KeyRegistrationMode:                      "open",
		KeyPublicSignupDefaultCanCreateWorkspace: canCreateWorkspace,
	})
}

func boolLiteral(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

func addExistingAccount(t *testing.T, conn *sql.DB, email, password string) {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if _, err := conn.Exec(`INSERT INTO users(id,name,email,password_hash,is_admin,disabled,can_create_workspace,signup_source,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,0,0,0,'setup',NULL,?,?)`,
		"existing", "Existing", email, string(hash), now, now); err != nil {
		t.Fatal(err)
	}
}

func userRow(t *testing.T, conn *sql.DB, email string) (signupSource string, canCreate int, verified *time.Time, passwordHash string) {
	t.Helper()
	if err := conn.QueryRow(`SELECT signup_source,can_create_workspace,email_verified_at,password_hash FROM users WHERE email=?`, email).
		Scan(&signupSource, &canCreate, &verified, &passwordHash); err != nil {
		t.Fatal(err)
	}
	return
}

func countUsers(t *testing.T, conn *sql.DB, email string) int {
	t.Helper()
	var count int
	if err := conn.QueryRow(`SELECT count(*) FROM users WHERE email=?`, email).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

// completeRequest builds a completion request with a deliberately cheap hash:
// these tests are about the decisions around the hash, not bcrypt's cost.
func completeRequest(token, name, password, source string) CompleteSignupRequest {
	return CompleteSignupRequest{
		Token: token, Name: name, Password: password, Source: source,
		HashPassword: func(password string) (string, error) {
			hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
			return string(hash), err
		},
	}
}

// TestPublicSignupCreatesNoAccountBeforeVerification is the core of §11.2: the
// request step only submits an address. Nothing may exist in users, and no
// password may be stored anywhere, or the flow would be a form that creates
// unverified accounts.
func TestPublicSignupCreatesNoAccountBeforeVerification(t *testing.T) {
	ctx := context.Background()
	mailer := &recordingMailer{}
	conn := openSignupTestDB(t)
	enablePublicMode(t, conn, true)
	store := New(conn).EnablePublicRegistration(PublicRegistration{
		Mailer: mailer, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
	})

	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "  New.Person@Example.Test ", Source: "203.0.113.9"}); err != nil {
		t.Fatalf("RequestPublicSignup() error = %v", err)
	}
	if count := countUsers(t, conn, "new.person@example.test"); count != 0 {
		t.Fatalf("users rows for an unverified mailbox = %d, want 0", count)
	}
	if len(mailer.sent) != 1 {
		t.Fatalf("delivered messages = %d, want 1", len(mailer.sent))
	}
	// Normalization is the one shared rule: trim and lowercase, never fold
	// provider-specific parts away.
	if mailer.sent[0].To != "new.person@example.test" {
		t.Fatalf("delivered to %q", mailer.sent[0].To)
	}
	if !strings.HasPrefix(mailer.sent[0].Link, "https://madoc.example.test/sign-up/") {
		t.Fatalf("link %q is not built from the configured public address", mailer.sent[0].Link)
	}
	token := tokenFromLink(mailer.sent[0].Link)
	if token == "" {
		t.Fatal("delivered link carries no token")
	}
	var stored string
	if err := conn.QueryRow(`SELECT token_hash FROM account_enrollments WHERE email=?`, "new.person@example.test").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == token {
		t.Fatal("the plaintext token must never be stored; only its digest is")
	}
}

// TestPublicSignupCompletionWritesVerifiedEmailAndCompletionTimeGrant covers the
// two things only a real verification flow may do: stamp email_verified_at and
// take the initial grant from the settings in force right now.
func TestPublicSignupCompletionWritesVerifiedEmailAndCompletionTimeGrant(t *testing.T) {
	ctx := context.Background()
	for _, grant := range []bool{true, false} {
		t.Run(boolLiteral(grant), func(t *testing.T) {
			mailer := &recordingMailer{}
			conn := openSignupTestDB(t)
			enablePublicMode(t, conn, grant)
			store := New(conn).EnablePublicRegistration(PublicRegistration{
				Mailer: mailer, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
			})
			if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); err != nil {
				t.Fatal(err)
			}
			token := tokenFromLink(mailer.sent[0].Link)
			account, err := store.CompletePublicSignup(ctx, completeRequest(token, "Person", "password123", "203.0.113.9"))
			if err != nil {
				t.Fatalf("CompletePublicSignup() error = %v", err)
			}
			source, canCreate, verified, _ := userRow(t, conn, "person@example.test")
			if source != KindPublicSignup {
				t.Fatalf("signup_source = %q", source)
			}
			if verified == nil {
				t.Fatal("email_verified_at must be written by a completed verification")
			}
			if canCreate != boolToInt(grant) || account.CanCreateWorkspace != grant {
				t.Fatalf("can_create_workspace = %d/%v, want %v", canCreate, account.CanCreateWorkspace, grant)
			}
			if account.Email != "person@example.test" {
				t.Fatalf("account email = %q", account.Email)
			}
		})
	}
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

// TestPublicSignupGrantIsReadAtCompletionNotAtRequest is §11.4's specific
// warning. An administrator who tightens the default after a link was mailed
// must actually tighten it for that link — freezing the value into the record at
// request time would hand out the old grant.
func TestPublicSignupGrantIsReadAtCompletionNotAtRequest(t *testing.T) {
	ctx := context.Background()
	mailer := &recordingMailer{}
	conn := openSignupTestDB(t)
	enablePublicMode(t, conn, true)
	store := New(conn).EnablePublicRegistration(PublicRegistration{
		Mailer: mailer, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
	})
	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); err != nil {
		t.Fatal(err)
	}
	token := tokenFromLink(mailer.sent[0].Link)

	// The administrator tightens the default while the link is out.
	storeSiteSettings(t, conn, map[string]any{KeyPublicSignupDefaultCanCreateWorkspace: false})

	account, err := store.CompletePublicSignup(ctx, completeRequest(token, "Person", "password123", "203.0.113.9"))
	if err != nil {
		t.Fatalf("CompletePublicSignup() error = %v", err)
	}
	if account.CanCreateWorkspace {
		t.Fatal("the grant must come from the settings at completion time")
	}
	_, canCreate, _, _ := userRow(t, conn, "person@example.test")
	if canCreate != 0 {
		t.Fatalf("stored can_create_workspace = %d, want 0", canCreate)
	}
}

// TestPublicSignupLinkStopsWorkingWhenRegistrationCloses is the other half of
// §11.2. A mailed link is a statement about the world when it was sent, not a
// standing credential.
func TestPublicSignupLinkStopsWorkingWhenRegistrationCloses(t *testing.T) {
	ctx := context.Background()
	mailer := &recordingMailer{}
	conn := openSignupTestDB(t)
	enablePublicMode(t, conn, true)
	store := New(conn).EnablePublicRegistration(PublicRegistration{
		Mailer: mailer, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
	})
	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); err != nil {
		t.Fatal(err)
	}
	token := tokenFromLink(mailer.sent[0].Link)

	storeSiteSettings(t, conn, map[string]any{KeyRegistrationMode: "invite_only"})

	if _, err := store.CompletePublicSignup(ctx, completeRequest(token, "Person", "password123", "203.0.113.9")); !errors.Is(err, ErrRegistrationClosed) {
		t.Fatalf("completion after closing error = %v, want ErrRegistrationClosed", err)
	}
	if count := countUsers(t, conn, "person@example.test"); count != 0 {
		t.Fatalf("a refused completion created %d accounts", count)
	}
	// The record must stay consumable-in-principle rather than being burned, so
	// re-opening the mode does not silently strand the person who asked.
	var status string
	if err := conn.QueryRow(`SELECT status FROM account_enrollments WHERE email=?`, "person@example.test").Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != EnrollmentPending {
		t.Fatalf("record status = %q, want it left pending", status)
	}
}

// TestPublicSignupRefusesToResetAnExistingAccount pins that a verification link
// is not a password reset. The existing hash must come out byte-identical.
func TestPublicSignupRefusesToResetAnExistingAccount(t *testing.T) {
	ctx := context.Background()
	mailer := &recordingMailer{}
	conn := openSignupTestDB(t)
	enablePublicMode(t, conn, true)
	store := New(conn).EnablePublicRegistration(PublicRegistration{
		Mailer: mailer, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
	})
	addExistingAccount(t, conn, "person@example.test", "original-password")
	_, _, _, before := userRow(t, conn, "person@example.test")

	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); err != nil {
		t.Fatalf("RequestPublicSignup() error = %v", err)
	}
	token := tokenFromLink(mailer.sent[0].Link)

	if _, err := store.CompletePublicSignup(ctx, completeRequest(token, "Person", "attacker-password", "203.0.113.9")); !errors.Is(err, ErrEmailAlreadyRegistered) {
		t.Fatalf("completion error = %v, want ErrEmailAlreadyRegistered", err)
	}
	_, _, _, after := userRow(t, conn, "person@example.test")
	if before != after {
		t.Fatal("the existing password hash was rewritten by the registration flow")
	}
}

// TestPublicSignupEveryUnusableTokenIsOneVerdict is the anti-enumeration
// property: unknown, revoked, consumed and expired must be indistinguishable.
func TestPublicSignupEveryUnusableTokenIsOneVerdict(t *testing.T) {
	ctx := context.Background()
	// Each case gets its own instance: a token consumed in one case would
	// otherwise change what the next case is actually testing.
	newStore := func() (*Store, *sql.DB, *recordingMailer) {
		relay := &recordingMailer{}
		database := openSignupTestDB(t)
		enablePublicMode(t, database, true)
		return New(database).EnablePublicRegistration(PublicRegistration{
			Mailer: relay, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
		}), database, relay
	}

	t.Run("unknown", func(t *testing.T) {
		s, _, _ := newStore()
		if _, err := s.CompletePublicSignup(ctx, completeRequest("nothing.secret", "Person", "password123", "203.0.113.9")); !errors.Is(err, ErrEnrollmentNotFound) {
			t.Fatalf("error = %v, want ErrEnrollmentNotFound", err)
		}
	})
	t.Run("revoked", func(t *testing.T) {
		s, database, relay := newStore()
		requestToken(t, s, relay, "revoked@example.test")
		if _, err := database.Exec(`UPDATE account_enrollments SET status='revoked' WHERE email=?`, "revoked@example.test"); err != nil {
			t.Fatal(err)
		}
		if _, err := s.CompletePublicSignup(ctx, completeRequest(tokenFromLink(relay.sent[0].Link), "Person", "password123", "203.0.113.9")); !errors.Is(err, ErrEnrollmentNotFound) {
			t.Fatalf("error = %v, want ErrEnrollmentNotFound", err)
		}
	})
	t.Run("consumed", func(t *testing.T) {
		s, database, relay := newStore()
		token := requestToken(t, s, relay, "consumed@example.test")
		if _, err := s.CompletePublicSignup(ctx, completeRequest(token, "Person", "password123", "203.0.113.9")); err != nil {
			t.Fatal(err)
		}
		// A second attempt with the same link, on a mailbox that now has an
		// account, must still read as "not found" rather than "already
		// registered".
		if _, err := s.CompletePublicSignup(ctx, completeRequest(token, "Person", "password123", "203.0.113.9")); !errors.Is(err, ErrEnrollmentNotFound) {
			t.Fatalf("error = %v, want ErrEnrollmentNotFound", err)
		}
		if countUsers(t, database, "consumed@example.test") != 1 {
			t.Fatal("a replayed token created a second account")
		}
	})
	t.Run("expired", func(t *testing.T) {
		s, database, relay := newStore()
		requestToken(t, s, relay, "expired@example.test")
		if _, err := database.Exec(`UPDATE account_enrollments SET expires_at=? WHERE email=?`, time.Now().UTC().Add(-time.Minute), "expired@example.test"); err != nil {
			t.Fatal(err)
		}
		if _, err := s.CompletePublicSignup(ctx, completeRequest(tokenFromLink(relay.sent[0].Link), "Person", "password123", "203.0.113.9")); !errors.Is(err, ErrEnrollmentNotFound) {
			t.Fatalf("error = %v, want ErrEnrollmentNotFound", err)
		}
	})
	t.Run("administrator token", func(t *testing.T) {
		// An administrator activation token must not work here: the two flows
		// prove different things about a person, and swapping them would let an
		// approved administrator be replayed as a self-verified mailbox.
		s, database, _ := newStore()
		if _, err := database.Exec(`INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at,can_create_workspace) VALUES('e1','admin_created','admin@example.test','hash','pending',?,?,1)`,
			time.Now().UTC().Add(time.Hour), time.Now().UTC()); err != nil {
			t.Fatal(err)
		}
		if _, err := s.CompletePublicSignup(ctx, completeRequest("any-secret", "Person", "password123", "203.0.113.9")); !errors.Is(err, ErrEnrollmentNotFound) {
			t.Fatalf("error = %v, want ErrEnrollmentNotFound", err)
		}
	})
}

func requestToken(t *testing.T, store *Store, relay *recordingMailer, email string) string {
	t.Helper()
	if err := store.RequestPublicSignup(context.Background(), SignupRequest{Email: email, Source: "203.0.113.9"}); err != nil {
		t.Fatal(err)
	}
	return tokenFromLink(relay.sent[0].Link)
}

// TestPublicSignupRequestIsUniformRegardlessOfMailbox is the enumeration
// property. The flow must not branch on whether the mailbox already has an
// account or an outstanding request; a branch there would leak exactly the fact
// an attacker wants.
func TestPublicSignupRequestIsUniformRegardlessOfMailbox(t *testing.T) {
	ctx := context.Background()
	mailer := &recordingMailer{}
	conn := openSignupTestDB(t)
	enablePublicMode(t, conn, true)
	store := New(conn).EnablePublicRegistration(PublicRegistration{
		Mailer: mailer, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
	})
	addExistingAccount(t, conn, "existing@example.test", "original-password")

	existing := "existing@example.test"
	repeat := "repeat@example.test"
	unknown := "unknown@example.test"

	for _, email := range []string{existing, unknown} {
		if err := store.RequestPublicSignup(ctx, SignupRequest{Email: email, Source: "203.0.113.9"}); err != nil {
			t.Fatalf("request for %s error = %v", email, err)
		}
	}
	// A mailbox that has already asked.
	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: repeat, Source: "203.0.113.9"}); err != nil {
		t.Fatal(err)
	}
	before := len(mailer.sent)
	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: repeat, Source: "203.0.113.9"}); err != nil {
		t.Fatalf("repeat request error = %v", err)
	}
	if len(mailer.sent) != before+1 {
		t.Fatal("a repeated request must still produce a fresh link")
	}
	// Every one of the four mailboxes is in the same state from the caller's
	// point of view: an error, or nothing at all.
	_, _, _, hashBefore := userRow(t, conn, existing)
	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: existing, Source: "203.0.113.9"}); err != nil {
		t.Fatalf("request for an existing mailbox error = %v", err)
	}
	_, _, _, hashAfter := userRow(t, conn, existing)
	if hashBefore != hashAfter {
		t.Fatal("requesting a link for a registered mailbox touched the account")
	}
}

// TestPublicSignupRepeatRequestSupersedesOlderLinks keeps one mailbox to one
// usable link, so a request cannot leave a pile of live credentials behind.
func TestPublicSignupRepeatRequestSupersedesOlderLinks(t *testing.T) {
	ctx := context.Background()
	mailer := &recordingMailer{}
	conn := openSignupTestDB(t)
	enablePublicMode(t, conn, true)
	store := New(conn).EnablePublicRegistration(PublicRegistration{
		Mailer: mailer, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
	})
	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); err != nil {
		t.Fatal(err)
	}
	first := tokenFromLink(mailer.sent[0].Link)
	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); err != nil {
		t.Fatal(err)
	}
	second := tokenFromLink(mailer.sent[1].Link)

	if _, err := store.CompletePublicSignup(ctx, completeRequest(first, "Person", "password123", "203.0.113.9")); !errors.Is(err, ErrEnrollmentNotFound) {
		t.Fatalf("superseded link error = %v, want ErrEnrollmentNotFound", err)
	}
	if _, err := store.CompletePublicSignup(ctx, completeRequest(second, "Person", "password123", "203.0.113.9")); err != nil {
		t.Fatalf("current link error = %v", err)
	}
}

// TestPublicSignupRefusedWhenMailDeliveryFails pins that a failed delivery leaves
// nothing usable behind. A pending record whose link never arrived would be a
// standing "awaiting verification" lie, and the flow must not report success.
func TestPublicSignupRefusedWhenMailDeliveryFails(t *testing.T) {
	ctx := context.Background()
	conn := openSignupTestDB(t)
	enablePublicMode(t, conn, true)
	mailer := &recordingMailer{err: errors.New("relay refused")}
	store := New(conn).EnablePublicRegistration(PublicRegistration{
		Mailer: mailer, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
	})

	if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); !errors.Is(err, ErrMailDeliveryFailed) {
		t.Fatalf("error = %v, want ErrMailDeliveryFailed", err)
	}
	var pending int
	if err := conn.QueryRow(`SELECT count(*) FROM account_enrollments WHERE email=? AND status='pending'`, "person@example.test").Scan(&pending); err != nil {
		t.Fatal(err)
	}
	if pending != 0 {
		t.Fatalf("pending records after a failed delivery = %d, want 0", pending)
	}
	if countUsers(t, conn, "person@example.test") != 0 {
		t.Fatal("a failed delivery created an account")
	}
	// The attempt still left an audit trail: an operator needs to see why
	// registrations are not arriving.
	var audited int
	if err := conn.QueryRow(`SELECT count(*) FROM admin_audit_events WHERE action=?`, ActionSignupRequested).Scan(&audited); err != nil {
		t.Fatal(err)
	}
	if audited != 1 {
		t.Fatalf("signup.requested audit rows = %d, want 1", audited)
	}
}

// TestPublicSignupRefusedWithoutReadyCapability covers every way the capability
// can be missing, since each is a deployment that must silently serve traffic
// without offering registration.
func TestPublicSignupRefusedWithoutReadyCapability(t *testing.T) {
	ctx := context.Background()
	tests := map[string]PublicRegistration{
		"no configuration": {},
		"no transport":     {BaseURL: "https://madoc.example.test", Ready: func() bool { return true }},
		"no public address": {
			Mailer: &recordingMailer{}, Ready: func() bool { return true },
		},
		"deployment reports not ready": {
			Mailer: &recordingMailer{}, BaseURL: "https://madoc.example.test", Ready: func() bool { return false },
		},
	}
	for name, registration := range tests {
		t.Run(name, func(t *testing.T) {
			conn := openSignupTestDB(t)
			enablePublicMode(t, conn, true)
			store := New(conn).EnablePublicRegistration(registration)
			if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); !errors.Is(err, ErrRegistrationNotReady) {
				t.Fatalf("error = %v, want ErrRegistrationNotReady", err)
			}
			if countUsers(t, conn, "person@example.test") != 0 {
				t.Fatal("an unready instance created an account")
			}
			settings, err := store.LoadPublic(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if store.PublicRegistrationAvailable(settings) {
				t.Fatal("public registration must not be advertised while it cannot run")
			}
		})
	}
}

// TestPublicSignupRefusedWhenRegistrationIsNotOpen keeps the mode meaningful:
// an invite-only site must not accept self-service requests even though it can
// send mail.
func TestPublicSignupRefusedWhenRegistrationIsNotOpen(t *testing.T) {
	ctx := context.Background()
	conn := openSignupTestDB(t)
	store := New(conn).EnablePublicRegistration(readyPublicRegistration())
	for _, mode := range []string{"invite_only", "closed"} {
		storeSiteSettings(t, conn, map[string]any{KeyRegistrationMode: mode})
		if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); !errors.Is(err, ErrRegistrationClosed) {
			t.Fatalf("mode %s error = %v, want ErrRegistrationClosed", mode, err)
		}
		settings, err := store.LoadPublic(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if store.PublicRegistrationAvailable(settings) {
			t.Fatalf("mode %s advertised public registration", mode)
		}
	}
}

func TestPublicSignupRejectsMalformedInput(t *testing.T) {
	ctx := context.Background()
	conn := openSignupTestDB(t)
	enablePublicMode(t, conn, true)
	store := New(conn).EnablePublicRegistration(readyPublicRegistration())
	for _, email := range []string{"", "no-at-sign", "   "} {
		if err := store.RequestPublicSignup(ctx, SignupRequest{Email: email, Source: "203.0.113.9"}); !errors.Is(err, ErrInvalidChange) {
			t.Fatalf("email %q error = %v, want ErrInvalidChange", email, err)
		}
	}
	relay := &recordingMailer{}
	sending := New(conn).EnablePublicRegistration(PublicRegistration{
		Mailer: relay, BaseURL: "https://madoc.example.test", Ready: func() bool { return true },
	})
	token := requestToken(t, sending, relay, "person@example.test")
	for name, request := range map[string]CompleteSignupRequest{
		"empty token":      completeRequest("", "Person", "password123", "203.0.113.9"),
		"empty name":       completeRequest(token, "  ", "password123", "203.0.113.9"),
		"short password":   completeRequest(token, "Person", "short", "203.0.113.9"),
		"long password":    completeRequest(token, "Person", strings.Repeat("x", 73), "203.0.113.9"),
		"long name":        completeRequest(token, strings.Repeat("n", 201), "password123", "203.0.113.9"),
		"no hash function": {Token: token, Name: "Person", Password: "password123"},
	} {
		if _, err := sending.CompletePublicSignup(ctx, request); !errors.Is(err, ErrInvalidChange) {
			t.Fatalf("%s error = %v, want ErrInvalidChange", name, err)
		}
	}
	if countUsers(t, conn, "person@example.test") != 0 {
		t.Fatal("a rejected completion created an account")
	}
}

// TestPublicSignupRateLimits pins §11.5's two anonymous dimensions. The values
// are small test values, not a claim about what production should allow.
func TestPublicSignupRateLimits(t *testing.T) {
	ctx := context.Background()
	newStore := func(limits EnrollmentLimits) (*Store, *sql.DB) {
		conn := openSignupTestDB(t)
		enablePublicMode(t, conn, true)
		return NewWithEnrollmentLimits(conn, limits).EnablePublicRegistration(readyPublicRegistration()), conn
	}
	t.Run("per mailbox", func(t *testing.T) {
		store, _ := newStore(EnrollmentLimits{Window: time.Minute, PerEmail: 2, PerSource: 100, Instance: 100})
		for i := 0; i < 2; i++ {
			if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); err != nil {
				t.Fatalf("request %d error = %v", i, err)
			}
		}
		if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "person@example.test", Source: "203.0.113.9"}); !isRateLimited(err) {
			t.Fatalf("third request error = %v, want a rate limit", err)
		}
		// A different mailbox from the same host is unaffected by the per-mailbox
		// budget, or one person's typo would lock out everyone behind the proxy.
		if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "other@example.test", Source: "203.0.113.9"}); err != nil {
			t.Fatalf("other mailbox error = %v", err)
		}
	})
	t.Run("per network source", func(t *testing.T) {
		store, _ := newStore(EnrollmentLimits{Window: time.Minute, PerEmail: 100, PerSource: 2, Instance: 100})
		for i := 0; i < 2; i++ {
			if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "one@example.test", Source: "203.0.113.9"}); err != nil {
				t.Fatalf("request %d error = %v", i, err)
			}
		}
		// Rotating the mailbox must not reset the source budget: that rotation is
		// the whole point of the dimension.
		if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "two@example.test", Source: "203.0.113.9"}); !isRateLimited(err) {
			t.Fatalf("rotated mailbox error = %v, want a rate limit", err)
		}
		if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "three@example.test", Source: "198.51.100.4"}); err != nil {
			t.Fatalf("other source error = %v", err)
		}
	})
	t.Run("instance total", func(t *testing.T) {
		store, _ := newStore(EnrollmentLimits{Window: time.Minute, PerEmail: 100, PerSource: 100, Instance: 2})
		for i := 0; i < 2; i++ {
			if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "a@example.test", Source: "203.0.113.9"}); err != nil {
				t.Fatalf("request %d error = %v", i, err)
			}
		}
		// Neither the mailbox nor the source has been used before; only the
		// instance-wide budget is spent.
		if err := store.RequestPublicSignup(ctx, SignupRequest{Email: "b@example.test", Source: "198.51.100.4"}); !isRateLimited(err) {
			t.Fatalf("error = %v, want a rate limit", err)
		}
	})
}

// TestPublicSignupCompletionIsRateLimitedBeforeHashing keeps bcrypt work bounded
// even when the tokens are guesses.
func TestPublicSignupCompletionIsRateLimitedBeforeHashing(t *testing.T) {
	ctx := context.Background()
	store := newSignupStore(t, readyPublicRegistration(), EnrollmentLimits{Window: time.Minute, PerEmail: 100, PerSource: 100, Instance: 2})
	var hashes int
	for i := 0; i < 3; i++ {
		request := completeRequest("unknown.secret", "Person", "password123", "203.0.113.9")
		request.HashPassword = func(password string) (string, error) {
			hashes++
			return "hash", nil
		}
		_, _ = store.CompletePublicSignup(ctx, request)
	}
	if hashes != 0 {
		t.Fatalf("password hashing ran %d times for tokens that resolve to nothing", hashes)
	}
}

func isRateLimited(err error) bool {
	var limited *RateLimitError
	return errors.As(err, &limited)
}
