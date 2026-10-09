package core

import (
	"context"
	"database/sql"
	"errors"

	"madoc/internal/site"
)

type Service struct {
	db   *sql.DB
	site *site.Store
}

// New wires the domain service. The site store is injected so transaction
// holders can read site policy through their own *sql.Tx instead of a second
// pool handle, which would self-lock under SetMaxOpenConns(1).
func New(db *sql.DB, siteStore *site.Store) *Service { return &Service{db: db, site: siteStore} }

func (s *Service) Role(ctx context.Context, userID, workspaceID string) (string, error) {
	var role string
	err := s.db.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrForbidden
	}
	return role, err
}

func canWrite(role string) bool { return role == "owner" || role == "editor" }

func (s *Service) requireOwner(ctx context.Context, userID, workspaceID string) error {
	role, err := s.Role(ctx, userID, workspaceID)
	if err != nil {
		return err
	}
	if role != "owner" {
		return ErrForbidden
	}
	return nil
}

func (s *Service) requireWrite(ctx context.Context, userID, workspaceID string) error {
	return requireWorkspaceWrite(ctx, s.db, userID, workspaceID)
}

type itemQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func itemAccess(ctx context.Context, q itemQuerier, userID, itemID string, write bool) (Item, error) {
	var item Item
	var role string
	err := q.QueryRowContext(ctx, `SELECT i.id,i.workspace_id,i.parent_id,i.type,i.title,i.sort_key,i.created_by,i.created_at,i.updated_at,COALESCE(m.role,'')
 FROM items i LEFT JOIN workspace_members m ON m.workspace_id=i.workspace_id AND m.user_id=?
 WHERE i.id=? AND i.deletion_batch_id IS NULL`, userID, itemID).Scan(&item.ID, &item.WorkspaceID, &item.ParentID, &item.Type, &item.Title, &item.SortKey, &item.CreatedBy, &item.CreatedAt, &item.UpdatedAt, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return Item{}, ErrNotFound
	}
	if err != nil {
		return Item{}, err
	}
	if role == "" || (write && !canWrite(role)) {
		return Item{}, ErrForbidden
	}
	return item, nil
}

func (s *Service) ItemAccess(ctx context.Context, userID, itemID string, write bool) (Item, error) {
	return itemAccess(ctx, s.db, userID, itemID, write)
}

func requireWorkspaceWrite(ctx context.Context, q itemQuerier, userID, workspaceID string) error {
	var role string
	err := q.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrForbidden
	}
	if err != nil {
		return err
	}
	if !canWrite(role) {
		return ErrForbidden
	}
	return nil
}
