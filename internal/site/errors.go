package site

import (
	"errors"
	"fmt"
	"time"
)

var (
	ErrCorrupt                 = errors.New("site settings are corrupt")
	ErrInvalidChange           = errors.New("invalid site settings change")
	ErrRegistrationNotReady    = errors.New("public registration is not ready")
	ErrRevisionConflict        = errors.New("site settings revision conflict")
	ErrAdminRequired           = errors.New("site administrator required")
	ErrWorkspaceCreationDenied = errors.New("workspace creation is not allowed")
	ErrRegistrationClosed      = errors.New("registration is closed")
	ErrInviteNewUserDenied     = errors.New("the invite cannot introduce a new site user")
	ErrUserNotFound            = errors.New("user not found")
	ErrSelfDisableForbidden    = errors.New("an administrator cannot disable their own account")
	ErrLastActiveAdmin         = errors.New("the site must keep at least one enabled administrator")

	// ErrEmailAlreadyRegistered refuses an activation flow for a mailbox that
	// already has an account. Nothing else may touch that account: neither its
	// password, its grants, nor its sessions.
	ErrEmailAlreadyRegistered = errors.New("an account already exists for this email")
	// ErrEnrollmentNotFound is the single verdict for every token an activation
	// request must refuse: unknown, revoked, consumed and expired tokens are
	// indistinguishable so failed attempts cannot map out the token space.
	ErrEnrollmentNotFound = errors.New("account activation record not found")
	// ErrEnrollmentIssuerRevoked reports that the administrator who approved an
	// enrollment lost site management authority before it was used. It wraps
	// ErrAdminRequired so every generic mapping keeps working, but it carries
	// its own message because the operator here is a different person than the
	// one who issued the approval.
	ErrEnrollmentIssuerRevoked = fmt.Errorf("%w: the approving administrator is no longer enabled", ErrAdminRequired)
	ErrRateLimited             = errors.New("too many requests")
)

// RateLimitError carries how long a client should wait before retrying so the
// handler can answer with an honest Retry-After instead of a guessed constant.
type RateLimitError struct{ RetryAfter time.Duration }

func (e *RateLimitError) Error() string {
	return "too many account activation attempts: retry after " + e.RetryAfter.Round(time.Second).String()
}

func (e *RateLimitError) Unwrap() error { return ErrRateLimited }

// IsCorrupt reports whether err represents invalid or missing site settings.
func IsCorrupt(err error) bool {
	return errors.Is(err, ErrCorrupt)
}
