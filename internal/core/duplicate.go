package core

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

// DuplicateItem captures saved content and creates its independent copy in one
// transaction. It never interprets Yjs or copies personal navigation state.
func (s *Service) DuplicateItem(ctx context.Context, userID, sourceID, title string) (Item, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return Item{}, ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Item{}, err
	}
	defer tx.Rollback()
	source, err := itemAccess(ctx, tx, userID, sourceID, true)
	if err != nil {
		return Item{}, err
	}
	if source.Type != "markdown" && source.Type != "whiteboard" {
		return Item{}, ErrInvalid
	}
	if err := validateParent(ctx, tx, source.WorkspaceID, source.ParentID); err != nil {
		return Item{}, err
	}
	now := time.Now().UTC()
	copy := source
	copy.ID, copy.Title, copy.CreatedBy = uuid.NewString(), title, userID
	copy.CreatedAt, copy.UpdatedAt = now, now
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_key),-1)+1 FROM items WHERE workspace_id=? AND parent_id IS ? AND deletion_batch_id IS NULL`, source.WorkspaceID, source.ParentID).Scan(&copy.SortKey); err != nil {
		return Item{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO items(id,workspace_id,parent_id,type,title,sort_key,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`, copy.ID, copy.WorkspaceID, copy.ParentID, copy.Type, copy.Title, copy.SortKey, userID, now, now); err != nil {
		return Item{}, err
	}
	if source.Type == "markdown" {
		err = duplicateMarkdown(ctx, tx, source.ID, copy.ID, userID, now)
	} else {
		var scene string
		err = tx.QueryRowContext(ctx, `SELECT scene_json FROM whiteboard_states WHERE item_id=?`, source.ID).Scan(&scene)
		if err == nil {
			_, err = tx.ExecContext(ctx, `INSERT INTO whiteboard_states(item_id,revision,scene_json,updated_by,updated_at) VALUES(?,0,?,?,?)`, copy.ID, scene, userID, now)
		}
	}
	if err != nil {
		return Item{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO item_asset_refs(item_id,asset_id)
 SELECT ?,id FROM assets WHERE workspace_id=? AND item_id=?
 UNION SELECT ?,asset_id FROM item_asset_refs WHERE item_id=?`, copy.ID, source.WorkspaceID, source.ID, copy.ID, source.ID); err != nil {
		return Item{}, err
	}
	if err := tx.Commit(); err != nil {
		return Item{}, err
	}
	return copy, nil
}

func duplicateMarkdown(ctx context.Context, tx *sql.Tx, sourceID, targetID, userID string, now time.Time) error {
	var snapshot []byte
	var snapshotSeq, cacheSeq, head int64
	var markdown string
	err := tx.QueryRowContext(ctx, `SELECT snapshot,snapshot_seq,markdown_cache,cache_seq,MAX(snapshot_seq,(SELECT COALESCE(MAX(id),0) FROM markdown_updates WHERE item_id=?)) FROM markdown_states WHERE item_id=?`, sourceID, sourceID).Scan(&snapshot, &snapshotSeq, &markdown, &cacheSeq, &head)
	if err != nil {
		return err
	}
	if cacheSeq != head {
		return ErrMarkdownExportPending
	}
	rows, err := tx.QueryContext(ctx, `SELECT update_blob FROM markdown_updates WHERE item_id=? AND id>? ORDER BY id`, sourceID, snapshotSeq)
	if err != nil {
		return err
	}
	var updates [][]byte
	for rows.Next() {
		var update []byte
		if err := rows.Scan(&update); err != nil {
			rows.Close()
			return err
		}
		updates = append(updates, update)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	// The copied snapshot is the new baseline. Sequence numbers belong to the
	// new Item's log, while Yjs bytes remain unchanged and document-scoped.
	var targetHead int64
	for _, update := range updates {
		clientID := uuid.NewString()
		result, err := tx.ExecContext(ctx, `INSERT INTO markdown_updates(item_id,client_update_id,update_blob,created_by,created_at) VALUES(?,?,?,?,?)`, targetID, clientID, update, userID, now)
		if err != nil {
			return err
		}
		targetHead, err = result.LastInsertId()
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO markdown_update_receipts(item_id,client_update_id,seq) VALUES(?,?,?)`, targetID, clientID, targetHead); err != nil {
			return err
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO markdown_states(item_id,snapshot,snapshot_seq,markdown_cache,cache_seq,generation,updated_at) VALUES(?,?,0,?,?,0,?)`, targetID, snapshot, markdown, targetHead, now)
	return err
}
