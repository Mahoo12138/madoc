package core

import (
	"context"
	"database/sql"
	"errors"
)

type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db: db} }

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
	role, err := s.Role(ctx, userID, workspaceID)
	if err != nil {
		return err
	}
	if !canWrite(role) {
		return ErrForbidden
	}
	return nil
}

func (s *Service) ItemAccess(ctx context.Context, userID, itemID string, write bool) (Item, error) {
	item, err := s.GetItem(ctx, itemID)
	if err != nil {
		return Item{}, err
	}
	role, err := s.Role(ctx, userID, item.WorkspaceID)
	if err != nil {
		return Item{}, err
	}
	if write && !canWrite(role) {
		return Item{}, ErrForbidden
	}
	return item, nil
}
