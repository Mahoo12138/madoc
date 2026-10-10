package core

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"madoc/internal/auth"
	"madoc/internal/site"
)

func (s *Service) ListInvites(ctx context.Context, userID, workspaceID string) ([]Invite, error) {
	if err := s.requireOwner(ctx, userID, workspaceID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,workspace_id,email,role,status,expires_at,created_at,inviter_id FROM workspace_invites WHERE workspace_id=? ORDER BY created_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Invite{}
	for rows.Next() {
		var invite Invite
		if err := rows.Scan(&invite.ID, &invite.WorkspaceID, &invite.Email, &invite.Role, &invite.Status, &invite.ExpiresAt, &invite.CreatedAt, &invite.InviterID); err != nil {
			return nil, err
		}
		result = append(result, invite)
	}
	return result, rows.Err()
}

func (s *Service) CreateInvite(ctx context.Context, userID, workspaceID, email, role string) (Invite, string, error) {
	if err := s.requireOwner(ctx, userID, workspaceID); err != nil {
		return Invite{}, "", err
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if !strings.Contains(email, "@") || (role != "editor" && role != "viewer") {
		return Invite{}, "", ErrInvalid
	}
	if err := s.authorizeInviteTarget(ctx, email, userID); err != nil {
		return Invite{}, "", err
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return Invite{}, "", err
	}
	id := uuid.NewString()
	tokenSecret := base64.RawURLEncoding.EncodeToString(secret)
	token := id + "." + tokenSecret
	hash := sha256.Sum256([]byte(token))
	now := time.Now().UTC()
	invite := Invite{ID: id, WorkspaceID: workspaceID, Email: email, Role: role, Status: "pending", ExpiresAt: now.Add(7 * 24 * time.Hour), CreatedAt: now}
	_, err := s.db.ExecContext(ctx, `INSERT INTO workspace_invites(id,workspace_id,email,role,token_hash,inviter_id,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, id, workspaceID, email, role, hex.EncodeToString(hash[:]), userID, invite.Status, invite.ExpiresAt, now, now)
	return invite, token, err
}

func (s *Service) RevokeInvite(ctx context.Context, userID, workspaceID, inviteID string) error {
	if err := s.requireOwner(ctx, userID, workspaceID); err != nil {
		return err
	}
	result, err := s.db.ExecContext(ctx, `UPDATE workspace_invites SET status='revoked',updated_at=? WHERE id=? AND workspace_id=? AND status='pending'`, time.Now().UTC(), inviteID, workspaceID)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

// authorizeInviteTarget decides whether an invite may be addressed to email at
// all. Creating an account from an invite is a registration path, so it obeys
// the current registration matrix; inviting an account that already exists only
// has to clear its own disabled state. This path holds no transaction and is
// therefore free to read through s.db.
func (s *Service) authorizeInviteTarget(ctx context.Context, email, inviterID string) error {
	var targetID string
	var targetDisabled int
	err := s.db.QueryRowContext(ctx, `SELECT id,disabled FROM users WHERE email=?`, email).Scan(&targetID, &targetDisabled)
	switch {
	case err == nil:
		if targetDisabled != 0 {
			return ErrInviteTargetDisabled
		}
		return nil
	case errors.Is(err, sql.ErrNoRows):
	default:
		return err
	}
	settings, err := s.site.Load(ctx, s.db)
	if err != nil {
		return err
	}
	if !site.RegistrationAllowsNewAccount(settings) {
		return site.ErrRegistrationClosed
	}
	inviter, err := s.site.ActorFrom(ctx, s.db, inviterID)
	if err != nil {
		return err
	}
	if !site.CanInviteNewUser(settings, inviterIsAdmin(inviter)) {
		return site.ErrInviteNewUserDenied
	}
	return nil
}

func inviterIsAdmin(actor site.Actor) bool { return actor.IsAdmin && !actor.Disabled }

func (s *Service) InspectInvite(ctx context.Context, token string) (Invite, string, error) {
	hash := sha256.Sum256([]byte(token))
	var invite Invite
	var workspaceName string
	err := s.db.QueryRowContext(ctx, `SELECT i.id,i.workspace_id,i.email,i.role,i.status,i.expires_at,i.created_at,i.inviter_id,w.name FROM workspace_invites i JOIN workspaces w ON w.id=i.workspace_id WHERE i.token_hash=?`, hex.EncodeToString(hash[:])).Scan(&invite.ID, &invite.WorkspaceID, &invite.Email, &invite.Role, &invite.Status, &invite.ExpiresAt, &invite.CreatedAt, &invite.InviterID, &workspaceName)
	if errors.Is(err, sql.ErrNoRows) {
		return Invite{}, "", ErrNotFound
	}
	if err != nil {
		return Invite{}, "", err
	}
	if invite.Status != "pending" || invite.ExpiresAt.Before(time.Now().UTC()) {
		return Invite{}, "", ErrConflict
	}
	return invite, workspaceName, nil
}

// InviteAdmission answers what the holder of a valid token may do next: the
// invite details, the workspace name, and whether that token can still create a
// brand-new account. The caller already knows the token, so the flag reveals no
// account existence beyond what the invite itself states.
func (s *Service) InviteAdmission(ctx context.Context, token string) (Invite, string, bool, error) {
	invite, workspaceName, err := s.InspectInvite(ctx, token)
	if err != nil {
		return Invite{}, "", false, err
	}
	settings, err := s.site.Load(ctx, s.db)
	if err != nil {
		return Invite{}, "", false, err
	}
	inviter, err := s.site.ActorFrom(ctx, s.db, invite.InviterID)
	if err != nil {
		return Invite{}, "", false, err
	}
	canCreate := site.RegistrationAllowsNewAccount(settings) && site.CanInviteNewUser(settings, inviterIsAdmin(inviter))
	return invite, workspaceName, canCreate, nil
}

// inviterStillAuthorized re-checks inside the acceptance transaction that the
// inviter account is still active and still owns the workspace. The owner role
// captured when the invite was created says nothing about the present.
func (s *Service) inviterStillAuthorized(ctx context.Context, tx *sql.Tx, invite Invite) (site.Actor, error) {
	inviter, err := s.site.ActorFrom(ctx, tx, invite.InviterID)
	if err != nil {
		return site.Actor{}, err
	}
	if inviter.ID == "" || inviter.Disabled {
		return site.Actor{}, fmt.Errorf("%w: inviter is disabled", ErrForbidden)
	}
	var role string
	if err := tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, invite.WorkspaceID, invite.InviterID).Scan(&role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return site.Actor{}, fmt.Errorf("%w: inviter is no longer a member", ErrForbidden)
		}
		return site.Actor{}, err
	}
	if role != "owner" {
		return site.Actor{}, fmt.Errorf("%w: inviter is no longer the workspace owner", ErrForbidden)
	}
	return inviter, nil
}

func (s *Service) AcceptInvite(ctx context.Context, token, name, password string, current *auth.User) (auth.User, Workspace, error) {
	invite, _, err := s.InspectInvite(ctx, token)
	if err != nil {
		return auth.User{}, Workspace{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return auth.User{}, Workspace{}, err
	}
	defer tx.Rollback()
	inviter, err := s.inviterStillAuthorized(ctx, tx, invite)
	if err != nil {
		return auth.User{}, Workspace{}, err
	}
	now := time.Now().UTC()
	var user auth.User
	if current != nil {
		if !strings.EqualFold(current.Email, invite.Email) {
			return auth.User{}, Workspace{}, ErrForbidden
		}
		user = *current
	} else {
		var admin, disabled, canCreateWorkspace int
		err := tx.QueryRowContext(ctx, `SELECT id,name,email,is_admin,disabled,can_create_workspace FROM users WHERE email=?`, invite.Email).Scan(&user.ID, &user.Name, &user.Email, &admin, &disabled, &canCreateWorkspace)
		if errors.Is(err, sql.ErrNoRows) {
			// A new account is a registration: it must clear the policy that is
			// in force at acceptance time, not the one that was in force when
			// the invite was created. Reads use tx because the transaction owns
			// the single pooled connection.
			settings, err := s.site.Load(ctx, tx)
			if err != nil {
				return auth.User{}, Workspace{}, err
			}
			if !site.RegistrationAllowsNewAccount(settings) {
				return auth.User{}, Workspace{}, site.ErrRegistrationClosed
			}
			if !site.CanInviteNewUser(settings, inviterIsAdmin(inviter)) {
				return auth.User{}, Workspace{}, site.ErrInviteNewUserDenied
			}
			name = strings.TrimSpace(name)
			if name == "" || len(password) < 8 {
				return auth.User{}, Workspace{}, ErrInvalid
			}
			hash, err := auth.HashPassword(password)
			if err != nil {
				return auth.User{}, Workspace{}, err
			}
			inviteDefault, err := s.site.InviteDefaultCanCreateWorkspace(ctx, tx)
			if err != nil {
				return auth.User{}, Workspace{}, err
			}
			user = auth.User{ID: uuid.NewString(), Name: name, Email: invite.Email, CanCreateWorkspace: inviteDefault}
			user.ApplyCapabilities()
			if _, err := tx.ExecContext(ctx, `INSERT INTO users(id,name,email,password_hash,signup_source,can_create_workspace,created_at,updated_at) VALUES(?,?,?,?,'workspace_invite',?,?,?)`, user.ID, user.Name, user.Email, hash, inviteDefault, now, now); err != nil {
				return auth.User{}, Workspace{}, err
			}
		} else if err != nil {
			return auth.User{}, Workspace{}, err
		} else if disabled != 0 {
			return auth.User{}, Workspace{}, ErrForbidden
		} else {
			// Existing accounts must authenticate before accepting an invite. An
			// invite token is not an account credential.
			return auth.User{}, Workspace{}, ErrForbidden
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?) ON CONFLICT(workspace_id,user_id) DO NOTHING`, invite.WorkspaceID, user.ID, invite.Role, now); err != nil {
		return auth.User{}, Workspace{}, err
	}
	var actualRole string
	if err := tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, invite.WorkspaceID, user.ID).Scan(&actualRole); err != nil {
		return auth.User{}, Workspace{}, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE workspace_invites SET status='accepted',updated_at=? WHERE id=? AND status='pending' AND expires_at>?`, now, invite.ID, now)
	if err != nil {
		return auth.User{}, Workspace{}, err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return auth.User{}, Workspace{}, ErrConflict
	}
	var workspace Workspace
	if err := tx.QueryRowContext(ctx, `SELECT id,name,description,created_at,updated_at FROM workspaces WHERE id=?`, invite.WorkspaceID).Scan(&workspace.ID, &workspace.Name, &workspace.Description, &workspace.CreatedAt, &workspace.UpdatedAt); err != nil {
		return auth.User{}, Workspace{}, err
	}
	workspace.Role = actualRole
	user.ApplyCapabilities()
	if err := tx.Commit(); err != nil {
		return auth.User{}, Workspace{}, err
	}
	return user, workspace, nil
}
