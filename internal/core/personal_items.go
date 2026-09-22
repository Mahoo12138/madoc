package core

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type VisitedItem struct {
	Item      Item      `json:"item"`
	VisitedAt time.Time `json:"visitedAt"`
}
type PersonalItems struct {
	Favorites []Item        `json:"favorites"`
	Recent    []VisitedItem `json:"recent"`
}

// Read access is sufficient to change one's own navigation preferences. The
// authorization check and mutation share a transaction; no other user's key
// and no content or public tree metadata can be changed through these methods.
func (s *Service) SetFavorite(ctx context.Context, userID, itemID string, favorite bool) error {
	return s.changePersonalItem(ctx, userID, itemID, func(tx *sql.Tx) error {
		if !favorite {
			_, err := tx.ExecContext(ctx, `DELETE FROM item_favorites WHERE user_id=? AND item_id=?`, userID, itemID)
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO item_favorites(user_id,item_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id,item_id) DO NOTHING`, userID, itemID, time.Now().UTC())
		return err
	})
}
func (s *Service) VisitItem(ctx context.Context, userID, itemID string) error {
	return s.changePersonalItem(ctx, userID, itemID, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO item_visits(user_id,item_id,visited_at) VALUES(?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET visited_at=excluded.visited_at`, userID, itemID, time.Now().UTC())
		return err
	})
}
func (s *Service) changePersonalItem(ctx context.Context, userID, itemID string, mutate func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = itemAccess(ctx, tx, userID, itemID, false); err != nil {
		return err
	}
	if err = mutate(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) PersonalItems(ctx context.Context, userID, workspaceID string) (PersonalItems, error) {
	result := PersonalItems{Favorites: []Item{}, Recent: []VisitedItem{}}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	var role string
	if err = tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, userID).Scan(&role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return result, ErrForbidden
		}
		return result, err
	}
	const fields = `i.id,i.workspace_id,i.parent_id,i.type,i.title,i.sort_key,i.created_by,i.created_at,i.updated_at`
	rows, err := tx.QueryContext(ctx, `SELECT `+fields+` FROM item_favorites f JOIN items i ON i.id=f.item_id WHERE f.user_id=? AND i.workspace_id=? AND i.deletion_batch_id IS NULL ORDER BY f.created_at DESC,i.id`, userID, workspaceID)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var item Item
		if err = scanPersonalItem(rows, &item); err != nil {
			rows.Close()
			return result, err
		}
		result.Favorites = append(result.Favorites, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	rows, err = tx.QueryContext(ctx, `SELECT `+fields+`,v.visited_at FROM item_visits v JOIN items i ON i.id=v.item_id WHERE v.user_id=? AND i.workspace_id=? AND i.deletion_batch_id IS NULL ORDER BY v.visited_at DESC,i.id LIMIT 50`, userID, workspaceID)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var entry VisitedItem
		if err = scanPersonalItem(rows, &entry.Item, &entry.VisitedAt); err != nil {
			rows.Close()
			return result, err
		}
		result.Recent = append(result.Recent, entry)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	return result, tx.Commit()
}
func scanPersonalItem(rows *sql.Rows, item *Item, extra ...any) error {
	fields := []any{&item.ID, &item.WorkspaceID, &item.ParentID, &item.Type, &item.Title, &item.SortKey, &item.CreatedBy, &item.CreatedAt, &item.UpdatedAt}
	return rows.Scan(append(fields, extra...)...)
}
