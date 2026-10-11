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
	"sync"
	"time"

	"github.com/google/uuid"
)

// Account enrollment kinds. The structure is defined for both now so the later
// public registration package does not need another migration, but only
// `admin_created` rows are written or accepted today (§11.3/§11.4). Completing
// an enrollment re-checks the kind instead of trusting the table contents: a
// public signup token must never be replayed against the administrator
// activation endpoint.
const (
	KindAdminCreated = "admin_created"
	KindPublicSignup = "public_signup"
)

// Account enrollment statuses. They are terminal facts of the row, not derived
// values: an expired row stays `pending` and is rejected by comparing
// expires_at on every use, so nothing depends on a cleanup job to make a token
// stop working.
const (
	EnrollmentPending  = "pending"
	EnrollmentConsumed = "consumed"
	EnrollmentRevoked  = "revoked"
)

// Management audit actions for the enrollment lifecycle. The server owns this
// whitelist; clients cannot choose an action.
const (
	ActionEnrollmentCreated = "enrollment.created"
	ActionEnrollmentRevoked = "enrollment.revoked"
	ActionAccountEnrolled   = "account.enrolled"
)

// Audit change keys for enrollments. Everything else offered by a caller is
// dropped by recordEnrollment.
const (
	KeyEnrollmentEmail              = "email"
	KeyEnrollmentCanCreateWorkspace = "canCreateWorkspace"
	KeyEnrollmentRevokedExisting    = "revokedExisting"
	KeyEnrollmentID                 = "enrollmentId"
	KeyEnrollmentSignupSource       = "signupSource"
)

// targetTypeEnrollment is the audit target type of enrollment rows, next to
// targetTypeUser and auditTargetTypeSiteSettings.
const targetTypeEnrollment = "account_enrollment"

const (
	// enrollmentTTL bounds how long an administrator's approval stays usable.
	// Long enough to reach a person through a trusted channel, short enough that
	// a forgotten link is not an open door (§11.3).
	enrollmentTTL = 24 * time.Hour
	// A mailbox is either usable or not; anything longer than RFC's limit is an
	// input error rather than a policy question.
	maxEnrollmentEmailLength = 254
	maxEnrollmentNameLength  = 200
	// bcrypt silently ignores everything past 72 bytes, so the bound is enforced
	// here instead of letting a form report a hashing internals error (§11.5).
	minEnrollmentPasswordLength = 8
	maxEnrollmentPasswordLength = 72
	enrollmentListLimit         = 200
	// enrollmentTokenSecretBytes is the secret half of `id.secret`: 256 bits of
	// unguessable material, matching the existing workspace invite tokens.
	enrollmentTokenSecretBytes = 32
)

// Enrollment is the management view of an approval record. It is not an account
// and never carries a token: the plain token exists exactly once, in the
// response that creates the record.
type Enrollment struct {
	ID                 string  `json:"id"`
	Kind               string  `json:"kind"`
	Email              string  `json:"email"`
	Status             string  `json:"status"`
	ExpiresAt          string  `json:"expiresAt"`
	CreatedAt          string  `json:"createdAt"`
	ConsumedAt         *string `json:"consumedAt"`
	CreatedBy          *string `json:"createdBy"`
	CanCreateWorkspace bool    `json:"canCreateWorkspace"`
}

type enrollmentRow struct {
	ID                 string
	Kind               string
	Email              string
	Status             string
	ExpiresAt          time.Time
	CreatedAt          time.Time
	ConsumedAt         *time.Time
	CreatedBy          *string
	CanCreateWorkspace bool
}

const selectEnrollmentSQL = `SELECT id,kind,email,status,expires_at,created_at,consumed_at,created_by,can_create_workspace FROM account_enrollments`

func scanEnrollment(row scanner) (enrollmentRow, error) {
	var record enrollmentRow
	var canCreate sql.NullInt64
	var consumed sql.NullTime
	if err := row.Scan(&record.ID, &record.Kind, &record.Email, &record.Status, &record.ExpiresAt, &record.CreatedAt, &consumed, &record.CreatedBy, &canCreate); err != nil {
		return enrollmentRow{}, err
	}
	if consumed.Valid {
		value := consumed.Time.UTC()
		record.ConsumedAt = &value
	}
	record.CanCreateWorkspace = canCreate.Valid && canCreate.Int64 != 0
	return record, nil
}

func (record enrollmentRow) enrollment() Enrollment {
	var consumed *string
	if record.ConsumedAt != nil {
		value := record.ConsumedAt.UTC().Format(time.RFC3339)
		consumed = &value
	}
	return Enrollment{
		ID:                 record.ID,
		Kind:               record.Kind,
		Email:              record.Email,
		Status:             record.Status,
		ExpiresAt:          record.ExpiresAt.UTC().Format(time.RFC3339),
		CreatedAt:          record.CreatedAt.UTC().Format(time.RFC3339),
		ConsumedAt:         consumed,
		CreatedBy:          record.CreatedBy,
		CanCreateWorkspace: record.CanCreateWorkspace,
	}
}

// EnrollmentListResult is the list payload consumed by the management page.
type EnrollmentListResult struct {
	Enrollments []Enrollment `json:"enrollments"`
}

// normalizeEmail applies the single rule shared by every entry point (§11.5):
// trim surrounding space and lowercase. Provider-specific folding such as
// dropping `+tag` or dots is deliberately not done, because two entry points
// disagreeing about the identity of a mailbox is worse than the duplicates the
// folding would hide.
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validEnrollmentEmail(email string) bool {
	return len(email) > 0 && len(email) <= maxEnrollmentEmailLength && strings.Contains(email, "@")
}

// EnrollmentLimits configures the single-instance protection for the anonymous
// activation endpoint (§11.5). These are conservative defaults for one process,
// not a measured capacity promise.
type EnrollmentLimits struct {
	Window   time.Duration
	PerEmail int
	Instance int
}

// DefaultEnrollmentLimits is used by every store built with New. The per-email
// bound keeps one mailbox from spending the whole budget and the instance bound
// keeps rotating mailboxes from doing it either.
func DefaultEnrollmentLimits() EnrollmentLimits {
	return EnrollmentLimits{Window: 15 * time.Minute, PerEmail: 5, Instance: 30}
}

// activationLimiter is a fixed-window counter. Each key owns its own window
// start, so a burst cannot extend itself by keeping the window busy.
type activationLimiter struct {
	mu       sync.Mutex
	window   time.Duration
	perEmail int
	instance int
	total    windowCounter
	emails   map[string]windowCounter
}

type windowCounter struct {
	start time.Time
	count int
}

func newActivationLimiter(limits EnrollmentLimits) *activationLimiter {
	window := limits.Window
	if window <= 0 {
		window = DefaultEnrollmentLimits().Window
	}
	return &activationLimiter{
		window:   window,
		perEmail: limits.PerEmail,
		instance: limits.Instance,
		emails:   map[string]windowCounter{},
	}
}

// claim reserves one slot of the instance-wide budget. It is the only guard that
// also covers attempts whose token never resolves to a mailbox, so every
// request pays for exactly one slot here.
func (l *activationLimiter) claim(now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)
	if l.total.count >= l.instance {
		return false, l.retryAfter(l.total, now)
	}
	l.total.start = l.total.startOr(now)
	l.total.count++
	return true, 0
}

// claimEmail additionally charges the mailbox. It deliberately does not touch the
// instance counter: one request owns one instance slot no matter how many
// dimensions decide about it.
func (l *activationLimiter) claimEmail(now time.Time, email string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)
	counter := l.emails[email]
	if counter.count >= l.perEmail {
		return false, l.retryAfter(counter, now)
	}
	l.emails[email] = windowCounter{start: counter.startOr(now), count: counter.count + 1}
	return true, 0
}

// sweep drops keys whose window is over. Only accepted attempts create keys, so
// at most one entry exists per admitted request and this stays cheap.
func (l *activationLimiter) sweep(now time.Time) {
	for key, counter := range l.emails {
		if now.Sub(counter.start) >= l.window {
			delete(l.emails, key)
		}
	}
	if now.Sub(l.total.start) >= l.window {
		l.total = windowCounter{}
	}
}

func (l *activationLimiter) retryAfter(counter windowCounter, now time.Time) time.Duration {
	remaining := l.window - now.Sub(counter.start)
	if remaining < 0 {
		return 0
	}
	return remaining
}

func (c windowCounter) startOr(now time.Time) time.Time {
	if c.start.IsZero() {
		return now
	}
	return c.start
}

// CreateEnrollment issues a one-time activation record for email and returns the
// plain token exactly once. Nothing else in the system can reproduce it: only
// its digest is stored.
func (s *Store) CreateEnrollment(ctx context.Context, actor Actor, email string, canCreateWorkspace bool) (Enrollment, string, error) {
	email = normalizeEmail(email)
	if !validEnrollmentEmail(email) {
		return Enrollment{}, "", ErrInvalidChange
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Enrollment{}, "", err
	}
	defer tx.Rollback()

	// Re-read the operator inside the transaction: the middleware snapshot may
	// predate a demotion or a disabling that happened while this request waited
	// (RACE-04). Issuing an activation link is the authority to create an
	// account, so the operator has to hold that authority at commit time.
	persistedActor, err := s.ActorFrom(ctx, tx, actor.ID)
	if err != nil {
		return Enrollment{}, "", err
	}
	if !CanManageSite(persistedActor) {
		return Enrollment{}, "", ErrAdminRequired
	}

	// An existing account is out of reach for this flow. Reporting it here is
	// not enumeration: the caller is an administrator who can already list every
	// account, and pretending the request succeeded would only send the operator
	// looking for an effect that must never happen.
	var existing string
	err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE email=?`, email).Scan(&existing)
	switch {
	case err == nil:
		return Enrollment{}, "", ErrEmailAlreadyRegistered
	case errors.Is(err, sql.ErrNoRows):
	default:
		return Enrollment{}, "", err
	}

	// A second live link would give one approval two entrances: the first link
	// could still be used after the operator believes it was replaced, and the
	// row itself cannot be re-issued because its token only exists as a digest.
	superseded, err := tx.ExecContext(ctx, `UPDATE account_enrollments SET status='revoked' WHERE email=? AND kind=? AND status='pending'`, email, KindAdminCreated)
	if err != nil {
		return Enrollment{}, "", err
	}
	supersededRows, err := superseded.RowsAffected()
	if err != nil {
		return Enrollment{}, "", err
	}

	id := uuid.NewString()
	secret := make([]byte, enrollmentTokenSecretBytes)
	if _, err := rand.Read(secret); err != nil {
		return Enrollment{}, "", err
	}
	token := id + "." + base64.RawURLEncoding.EncodeToString(secret)
	digest := sha256.Sum256([]byte(token))
	now := time.Now().UTC()
	record := enrollmentRow{
		ID:                 id,
		Kind:               KindAdminCreated,
		Email:              email,
		Status:             EnrollmentPending,
		ExpiresAt:          now.Add(enrollmentTTL),
		CreatedAt:          now,
		CreatedBy:          &persistedActor.ID,
		CanCreateWorkspace: canCreateWorkspace,
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at,consumed_at,created_by,can_create_workspace) VALUES(?,?,?,?,?,?,?,NULL,?,?)`,
		record.ID, record.Kind, record.Email, hex.EncodeToString(digest[:]), record.Status, record.ExpiresAt, record.CreatedAt, record.CreatedBy, boolInt(canCreateWorkspace)); err != nil {
		return Enrollment{}, "", err
	}
	if err := recordEnrollment(ctx, tx, persistedActor, ActionEnrollmentCreated, targetTypeEnrollment, id, map[string]any{
		KeyEnrollmentEmail:              email,
		KeyEnrollmentCanCreateWorkspace: canCreateWorkspace,
		KeyEnrollmentRevokedExisting:    supersededRows,
	}); err != nil {
		return Enrollment{}, "", err
	}
	if err := tx.Commit(); err != nil {
		return Enrollment{}, "", err
	}
	return record.enrollment(), token, nil
}

// ListEnrollments returns every approval record, newest first. It never reads or
// returns a token: only the digest exists after creation, so this read path has
// nothing to redact.
func (s *Store) ListEnrollments(ctx context.Context) (EnrollmentListResult, error) {
	rows, err := s.db.QueryContext(ctx, selectEnrollmentSQL+`
ORDER BY created_at DESC, id DESC
LIMIT ?`, enrollmentListLimit)
	if err != nil {
		return EnrollmentListResult{}, err
	}
	defer rows.Close()
	result := EnrollmentListResult{Enrollments: []Enrollment{}}
	for rows.Next() {
		record, err := scanEnrollment(rows)
		if err != nil {
			return EnrollmentListResult{}, err
		}
		result.Enrollments = append(result.Enrollments, record.enrollment())
	}
	if err := rows.Err(); err != nil {
		return EnrollmentListResult{}, err
	}
	return result, nil
}

// RevokeEnrollment withdraws one approval record. Revocation is deliberately
// scoped to the single row named by the caller: other records for the same
// mailbox are separate decisions and must be revoked separately.
func (s *Store) RevokeEnrollment(ctx context.Context, actor Actor, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	persistedActor, err := s.ActorFrom(ctx, tx, actor.ID)
	if err != nil {
		return err
	}
	if !CanManageSite(persistedActor) {
		return ErrAdminRequired
	}
	record, err := scanEnrollment(tx.QueryRowContext(ctx, selectEnrollmentSQL+` WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return ErrEnrollmentNotFound
	}
	if err != nil {
		return err
	}
	// A consumed record has already produced an account and a revoked one is
	// already inert; neither has authority left to withdraw.
	if record.Status != EnrollmentPending {
		return ErrEnrollmentNotFound
	}
	result, err := tx.ExecContext(ctx, `UPDATE account_enrollments SET status='revoked' WHERE id=? AND status='pending'`, id)
	if err != nil {
		return err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if updated != 1 {
		return ErrEnrollmentNotFound
	}
	if err := recordEnrollment(ctx, tx, persistedActor, ActionEnrollmentRevoked, targetTypeEnrollment, id, map[string]any{
		KeyEnrollmentEmail:              record.Email,
		KeyEnrollmentCanCreateWorkspace: record.CanCreateWorkspace,
	}); err != nil {
		return err
	}
	return tx.Commit()
}

// CompleteEnrollmentRequest describes one activation attempt.
type CompleteEnrollmentRequest struct {
	Token    string
	Name     string
	Password string
	// HashPassword turns the password into its digest. It is a callback rather
	// than a precomputed value so hashing happens only after every cheap
	// rejection has passed, and outside any write transaction: bcrypt is
	// deliberately slow, and doing it while SQLite's single pooled connection is
	// held would stall the whole instance.
	HashPassword func(password string) (string, error)
}

// EnrolledAccount is the account an activation created, in the shape the caller
// needs to mint a session. It carries the raw facts, so the API layer can derive
// capabilities from the same row it just committed.
type EnrolledAccount struct {
	ID                 string
	Name               string
	Email              string
	IsAdmin            bool
	Disabled           bool
	CanCreateWorkspace bool
}

// CompleteEnrollment creates the account that one administrator approved.
//
// This flow is the administrator's own authorization and therefore **does not
// consult registrationMode at all**. A closed site stays closed for every other
// registration path - invites included - but an administrator must still be able
// to approve one named person. Conversely, switching the mode later does not
// withdraw a standing approval: an issued record keeps working until it expires
// or is revoked explicitly. Folding this into the registration policy is the
// easiest mistake to make here, because doing so looks like tightening.
//
// Every failure that could distinguish one refused token from another returns
// ErrEnrollmentNotFound so enumeration learns nothing.
func (s *Store) CompleteEnrollment(ctx context.Context, req CompleteEnrollmentRequest) (EnrolledAccount, error) {
	token := strings.TrimSpace(req.Token)
	name := strings.TrimSpace(req.Name)
	password := req.Password
	if token == "" || name == "" || len(name) > maxEnrollmentNameLength ||
		len(password) < minEnrollmentPasswordLength || len(password) > maxEnrollmentPasswordLength {
		return EnrolledAccount{}, ErrInvalidChange
	}
	now := time.Now().UTC()
	// The instance-wide budget is checked first because it is the only guard that
	// also covers attempts whose token resolves to nothing.
	if allowed, retryAfter := s.enrollmentLimiter.claim(now); !allowed {
		return EnrolledAccount{}, &RateLimitError{RetryAfter: retryAfter}
	}
	digest := sha256.Sum256([]byte(token))

	// No transaction is open yet, so reading through s.db is safe here. Once a
	// transaction exists every read must go through it: the pool allows a single
	// open connection.
	record, err := scanEnrollment(s.db.QueryRowContext(ctx, selectEnrollmentSQL+` WHERE token_hash=?`, hex.EncodeToString(digest[:])))
	if errors.Is(err, sql.ErrNoRows) {
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	if err != nil {
		return EnrolledAccount{}, err
	}
	// Now that the target mailbox is known, hold it to its own budget. This runs
	// before any hashing so rotating mailboxes cannot buy unlimited bcrypt work.
	if allowed, retryAfter := s.enrollmentLimiter.claimEmail(now, record.Email); !allowed {
		return EnrolledAccount{}, &RateLimitError{RetryAfter: retryAfter}
	}

	// Cheap rejections before doing expensive work. None of them is
	// authoritative: the transaction below re-checks every condition that could
	// have changed in the meantime.
	if record.Kind != KindAdminCreated || record.Status != EnrollmentPending || !record.ExpiresAt.After(now) {
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	if req.HashPassword == nil {
		return EnrolledAccount{}, ErrInvalidChange
	}
	passwordHash, err := req.HashPassword(password)
	if err != nil {
		// A form must never learn why hashing failed; it only learns that nothing
		// was created. The detail stays in the server log.
		log.Printf("account enrollment: password hashing failed: %v", err)
		return EnrolledAccount{}, fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return EnrolledAccount{}, err
	}
	defer tx.Rollback()

	// Everything below is re-validated because this transaction began after the
	// password was hashed: another request may have consumed the token, another
	// administrator may have revoked it, the deadline may have passed, an account
	// may have appeared for the mailbox by another route, and the issuer may have
	// lost authority in the meantime (RACE-07/RACE-08).
	record, err = scanEnrollment(tx.QueryRowContext(ctx, selectEnrollmentSQL+` WHERE token_hash=?`, hex.EncodeToString(digest[:])))
	if errors.Is(err, sql.ErrNoRows) {
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	if err != nil {
		return EnrolledAccount{}, err
	}
	if record.Kind != KindAdminCreated || record.Status != EnrollmentPending || !record.ExpiresAt.After(now) {
		return EnrolledAccount{}, ErrEnrollmentNotFound
	}
	// The approval belongs to a specific administrator. If they were disabled or
	// demoted since issuing it, the authorization they granted no longer exists.
	issuer, err := s.ActorFrom(ctx, tx, derefString(record.CreatedBy))
	if err != nil {
		return EnrolledAccount{}, err
	}
	if !CanManageSite(issuer) {
		return EnrolledAccount{}, ErrEnrollmentIssuerRevoked
	}
	var duplicate string
	err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE email=?`, record.Email).Scan(&duplicate)
	switch {
	case err == nil:
		// Never adopt an account that appeared after approval: this flow has no
		// business rewriting a password, a grant or a session.
		return EnrolledAccount{}, ErrEmailAlreadyRegistered
	case errors.Is(err, sql.ErrNoRows):
	default:
		return EnrolledAccount{}, err
	}

	account := EnrolledAccount{
		ID:    uuid.NewString(),
		Name:  name,
		Email: record.Email,
		// The grant is the one the administrator explicitly bound to this record,
		// not a default read from the settings at activation time - that
		// distinction is the reason the value lives on the row.
		CanCreateWorkspace: record.CanCreateWorkspace,
	}
	// email_verified_at stays NULL: an administrator vouched for the person, not
	// for the mailbox. Only a real verification flow may set it (§11.4).
	if _, err := tx.ExecContext(ctx, `INSERT INTO users(id,name,email,password_hash,is_admin,disabled,signup_source,can_create_workspace,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,0,0,'admin_created',?,NULL,?,?)`,
		account.ID, account.Name, account.Email, passwordHash, boolInt(account.CanCreateWorkspace), now, now); err != nil {
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
	// The account is attributed to itself: activation is the one action an
	// account performs before it can be managed by anyone. The approval chain is
	// preserved by account_enrollments.created_by and referenced here so the two
	// halves of the decision can be read together.
	if err := recordEnrollment(ctx, tx, Actor{ID: account.ID}, ActionAccountEnrolled, targetTypeUser, account.ID, map[string]any{
		KeyEnrollmentSignupSource:       KindAdminCreated,
		KeyEnrollmentCanCreateWorkspace: account.CanCreateWorkspace,
		KeyEnrollmentID:                 record.ID,
	}); err != nil {
		return EnrolledAccount{}, err
	}
	if err := tx.Commit(); err != nil {
		return EnrolledAccount{}, err
	}
	return account, nil
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
