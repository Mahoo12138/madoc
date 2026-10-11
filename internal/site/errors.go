package site

import "errors"

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
)

// IsCorrupt reports whether err represents invalid or missing site settings.
func IsCorrupt(err error) bool {
	return errors.Is(err, ErrCorrupt)
}
