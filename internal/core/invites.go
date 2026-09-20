package core

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"madoc/internal/auth"
)

func (s *Service) ListInvites(ctx context.Context, userID, workspaceID string) ([]Invite, error) {
	if err := s.requireOwner(ctx, userID, workspaceID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,workspace_id,email,role,status,expires_at,created_at FROM workspace_invites WHERE workspace_id=? ORDER BY created_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Invite{}
	for rows.Next() {
		var invite Invite
		if err := rows.Scan(&invite.ID, &invite.WorkspaceID, &invite.Email, &invite.Role, &invite.Status, &invite.ExpiresAt, &invite.CreatedAt); err != nil {
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

func (s *Service) InspectInvite(ctx context.Context, token string) (Invite, string, error) {
	hash := sha256.Sum256([]byte(token))
	var invite Invite
	var workspaceName string
	err := s.db.QueryRowContext(ctx, `SELECT i.id,i.workspace_id,i.email,i.role,i.status,i.expires_at,i.created_at,w.name FROM workspace_invites i JOIN workspaces w ON w.id=i.workspace_id WHERE i.token_hash=?`, hex.EncodeToString(hash[:])).Scan(&invite.ID, &invite.WorkspaceID, &invite.Email, &invite.Role, &invite.Status, &invite.ExpiresAt, &invite.CreatedAt, &workspaceName)
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
	now := time.Now().UTC()
	var user auth.User
	if current != nil {
		if !strings.EqualFold(current.Email, invite.Email) {
			return auth.User{}, Workspace{}, ErrForbidden
		}
		user = *current
	} else {
		var admin, disabled int
		err := tx.QueryRowContext(ctx, `SELECT id,name,email,is_admin,disabled FROM users WHERE email=?`, invite.Email).Scan(&user.ID, &user.Name, &user.Email, &admin, &disabled)
		if errors.Is(err, sql.ErrNoRows) {
			name = strings.TrimSpace(name)
			if name == "" || len(password) < 8 {
				return auth.User{}, Workspace{}, ErrInvalid
			}
			hash, err := auth.HashPassword(password)
			if err != nil {
				return auth.User{}, Workspace{}, err
			}
			user = auth.User{ID: uuid.NewString(), Name: name, Email: invite.Email}
			if _, err := tx.ExecContext(ctx, `INSERT INTO users(id,name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)`, user.ID, user.Name, user.Email, hash, now, now); err != nil {
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
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role`, invite.WorkspaceID, user.ID, invite.Role, now); err != nil {
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
	if err := tx.QueryRowContext(ctx, `SELECT id,name,created_at,updated_at FROM workspaces WHERE id=?`, invite.WorkspaceID).Scan(&workspace.ID, &workspace.Name, &workspace.CreatedAt, &workspace.UpdatedAt); err != nil {
		return auth.User{}, Workspace{}, err
	}
	workspace.Role = invite.Role
	if err := tx.Commit(); err != nil {
		return auth.User{}, Workspace{}, err
	}
	return user, workspace, nil
}
