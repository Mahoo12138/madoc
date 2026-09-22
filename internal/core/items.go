package core

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *Service) ListItems(ctx context.Context, userID, workspaceID string) ([]Item, error) {
	if _, err := s.Role(ctx, userID, workspaceID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,workspace_id,parent_id,type,title,sort_key,created_by,created_at,updated_at FROM items WHERE workspace_id=? AND deletion_batch_id IS NULL ORDER BY COALESCE(parent_id,''),sort_key,created_at`, workspaceID)
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

func (s *Service) GetItem(ctx context.Context, id string) (Item, error) {
	var item Item
	err := s.db.QueryRowContext(ctx, `SELECT id,workspace_id,parent_id,type,title,sort_key,created_by,created_at,updated_at FROM items WHERE id=? AND deletion_batch_id IS NULL`, id).Scan(&item.ID, &item.WorkspaceID, &item.ParentID, &item.Type, &item.Title, &item.SortKey, &item.CreatedBy, &item.CreatedAt, &item.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Item{}, ErrNotFound
	}
	return item, err
}

type InitialMarkdown struct {
	Snapshot []byte `json:"snapshot"`
	Markdown string `json:"markdown"`
}

func (s *Service) CreateItem(ctx context.Context, userID, workspaceID, itemType, title string, parentID *string) (Item, error) {
	return s.CreateItemWithMarkdown(ctx, userID, workspaceID, itemType, title, parentID, nil)
}

func (s *Service) CreateItemWithMarkdown(ctx context.Context, userID, workspaceID, itemType, title string, parentID *string, initial *InitialMarkdown) (Item, error) {
	if initial != nil && (itemType != "markdown" || len(initial.Snapshot) == 0) {
		return Item{}, ErrInvalid
	}
	if itemType != "folder" && itemType != "markdown" && itemType != "whiteboard" {
		return Item{}, ErrInvalid
	}
	title = strings.TrimSpace(title)
	if title == "" {
		return Item{}, ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Item{}, err
	}
	defer tx.Rollback()
	if err := requireWorkspaceWrite(ctx, tx, userID, workspaceID); err != nil {
		return Item{}, err
	}
	if err := validateParent(ctx, tx, workspaceID, parentID); err != nil {
		return Item{}, err
	}
	var sortKey int
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_key),-1)+1 FROM items WHERE workspace_id=? AND deletion_batch_id IS NULL AND parent_id IS ?`, workspaceID, parentID).Scan(&sortKey); err != nil {
		return Item{}, err
	}
	now := time.Now().UTC()
	item := Item{ID: uuid.NewString(), WorkspaceID: workspaceID, ParentID: parentID, Type: itemType, Title: title, SortKey: sortKey, CreatedBy: userID, CreatedAt: now, UpdatedAt: now}
	if _, err := tx.ExecContext(ctx, `INSERT INTO items(id,workspace_id,parent_id,type,title,sort_key,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`, item.ID, workspaceID, parentID, itemType, title, sortKey, userID, now, now); err != nil {
		return Item{}, err
	}
	if itemType == "markdown" {
		if _, err := tx.ExecContext(ctx, `INSERT INTO markdown_states(item_id,snapshot,markdown_cache,updated_at) VALUES(?,?,?,?)`, item.ID, initialSnapshot(initial), initialText(initial), now); err != nil {
			return Item{}, err
		}
	}
	if itemType == "whiteboard" {
		if _, err := tx.ExecContext(ctx, `INSERT INTO whiteboard_states(item_id,updated_at) VALUES(?,?)`, item.ID, now); err != nil {
			return Item{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Item{}, err
	}
	return item, nil
}

func (s *Service) RenameItem(ctx context.Context, userID, itemID, title string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := itemAccess(ctx, tx, userID, itemID, true); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE items SET title=?,updated_at=? WHERE id=?`, title, time.Now().UTC(), itemID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) MoveItem(ctx context.Context, userID, itemID string, parentID *string, index int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var workspaceID, role string
	var oldParent sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT i.workspace_id,i.parent_id,m.role FROM items i JOIN workspace_members m ON m.workspace_id=i.workspace_id AND m.user_id=? WHERE i.id=? AND i.deletion_batch_id IS NULL`, userID, itemID).Scan(&workspaceID, &oldParent, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrForbidden
	}
	if err != nil {
		return err
	}
	if !canWrite(role) {
		return ErrForbidden
	}
	if parentID != nil {
		if *parentID == itemID {
			return ErrInvalid
		}
		var parentWorkspace, parentType string
		if err := tx.QueryRowContext(ctx, `SELECT workspace_id,type FROM items WHERE id=? AND deletion_batch_id IS NULL`, *parentID).Scan(&parentWorkspace, &parentType); errors.Is(err, sql.ErrNoRows) {
			return ErrInvalid
		} else if err != nil {
			return err
		}
		if parentWorkspace != workspaceID || parentType != "folder" {
			return ErrInvalid
		}
		var descendants int
		err := tx.QueryRowContext(ctx, `WITH RECURSIVE tree(id) AS (SELECT id FROM items WHERE parent_id=? UNION ALL SELECT i.id FROM items i JOIN tree t ON i.parent_id=t.id) SELECT count(*) FROM tree WHERE id=?`, itemID, *parentID).Scan(&descendants)
		if err != nil {
			return err
		}
		if descendants > 0 {
			return ErrInvalid
		}
	}
	rows, err := tx.QueryContext(ctx, `SELECT id FROM items WHERE workspace_id=? AND deletion_batch_id IS NULL AND parent_id IS ? AND id<>? ORDER BY sort_key,created_at`, workspaceID, parentID, itemID)
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if index < 0 {
		index = 0
	}
	if index > len(ids) {
		index = len(ids)
	}
	ids = append(ids, "")
	copy(ids[index+1:], ids[index:])
	ids[index] = itemID
	if _, err := tx.ExecContext(ctx, `UPDATE items SET parent_id=?,updated_at=? WHERE id=?`, parentID, time.Now().UTC(), itemID); err != nil {
		return err
	}
	if err := reindexItems(ctx, tx, ids); err != nil {
		return err
	}
	if !sameParent(oldParent, parentID) {
		oldRows, err := tx.QueryContext(ctx, `SELECT id FROM items WHERE workspace_id=? AND deletion_batch_id IS NULL AND parent_id IS ? ORDER BY sort_key,created_at`, workspaceID, nullableParent(oldParent))
		if err != nil {
			return err
		}
		oldIDs := []string{}
		for oldRows.Next() {
			var id string
			if err := oldRows.Scan(&id); err != nil {
				oldRows.Close()
				return err
			}
			oldIDs = append(oldIDs, id)
		}
		if err := oldRows.Err(); err != nil {
			oldRows.Close()
			return err
		}
		if err := oldRows.Close(); err != nil {
			return err
		}
		if err := reindexItems(ctx, tx, oldIDs); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func reindexItems(ctx context.Context, tx *sql.Tx, ids []string) error {
	for position, id := range ids {
		if _, err := tx.ExecContext(ctx, `UPDATE items SET sort_key=? WHERE id=?`, position, id); err != nil {
			return err
		}
	}
	return nil
}

func nullableParent(parent sql.NullString) any {
	if parent.Valid {
		return parent.String
	}
	return nil
}

func sameParent(old sql.NullString, next *string) bool {
	if !old.Valid {
		return next == nil
	}
	return next != nil && old.String == *next
}

func validateParent(ctx context.Context, q itemQuerier, workspaceID string, parentID *string) error {
	if parentID == nil {
		return nil
	}
	var parentWorkspace, parentType string
	err := q.QueryRowContext(ctx, `SELECT workspace_id,type FROM items WHERE id=? AND deletion_batch_id IS NULL`, *parentID).Scan(&parentWorkspace, &parentType)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrInvalid
	}
	if err != nil {
		return err
	}
	if parentWorkspace != workspaceID || parentType != "folder" {
		return ErrInvalid
	}
	return nil
}

func initialSnapshot(initial *InitialMarkdown) []byte {
	if initial == nil {
		return nil
	}
	return initial.Snapshot
}
func initialText(initial *InitialMarkdown) string {
	if initial == nil {
		return ""
	}
	return initial.Markdown
}
