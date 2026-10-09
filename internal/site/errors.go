package site

import "errors"

var (
	ErrCorrupt                 = errors.New("site settings are corrupt")
	ErrInvalidChange           = errors.New("invalid site settings change")
	ErrRegistrationNotReady    = errors.New("public registration is not ready")
	ErrRevisionConflict        = errors.New("site settings revision conflict")
	ErrAdminRequired           = errors.New("site administrator required")
	ErrWorkspaceCreationDenied = errors.New("workspace creation is not allowed")
)

// IsCorrupt reports whether err represents invalid or missing site settings.
func IsCorrupt(err error) bool {
	return errors.Is(err, ErrCorrupt)
}
