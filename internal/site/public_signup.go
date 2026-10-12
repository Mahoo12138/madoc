package site

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
)

// PublicSignupPath is the page a verification link opens. It is a frontend
// route: the token travels in the path because that is the only shape a mail
// client and a person can follow. Route-level log redaction must cover it,
// exactly like /enroll/ — see tokenPathPrefixes in main.go.
const PublicSignupPath = "/sign-up/"

// publicSignupTTL bounds how long a verification link stays usable. Far shorter
// than the administrator activation window: this one is opened by whoever holds
// the mailbox, and a link that sits in a mailbox for a day is a standing
// credential for creating an account (§11.2).
const publicSignupTTL = 30 * time.Minute

// Management audit actions for the public registration lifecycle. They share
// the enrollment target type so one page can list every record that produced or
// attempted an account, whatever its kind.
const (
	ActionSignupRequested  = "signup.requested"
	ActionSignupCompleted  = "signup.completed"
	targetTypeSignupRecord = targetTypeEnrollment
)

// Audit change keys for public registration. recordEnrollment's whitelist
// applies, so nothing outside this set can reach admin_audit_events.
const (
	KeySignupSource = "source"
)

// SignupMailer is the one capability public registration needs from the outside
// world. It is an interface rather than a concrete transport so the flow can be
// exercised against a real SMTP conversation without this package knowing
// anything about SMTP, and so a deployment without mail simply has none.
type SignupMailer interface {
	SendSignupVerification(to, link string) error
}

// PublicRegistration carries the deployment-side facts the flow depends on.
// Nothing here is stored: these come from the process configuration, which is
// the only place SMTP credentials are ever allowed to exist.
type PublicRegistration struct {
	// Mailer delivers the verification link. Nil means this instance cannot
	// complete a registration and must not offer one.
	Mailer SignupMailer
	// BaseURL is the address the deployer published. Verification links are
	// built from it and from nothing else — never from a Host header or a
	// forwarded header, because whoever controls that value controls where a
	// person is asked to type their new password.
	BaseURL string
	// Ready reports whether the deployment can actually send mail. A relay may
	// be reachable at boot and broken later, so this stays a live question
	// rather than a value sampled once.
	Ready func() bool
}

// signupLink builds the one URL this flow ever hands out.
func (c PublicRegistration) signupLink(token string) string {
	return strings.TrimSuffix(c.BaseURL, "/") + PublicSignupPath + token
}

// SignupRequest is one anonymous request to receive a verification link.
type SignupRequest struct {
	Email string
	// Source is the network origin used for rate limiting. Callers must supply
	// the connection address, or a forwarded one from a proxy they trust:
	// a value taken from a client-controlled header can be varied per request
	// and would defeat the limit entirely.
	Source string
}

// RequestPublicSignup creates the verification record for one mailbox and mails
// the link.
//
// The record is created and committed before any mail is attempted, and the
// token exists in exactly one place — the argument to the mailer. Nothing is
// inserted into users and no password is stored: at this stage the only fact
// established is that someone asked for this mailbox to become an account.
//
// The same code path serves a mailbox that already has an account and one that
// has asked before. That is deliberate and load-bearing: any branch that
// treated those two differently — by refusing, by staying silent, or by mailing
// a different letter — would be a working account-enumeration oracle, and the
// uniform answer is the only one that cannot leak.
func (s *Store) RequestPublicSignup(ctx context.Context, req SignupRequest) error {
	email := normalizeEmail(req.Email)
	if !validEnrollmentEmail(email) {
		return ErrInvalidChange
	}
	// The read path must not write: an anonymous request has no business
	// creating stored state, and a missing document has to fail closed.
	settings, err := s.LoadPublic(ctx)
	if err != nil {
		return err
	}
	if settings.RegistrationMode != "open" {
		return ErrRegistrationClosed
	}
	if !s.publicRegistrationReady() {
		return ErrRegistrationNotReady
	}

	now := time.Now().UTC()
	// Instance first, because it is the only dimension that also covers
	// requests whose mailbox never resolves to anything.
	if allowed, retryAfter := s.enrollmentLimiter.claim(now); !allowed {
		return &RateLimitError{RetryAfter: retryAfter}
	}
	// The network source is charged before the mailbox so one host cannot
	// spend the per-mailbox budget of everyone behind it.
	if req.Source != "" {
		if allowed, retryAfter := s.enrollmentLimiter.claimSource(now, req.Source); !allowed {
			return &RateLimitError{RetryAfter: retryAfter}
		}
	}
	if allowed, retryAfter := s.enrollmentLimiter.claimEmail(now, email); !allowed {
		return &RateLimitError{RetryAfter: retryAfter}
	}

	record, token, err := s.createPublicSignup(ctx, email, now)
	if err != nil {
		return err
	}

	// Outside every transaction: the relay may be slow, and holding SQLite's
	// single pooled connection across a network round trip would stall the
	// whole instance — including the very requests that would report the
	// failure.
	if err := s.publicRegistration.Mailer.SendSignupVerification(email, s.publicRegistration.signupLink(token)); err != nil {
		// A record nobody can receive is worse than no record: it looks like a
		// pending verification to every later reader. Withdraw it so the next
		// attempt starts clean and no account can be created from a link that
		// was never delivered.
		if revokeErr := s.revokePublicSignup(ctx, record.ID); revokeErr != nil {
			log.Printf("public signup: withdraw undeliverable record %s: %v", record.ID, revokeErr)
		}
		// The relay error goes to the operator's log. It is never returned to
		// the anonymous caller: the client only learns that its request was
		// accepted or refused, never why.
		log.Printf("public signup: delivery to %s failed: %v", email, err)
		return ErrMailDeliveryFailed
	}
	return nil
}

// ErrMailDeliveryFailed tells the handler the request could not be fulfilled
// even though it passed every policy check. It exists so the operator finds the
// relay failure in the log while the anonymous caller only sees a 500.
var ErrMailDeliveryFailed = errors.New("verification mail could not be delivered")

func (s *Store) createPublicSignup(ctx context.Context, email string, now time.Time) (enrollmentRow, string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return enrollmentRow{}, "", err
	}
	defer tx.Rollback()

	// A second live link would give one mailbox two entrances, and the older
	// token exists nowhere but the mail already sent for it. Revoking it is
	// the only way to make the newest request the only usable one.
	superseded, err := tx.ExecContext(ctx, `UPDATE account_enrollments SET status='revoked' WHERE email=? AND kind=? AND status='pending'`, email, KindPublicSignup)
	if err != nil {
		return enrollmentRow{}, "", err
	}
	supersededRows, err := superseded.RowsAffected()
	if err != nil {
		return enrollmentRow{}, "", err
	}

	id := uuid.NewString()
	secret := make([]byte, enrollmentTokenSecretBytes)
	if _, err := rand.Read(secret); err != nil {
		return enrollmentRow{}, "", err
	}
	token := id + "." + base64.RawURLEncoding.EncodeToString(secret)
	digest := sha256.Sum256([]byte(token))
	record := enrollmentRow{
		ID:        id,
		Kind:      KindPublicSignup,
		Email:     email,
		Status:    EnrollmentPending,
		ExpiresAt: now.Add(publicSignupTTL),
		CreatedAt: now,
		// No issuer and no frozen grant: this approval comes from the person who
		// proved they can read the mailbox, and its workspace creation default
		// is read from the settings in force at completion time (§11.4).
		CreatedBy: nil,
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at,consumed_at,created_by,can_create_workspace) VALUES(?,?,?,?,?,?,?,NULL,NULL,NULL)`,
		record.ID, record.Kind, record.Email, hex.EncodeToString(digest[:]), record.Status, record.ExpiresAt, record.CreatedAt); err != nil {
		return enrollmentRow{}, "", err
	}
	// The request is anonymous, so the row is attributed to the system rather
	// than to a user id that does not exist yet.
	if err := recordSignup(ctx, tx, ActionSignupRequested, targetTypeSignupRecord, id, map[string]any{
		KeyEnrollmentEmail: email,
		KeySignupSource:    KindPublicSignup,
	}); err != nil {
		return enrollmentRow{}, "", err
	}
	if err := tx.Commit(); err != nil {
		return enrollmentRow{}, "", err
	}
	log.Printf("public signup: verification requested for %s (superseded %d pending records)", email, supersededRows)
	return record, token, nil
}

func (s *Store) revokePublicSignup(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE account_enrollments SET status='revoked' WHERE id=? AND status='pending'`, id)
	if err != nil {
		return err
	}
	if _, err := result.RowsAffected(); err != nil {
		return err
	}
	return tx.Commit()
}

// CompleteSignupRequest describes one public registration attempt.
type CompleteSignupRequest struct {
	Token    string
	Name     string
	Password string
	// Source is the network origin for rate limiting; see SignupRequest.
	Source string
	// HashPassword is a callback rather than a precomputed value for the same
	// reason as the administrator flow: bcrypt is deliberately slow, so it must
	// run only after the cheap rejections pass and outside every transaction.
	HashPassword func(password string) (string, error)
}

// CompletePublicSignup turns a verified mailbox into an account.
//
// Three properties are load-bearing and each has a test:
//
//   - The initial workspace creation grant is read from the settings in force
//     *now*, never from the record. Freezing it at request time would let an
//     administrator who later tightened the default be bypassed by anyone who
//     requested a link before the change (§11.4).
//   - An administrator who closes public registration while a link is out
//     invalidates that link. The link is not a standing credential; it was a
//     statement about the world when it was issued.
//   - Every unusable token returns one indistinguishable error: unknown,
//     revoked, consumed and expired must not be tellable apart, or a failure
//     becomes a map of the token space.
func (s *Store) CompletePublicSignup(ctx context.Context, req CompleteSignupRequest) (EnrolledAccount, error) {
	token := strings.TrimSpace(req.Token)
	name := strings.TrimSpace(req.Name)
	password := req.Password
	if token == "" || name == "" || len(name) > maxEnrollmentNameLength ||
		len(password) < minEnrollmentPasswordLength || len(password) > maxEnrollmentPasswordLength {
		return EnrolledAccount{}, ErrInvalidChange
	}
	if req.HashPassword == nil {
		return EnrolledAccount{}, ErrInvalidChange
	}
	now := time.Now().UTC()
	if allowed, retryAfter := s.enrollmentLimiter.claim(now); !allowed {
		return EnrolledAccount{}, &RateLimitError{RetryAfter: retryAfter}
	}
	digest := sha256.Sum256([]byte(token))

	// No transaction is open yet, so the global handle is safe. Once one exists
	// every read has to go through it: the pool allows a single connection.
	record, err := scanEnrollment(s.db.QueryRowContext(ctx, selectEnrollmentSQL+` WHERE token_hash=?`, hex.EncodeToString(digest[:])))
	if errors.Is(err, sql.ErrNoRows) {
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	if err != nil {
		return EnrolledAccount{}, err
	}
	// The kind is checked here and again inside the transaction: a public
	// verification token must never work against the administrator activation
	// endpoint, and an administrator token must not silently create a
	// self-service account whose mailbox was never verified.
	if record.Kind != KindPublicSignup {
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	if record.Status != EnrollmentPending || !record.ExpiresAt.After(now) {
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	if req.Source != "" {
		if allowed, retryAfter := s.enrollmentLimiter.claimSource(now, req.Source); !allowed {
			return EnrolledAccount{}, &RateLimitError{RetryAfter: retryAfter}
		}
	}
	if allowed, retryAfter := s.enrollmentLimiter.claimEmail(now, record.Email); !allowed {
		return EnrolledAccount{}, &RateLimitError{RetryAfter: retryAfter}
	}

	passwordHash, err := req.HashPassword(password)
	if err != nil {
		// A form must never learn why hashing failed; it only learns that
		// nothing was created. The detail stays in the server log.
		log.Printf("public signup: password hashing failed: %v", err)
		return EnrolledAccount{}, fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return EnrolledAccount{}, err
	}
	defer tx.Rollback()

	// Everything is re-checked: this transaction began after the password was
	// hashed, so the token may have been consumed, revoked or expired, an
	// account may have appeared for the mailbox by another route, and the
	// administrator may have changed the mode in between.
	record, err = scanEnrollment(tx.QueryRowContext(ctx, selectEnrollmentSQL+` WHERE token_hash=?`, hex.EncodeToString(digest[:])))
	if errors.Is(err, sql.ErrNoRows) {
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	if err != nil {
		return EnrolledAccount{}, err
	}
	if record.Kind != KindPublicSignup || record.Status != EnrollmentPending || !record.ExpiresAt.After(now) {
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	// The mode is read here, at commit time, and not from the value observed
	// when the link was opened. This is the check that makes closing public
	// registration actually close it.
	settings, err := s.Load(ctx, tx)
	if err != nil {
		return EnrolledAccount{}, err
	}
	if settings.RegistrationMode != "open" {
		return EnrolledAccount{}, ErrRegistrationClosed
	}
	var duplicate string
	err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE email=?`, record.Email).Scan(&duplicate)
	switch {
	case err == nil:
		// Never adopt an account that appeared after the link was issued. This
		// flow has no business writing a password, a grant, or a session for
		// somebody who already signed up — the one thing that would turn a
		// verification link into a password reset (§11.2).
		return EnrolledAccount{}, ErrEmailAlreadyRegistered
	case errors.Is(err, sql.ErrNoRows):
	default:
		return EnrolledAccount{}, err
	}

	account := EnrolledAccount{
		ID:    uuid.NewString(),
		Name:  name,
		Email: record.Email,
		// Read now, from the settings in force at this instant. Nothing froze it
		// into the record at request time, so a later tightening of the default
		// applies to links that are still outstanding.
		CanCreateWorkspace: settings.PublicSignupDefaultCanCreateWorkspace,
	}
	// This is the only place email_verified_at is ever written: the person
	// proved they can read the mailbox. Administrator approvals and workspace
	// invitations leave it NULL because they vouch for a person, not for a
	// mailbox (§11.4).
	if _, err := tx.ExecContext(ctx, `INSERT INTO users(id,name,email,password_hash,is_admin,disabled,signup_source,can_create_workspace,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,0,0,'public_signup',?,?,?,?)`,
		account.ID, account.Name, account.Email, passwordHash, boolInt(account.CanCreateWorkspace), now, now, now); err != nil {
		return EnrolledAccount{}, err
	}
	consumed, err := tx.ExecContext(ctx, `UPDATE account_enrollments SET status='consumed',consumed_at=? WHERE id=? AND status='pending' AND expires_at>?`, now, record.ID, now)
	if err != nil {
		return EnrolledAccount{}, err
	}
	used, err := consumed.RowsAffected()
	if err != nil {
		return EnrolledAccount{}, err
	}
	if used != 1 {
		// The token lost the race; the account insert above rolls back with it.
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	// One successful registration retires every other outstanding link for the
	// same mailbox, so a mailbox cannot accumulate a pile of credentials that
	// would all still work.
	if _, err := tx.ExecContext(ctx, `UPDATE account_enrollments SET status='revoked' WHERE email=? AND kind=? AND status='pending'`, record.Email, KindPublicSignup); err != nil {
		return EnrolledAccount{}, err
	}
	// The account is attributed to itself: completing registration is the one
	// action it performs before anybody can manage it.
	if err := recordSignup(ctx, tx, ActionSignupCompleted, targetTypeSignupRecord, record.ID, map[string]any{
		KeySignupSource:                 KindPublicSignup,
		KeyEnrollmentCanCreateWorkspace: account.CanCreateWorkspace,
	}); err != nil {
		return EnrolledAccount{}, err
	}
	if err := tx.Commit(); err != nil {
		return EnrolledAccount{}, err
	}
	return account, nil
}

// publicRegistrationReady reports whether this instance can complete a
// registration at all. Everything the flow needs must be present: a transport
// to send with, a published address to build the link from, and a deployment
// that still reports its mail configuration as usable.
func (s *Store) publicRegistrationReady() bool {
	registration := s.publicRegistration
	if registration.Mailer == nil || registration.BaseURL == "" || registration.Ready == nil {
		return false
	}
	return registration.Ready()
}

// PublicRegistrationAvailable reports what GET /api/site may tell an anonymous
// visitor: whether the mode is open *and* the capability behind it works. It is
// not a re-reading of the mode alone — a page that offers a signup form that
// cannot complete is worse than a page that admits registration is closed.
func (s *Store) PublicRegistrationAvailable(settings Settings) bool {
	return settings.RegistrationMode == "open" && s.publicRegistrationReady()
}
