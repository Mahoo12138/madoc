package core

import (
	"context"
	"database/sql"
	"errors"
)

// PurgeTrash permanently removes one confirmed deletion batch. Independent
// batches nested beneath it survive; their recorded original parent is retained.
func (s *Service) PurgeTrash(ctx context.Context, userID, workspaceID, batchID, confirmation string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var role string
	err = tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrForbidden
	}
	if err != nil {
		return err
	}
	if role != "owner" {
		return ErrForbidden
	}
	var title string
	err = tx.QueryRowContext(ctx, `SELECT i.title FROM item_deletion_batches b JOIN items i ON i.id=b.root_item_id AND i.deletion_batch_id=b.id WHERE b.id=? AND b.workspace_id=?`, batchID, workspaceID).Scan(&title)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if confirmation != title {
		return ErrInvalid
	}
	// Unexpected active or malformed children must block the operation rather
	// than silently moving or cascading into them.
	var invalid int
	err = tx.QueryRowContext(ctx, `SELECT count(*) FROM items child JOIN items parent ON child.parent_id=parent.id
 LEFT JOIN item_deletion_batches b ON b.id=child.deletion_batch_id
 WHERE parent.deletion_batch_id=? AND (child.workspace_id<>? OR (child.deletion_batch_id IS NOT ?
 AND (child.deletion_batch_id IS NULL OR b.id IS NULL OR b.workspace_id<>? OR b.root_item_id<>child.id)))`, batchID, workspaceID, batchID, workspaceID).Scan(&invalid)
	if err != nil {
		return err
	}
	if invalid != 0 {
		return ErrConflict
	}
	if _, err := tx.ExecContext(ctx, `UPDATE items SET parent_id=NULL WHERE parent_id IN (SELECT id FROM items WHERE deletion_batch_id=?) AND deletion_batch_id<>?`, batchID, batchID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM items WHERE deletion_batch_id=? AND workspace_id=?`, batchID, workspaceID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM item_deletion_batches WHERE id=? AND workspace_id=?`, batchID, workspaceID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) TrashItems(ctx context.Context, userID, workspaceID, batchID string) ([]Item, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if err := requireWorkspaceWrite(ctx, tx, userID, workspaceID); err != nil {
		return nil, err
	}
	var exists int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM item_deletion_batches WHERE id=? AND workspace_id=?`, batchID, workspaceID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists == 0 {
		return nil, ErrNotFound
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,workspace_id,parent_id,type,title,sort_key,created_by,created_at,updated_at FROM items WHERE deletion_batch_id=? AND workspace_id=? ORDER BY COALESCE(parent_id,''),sort_key,created_at`, batchID, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Item{}
	for rows.Next() {
		var item Item
		if err := rows.Scan(&item.ID, &item.WorkspaceID, &item.ParentID, &item.Type, &item.Title, &item.SortKey, &item.CreatedBy, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}
