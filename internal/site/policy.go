package site

import (
	"context"
	"database/sql"
	"errors"
)

const (
	KeyRegistrationMode                      = "registrationMode"
	KeyAllowWorkspaceOwnerInviteNewUsers     = "allowWorkspaceOwnerInviteNewUsers"
	KeyInviteDefaultCanCreateWorkspace       = "inviteDefaultCanCreateWorkspace"
	KeyPublicSignupDefaultCanCreateWorkspace = "publicSignupDefaultCanCreateWorkspace"
)

var implemented = map[string]bool{
	KeyRegistrationMode:                      true,
	KeyAllowWorkspaceOwnerInviteNewUsers:     true,
	KeyInviteDefaultCanCreateWorkspace:       true,
	KeyPublicSignupDefaultCanCreateWorkspace: true,
}

// Actor contains the current database-backed facts used by site policies.
type Actor struct {
	ID                 string
	IsAdmin            bool
	Disabled           bool
	CanCreateWorkspace bool
}

// CanManageSite reports whether an actor is an enabled site administrator.
func CanManageSite(actor Actor) bool {
	return actor.ID != "" && !actor.Disabled && actor.IsAdmin
}

// CanCreateWorkspace reports whether an enabled actor may create workspaces.
func CanCreateWorkspace(actor Actor) bool {
	return actor.ID != "" && !actor.Disabled && (actor.IsAdmin || actor.CanCreateWorkspace)
}

// ActorFrom reads current capability facts through q so callers may reuse a transaction.
func (s *Store) ActorFrom(ctx context.Context, q DBTX, userID string) (Actor, error) {
	var actor Actor
	var admin, disabled, canCreate int
	err := q.QueryRowContext(ctx, `SELECT id,is_admin,disabled,can_create_workspace FROM users WHERE id=?`, userID).Scan(&actor.ID, &admin, &disabled, &canCreate)
	if errors.Is(err, sql.ErrNoRows) {
		return Actor{}, nil
	}
	if err != nil {
		return Actor{}, err
	}
	actor.IsAdmin = admin != 0
	actor.Disabled = disabled != 0
	actor.CanCreateWorkspace = canCreate != 0
	return actor, nil
}

// RegistrationAllowsNewAccount reports whether the current mode lets an invite
// create a brand-new account. Only invite_only and open may; an unknown mode
// (including the zero Settings value) fails closed so a caller that skipped a
// Load error can never end up creating accounts.
func RegistrationAllowsNewAccount(s Settings) bool {
	return s.RegistrationMode == "invite_only" || s.RegistrationMode == "open"
}

// CanInviteNewUser reports whether an inviter may invite someone who has no
// account yet. Site administrators are exempt from the owner switch because the
// mode already expresses the site-wide decision; every other owner needs
// AllowWorkspaceOwnerInviteNewUsers. A closed site stays closed for everyone:
// creating an account from an invite is a registration path, which the explicit
// account creation flow of a later stage does not widen.
func CanInviteNewUser(s Settings, inviterIsAdmin bool) bool {
	if !RegistrationAllowsNewAccount(s) {
		return false
	}
	if inviterIsAdmin {
		return true
	}
	return s.AllowWorkspaceOwnerInviteNewUsers
}

// InviteDefaultCanCreateWorkspace returns the validated invite default using q.
func (s *Store) InviteDefaultCanCreateWorkspace(ctx context.Context, q DBTX) (bool, error) {
	settings, err := s.Load(ctx, q)
	if err != nil {
		return false, err
	}
	return settings.InviteDefaultCanCreateWorkspace, nil
}

func implementedSettings() map[string]bool {
	result := make(map[string]bool, len(implemented))
	for key, value := range implemented {
		result[key] = value
	}
	return result
}
