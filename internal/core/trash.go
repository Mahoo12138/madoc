package core

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
)

var ErrRestoreDestination = errors.New("original parent is unavailable; choose a restore destination")

type TrashBatch struct {
	ID        string    `json:"id"`
	Root      Item      `json:"root"`
	DeletedBy string    `json:"deletedBy"`
	DeletedAt time.Time `json:"deletedAt"`
	ItemCount int       `json:"itemCount"`
}

// nil destination means original location. An explicit destination with nil
// ParentID means the workspace root, never an implicit fallback.
type TrashDestination struct {
	ParentID *string `json:"parentId"`
}

func (s *Service) DeleteItem(ctx context.Context, userID, itemID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return err
	}
	batchID := uuid.NewString()
	now := time.Now().UTC()
	if _, err := tx.ExecContext(ctx, `INSERT INTO item_deletion_batches(id,workspace_id,root_item_id,original_parent_id,deleted_by,deleted_at) VALUES(?,?,?,?,?,?)`, batchID, item.WorkspaceID, item.ID, item.ParentID, userID, now); err != nil {
		return err
	}
	// Traverse only active descendants. Older independent deletion batches retain
	// their original membership, metadata and parent pointers.
	_, err = tx.ExecContext(ctx, `WITH RECURSIVE tree(id) AS (
 SELECT id FROM items WHERE id=? AND workspace_id=? AND deletion_batch_id IS NULL
 UNION ALL SELECT i.id FROM items i JOIN tree t ON i.parent_id=t.id WHERE i.workspace_id=? AND i.deletion_batch_id IS NULL
 ) UPDATE items SET deletion_batch_id=?,updated_at=? WHERE id IN (SELECT id FROM tree)`, itemID, item.WorkspaceID, item.WorkspaceID, batchID, now)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) ListTrash(ctx context.Context, userID, workspaceID string) ([]TrashBatch, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if err := requireWorkspaceWrite(ctx, tx, userID, workspaceID); err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT b.id,b.deleted_by,b.deleted_at,
 i.id,i.workspace_id,i.parent_id,i.type,i.title,i.sort_key,i.created_by,i.created_at,i.updated_at,
 (SELECT count(*) FROM items c WHERE c.deletion_batch_id=b.id)
 FROM item_deletion_batches b JOIN items i ON i.id=b.root_item_id AND i.deletion_batch_id=b.id
 WHERE b.workspace_id=? ORDER BY b.deleted_at DESC,b.id`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []TrashBatch{}
	for rows.Next() {
		var batch TrashBatch
		i := &batch.Root
		if err := rows.Scan(&batch.ID, &batch.DeletedBy, &batch.DeletedAt, &i.ID, &i.WorkspaceID, &i.ParentID, &i.Type, &i.Title, &i.SortKey, &i.CreatedBy, &i.CreatedAt, &i.UpdatedAt, &batch.ItemCount); err != nil {
			return nil, err
		}
		result = append(result, batch)
	}
	return result, rows.Err()
}

func (s *Service) RestoreTrash(ctx context.Context, userID, workspaceID, batchID string, destination *TrashDestination) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := requireWorkspaceWrite(ctx, tx, userID, workspaceID); err != nil {
		return err
	}
	var rootID string
	var originalParent *string
	err = tx.QueryRowContext(ctx, `SELECT b.root_item_id,b.original_parent_id FROM item_deletion_batches b
 JOIN items i ON i.id=b.root_item_id AND i.deletion_batch_id=b.id WHERE b.id=? AND b.workspace_id=?`, batchID, workspaceID).Scan(&rootID, &originalParent)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	parent := originalParent
	if destination != nil {
		parent = destination.ParentID
	}
	if err := validateParent(ctx, tx, workspaceID, parent); err != nil {
		if destination == nil && errors.Is(err, ErrInvalid) {
			return ErrRestoreDestination
		}
		return err
	}
	if destination != nil {
		var sortKey int
		if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_key),-1)+1 FROM items WHERE workspace_id=? AND parent_id IS ? AND deletion_batch_id IS NULL`, workspaceID, parent).Scan(&sortKey); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE items SET parent_id=?,sort_key=? WHERE id=?`, parent, sortKey, rootID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE items SET deletion_batch_id=NULL,updated_at=? WHERE deletion_batch_id=? AND workspace_id=?`, time.Now().UTC(), batchID, workspaceID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM item_deletion_batches WHERE id=?`, batchID); err != nil {
		return err
	}
	return tx.Commit()
}
