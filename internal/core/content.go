package core

import (
	"context"
	"time"
)

func (s *Service) Markdown(ctx context.Context, userID, itemID string) (MarkdownState, error) {
	item, err := s.ItemAccess(ctx, userID, itemID, false)
	if err != nil {
		return MarkdownState{}, err
	}
	if item.Type != "markdown" {
		return MarkdownState{}, ErrInvalid
	}
	var state MarkdownState
	err = s.db.QueryRowContext(ctx, `SELECT snapshot,snapshot_seq,markdown_cache,cache_seq FROM markdown_states WHERE item_id=?`, itemID).Scan(&state.Snapshot, &state.SnapshotSeq, &state.Markdown, &state.CacheSeq)
	if err != nil {
		return MarkdownState{}, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,update_blob,COALESCE(created_by,'') FROM markdown_updates WHERE item_id=? AND id>? ORDER BY id`, itemID, state.SnapshotSeq)
	if err != nil {
		return MarkdownState{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var update MarkdownUpdate
		if err := rows.Scan(&update.Seq, &update.Update, &update.UserID); err != nil {
			return MarkdownState{}, err
		}
		state.Updates = append(state.Updates, update)
		state.HeadSeq = update.Seq
	}
	if state.HeadSeq < state.SnapshotSeq {
		state.HeadSeq = state.SnapshotSeq
	}
	return state, rows.Err()
}

func (s *Service) ResetMarkdown(ctx context.Context, userID, itemID string, snapshot []byte, markdown string) error {
	item, err := s.ItemAccess(ctx, userID, itemID, true)
	if err != nil {
		return err
	}
	if item.Type != "markdown" {
		return ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM markdown_updates WHERE item_id=?`, itemID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE markdown_states SET snapshot=?,snapshot_seq=0,markdown_cache=?,cache_seq=0,updated_at=? WHERE item_id=?`, snapshot, markdown, time.Now().UTC(), itemID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) AppendMarkdownUpdate(ctx context.Context, userID, itemID, clientUpdateID string, update []byte) (int64, error) {
	item, err := s.ItemAccess(ctx, userID, itemID, true)
	if err != nil {
		return 0, err
	}
	if item.Type != "markdown" || clientUpdateID == "" || len(update) == 0 {
		return 0, ErrInvalid
	}
	result, err := s.db.ExecContext(ctx, `INSERT INTO markdown_updates(item_id,client_update_id,update_blob,created_by,created_at) VALUES(?,?,?,?,?) ON CONFLICT(item_id,client_update_id) DO NOTHING`, itemID, clientUpdateID, update, userID, time.Now().UTC())
	if err != nil {
		return 0, err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		err = s.db.QueryRowContext(ctx, `SELECT id FROM markdown_updates WHERE item_id=? AND client_update_id=?`, itemID, clientUpdateID).Scan(&rows)
		return rows, err
	}
	return result.LastInsertId()
}

func (s *Service) UpdateMarkdownCache(ctx context.Context, userID, itemID, markdown string, seenSeq int64) error {
	item, err := s.ItemAccess(ctx, userID, itemID, true)
	if err != nil {
		return err
	}
	if item.Type != "markdown" {
		return ErrInvalid
	}
	result, err := s.db.ExecContext(ctx, `UPDATE markdown_states SET markdown_cache=?,cache_seq=?,updated_at=? WHERE item_id=? AND cache_seq<=? AND ?<=MAX(snapshot_seq,(SELECT COALESCE(MAX(id),0) FROM markdown_updates WHERE item_id=?))`, markdown, seenSeq, time.Now().UTC(), itemID, seenSeq, seenSeq, itemID)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return ErrConflict
	}
	return nil
}

func (s *Service) CommitMarkdownSnapshot(ctx context.Context, userID, itemID string, baseSeq int64, snapshot []byte, markdown string) error {
	item, err := s.ItemAccess(ctx, userID, itemID, true)
	if err != nil {
		return err
	}
	if item.Type != "markdown" || baseSeq < 0 || len(snapshot) == 0 {
		return ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var head int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(id),0) FROM markdown_updates WHERE item_id=?`, itemID).Scan(&head); err != nil {
		return err
	}
	if baseSeq > head {
		return ErrConflict
	}
	result, err := tx.ExecContext(ctx, `UPDATE markdown_states SET snapshot=?,snapshot_seq=?,markdown_cache=?,cache_seq=?,updated_at=? WHERE item_id=? AND snapshot_seq<=?`, snapshot, baseSeq, markdown, baseSeq, time.Now().UTC(), itemID, baseSeq)
	if err != nil {
		return err
	}
	updated, _ := result.RowsAffected()
	if updated == 0 {
		return ErrConflict
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM markdown_updates WHERE item_id=? AND id<=?`, itemID, baseSeq); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) MarkdownUpdateStats(ctx context.Context, itemID string) (int, int64, error) {
	var count int
	var bytes int64
	err := s.db.QueryRowContext(ctx, `SELECT count(*),COALESCE(sum(length(update_blob)),0) FROM markdown_updates WHERE item_id=?`, itemID).Scan(&count, &bytes)
	return count, bytes, err
}

func (s *Service) Whiteboard(ctx context.Context, userID, itemID string) (WhiteboardState, error) {
	item, err := s.ItemAccess(ctx, userID, itemID, false)
	if err != nil {
		return WhiteboardState{}, err
	}
	if item.Type != "whiteboard" {
		return WhiteboardState{}, ErrInvalid
	}
	var state WhiteboardState
	err = s.db.QueryRowContext(ctx, `SELECT revision,scene_json FROM whiteboard_states WHERE item_id=?`, itemID).Scan(&state.Revision, &state.Scene)
	return state, err
}

func (s *Service) UpdateWhiteboard(ctx context.Context, userID, itemID string, baseRevision int64, scene string) (WhiteboardState, error) {
	item, err := s.ItemAccess(ctx, userID, itemID, true)
	if err != nil {
		return WhiteboardState{}, err
	}
	if item.Type != "whiteboard" {
		return WhiteboardState{}, ErrInvalid
	}
	result, err := s.db.ExecContext(ctx, `UPDATE whiteboard_states SET revision=revision+1,scene_json=?,updated_by=?,updated_at=? WHERE item_id=? AND revision=?`, scene, userID, time.Now().UTC(), itemID, baseRevision)
	if err != nil {
		return WhiteboardState{}, err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return WhiteboardState{}, ErrConflict
	}
	return s.Whiteboard(ctx, userID, itemID)
}
