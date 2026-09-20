package core

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *Service) ListWorkspaces(ctx context.Context, userID string) ([]Workspace, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT w.id,w.name,m.role,w.created_at,w.updated_at FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Workspace{}
	for rows.Next() {
		var workspace Workspace
		if err := rows.Scan(&workspace.ID, &workspace.Name, &workspace.Role, &workspace.CreatedAt, &workspace.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, workspace)
	}
	return result, rows.Err()
}

func (s *Service) CreateWorkspace(ctx context.Context, userID, name string) (Workspace, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Workspace{}, ErrInvalid
	}
	now := time.Now().UTC()
	workspace := Workspace{ID: uuid.NewString(), Name: name, Role: "owner", CreatedAt: now, UpdatedAt: now}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Workspace{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspaces(id,name,created_by,created_at,updated_at) VALUES(?,?,?,?,?)`, workspace.ID, name, userID, now, now); err != nil {
		return Workspace{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)`, workspace.ID, userID, "owner", now); err != nil {
		return Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return Workspace{}, err
	}
	return workspace, nil
}

func (s *Service) GetWorkspace(ctx context.Context, userID, id string) (Workspace, error) {
	var workspace Workspace
	err := s.db.QueryRowContext(ctx, `SELECT w.id,w.name,m.role,w.created_at,w.updated_at FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE w.id=? AND m.user_id=?`, id, userID).Scan(&workspace.ID, &workspace.Name, &workspace.Role, &workspace.CreatedAt, &workspace.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Workspace{}, ErrNotFound
	}
	return workspace, err
}

func (s *Service) RenameWorkspace(ctx context.Context, userID, id, name string) error {
	if err := s.requireOwner(ctx, userID, id); err != nil {
		return err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return ErrInvalid
	}
	_, err := s.db.ExecContext(ctx, `UPDATE workspaces SET name=?,updated_at=? WHERE id=?`, name, time.Now().UTC(), id)
	return err
}

func (s *Service) DeleteWorkspace(ctx context.Context, userID, id string) error {
	if err := s.requireOwner(ctx, userID, id); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM workspaces WHERE id=?`, id)
	return err
}

func (s *Service) ListMembers(ctx context.Context, userID, workspaceID string) ([]Member, error) {
	if _, err := s.Role(ctx, userID, workspaceID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT u.id,u.name,u.email,m.role,m.created_at FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Member{}
	for rows.Next() {
		var member Member
		if err := rows.Scan(&member.UserID, &member.Name, &member.Email, &member.Role, &member.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, member)
	}
	return result, rows.Err()
}

func (s *Service) UpdateMember(ctx context.Context, actorID, workspaceID, targetID, role string) error {
	if err := s.requireOwner(ctx, actorID, workspaceID); err != nil {
		return err
	}
	if role != "owner" && role != "editor" && role != "viewer" {
		return ErrInvalid
	}
	return s.withOwnerGuard(ctx, workspaceID, targetID, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?`, role, workspaceID, targetID)
		if err != nil {
			return err
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			return ErrNotFound
		}
		return nil
	})
}

func (s *Service) RemoveMember(ctx context.Context, actorID, workspaceID, targetID string) error {
	if err := s.requireOwner(ctx, actorID, workspaceID); err != nil {
		return err
	}
	return s.withOwnerGuard(ctx, workspaceID, targetID, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, targetID)
		if err != nil {
			return err
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			return ErrNotFound
		}
		return nil
	})
}

func (s *Service) withOwnerGuard(ctx context.Context, workspaceID, targetID string, change func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var targetRole string
	if err := tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, targetID).Scan(&targetRole); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if targetRole == "owner" {
		var owners int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM workspace_members WHERE workspace_id=? AND role='owner'`, workspaceID).Scan(&owners); err != nil {
			return err
		}
		if owners <= 1 {
			return ErrConflict
		}
	}
	if err := change(tx); err != nil {
		return err
	}
	return tx.Commit()
}
