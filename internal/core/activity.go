package core

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
)

const (
	DefaultActivityPageSize = 30
	MaxActivityPageSize     = 100
)

// recordActivityTx keeps activity records in the same transaction as the
// action they describe. Summary text is server-authored and never includes
// document or comment contents.
func recordActivityTx(ctx context.Context, tx *sql.Tx, workspaceID string, itemID *string, itemTitle, actorID, eventType, summary string, at time.Time) error {
	var actorName string
	if err := tx.QueryRowContext(ctx, `SELECT name FROM users WHERE id=?`, actorID).Scan(&actorName); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO workspace_activity(id,workspace_id,item_id,item_title,actor_id,actor_name,event_type,summary,created_at)
 VALUES(?,?,?,?,?,?,?,?,?)`, uuid.NewString(), workspaceID, itemID, itemTitle, actorID, actorName, eventType, summary, at.UTC())
	return err
}

func recordCoalescedActivityTx(ctx context.Context, tx *sql.Tx, workspaceID string, itemID *string, itemTitle, actorID, eventType, summary string, at time.Time, window time.Duration) error {
	if itemID != nil {
		result, err := tx.ExecContext(ctx, `UPDATE workspace_activity SET item_title=?,actor_name=(SELECT name FROM users WHERE id=?),summary=?,created_at=?
 WHERE id=(SELECT id FROM workspace_activity WHERE workspace_id=? AND item_id=? AND actor_id=? AND event_type=? AND created_at>=? ORDER BY created_at DESC,id DESC LIMIT 1)`,
			itemTitle, actorID, summary, at.UTC(), workspaceID, *itemID, actorID, eventType, at.Add(-window).UTC())
		if err != nil {
			return err
		}
		if count, err := result.RowsAffected(); err != nil {
			return err
		} else if count > 0 {
			return nil
		}
	}
	return recordActivityTx(ctx, tx, workspaceID, itemID, itemTitle, actorID, eventType, summary, at)
}

func (s *Service) ListWorkspaceActivity(ctx context.Context, userID, workspaceID, before string, limit int) ([]ActivityEvent, string, error) {
	if limit == 0 {
		limit = DefaultActivityPageSize
	}
	if limit < 1 || limit > MaxActivityPageSize || (before != "" && !validImportID(before)) {
		return nil, "", ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	if _, err := workspaceRole(ctx, tx, userID, workspaceID); err != nil {
		return nil, "", err
	}
	query := `SELECT id,item_id,item_title,actor_name,event_type,summary,created_at FROM workspace_activity WHERE workspace_id=?`
	args := []any{workspaceID}
	if before != "" {
		query += ` AND (created_at,id)<(SELECT created_at,id FROM workspace_activity WHERE id=? AND workspace_id=?)`
		args = append(args, before, workspaceID)
	}
	query += ` ORDER BY created_at DESC,id DESC LIMIT ?`
	args = append(args, limit+1)
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	events := make([]ActivityEvent, 0, limit+1)
	for rows.Next() {
		var event ActivityEvent
		var itemID sql.NullString
		if err := rows.Scan(&event.ID, &itemID, &event.ItemTitle, &event.ActorName, &event.Type, &event.Summary, &event.CreatedAt); err != nil {
			return nil, "", err
		}
		if itemID.Valid {
			event.ItemID = &itemID.String
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	nextBefore := ""
	if len(events) > limit {
		events = events[:limit]
		nextBefore = events[len(events)-1].ID
	}
	return events, nextBefore, nil
}

func workspaceRole(ctx context.Context, tx *sql.Tx, userID, workspaceID string) (string, error) {
	var role string
	if err := tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, userID).Scan(&role); errors.Is(err, sql.ErrNoRows) {
		return "", ErrForbidden
	} else if err != nil {
		return "", err
	}
	return role, nil
}
