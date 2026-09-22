package core

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

func (s *Service) Markdown(ctx context.Context, userID, itemID string) (MarkdownState, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MarkdownState{}, err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, false)
	if err != nil {
		return MarkdownState{}, err
	}
	if item.Type != "markdown" {
		return MarkdownState{}, ErrInvalid
	}
	var state MarkdownState
	err = tx.QueryRowContext(ctx, `SELECT snapshot,snapshot_seq,markdown_cache,cache_seq,generation FROM markdown_states WHERE item_id=?`, itemID).Scan(&state.Snapshot, &state.SnapshotSeq, &state.Markdown, &state.CacheSeq, &state.Generation)
	if err != nil {
		return MarkdownState{}, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,update_blob,COALESCE(created_by,'') FROM markdown_updates WHERE item_id=? AND id>? ORDER BY id`, itemID, state.SnapshotSeq)
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
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return err
	}
	if item.Type != "markdown" {
		return ErrInvalid
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM markdown_updates WHERE item_id=?`, itemID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM markdown_update_receipts WHERE item_id=?`, itemID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE markdown_states SET generation=generation+1,snapshot=?,snapshot_seq=0,markdown_cache=?,cache_seq=0,updated_at=? WHERE item_id=?`, snapshot, markdown, time.Now().UTC(), itemID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) AppendMarkdownUpdate(ctx context.Context, userID, itemID, clientUpdateID string, update []byte, generation int64) (int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return 0, err
	}
	if item.Type != "markdown" || clientUpdateID == "" || len(update) == 0 {
		return 0, ErrInvalid
	}
	if err := checkMarkdownGeneration(ctx, tx, itemID, generation); err != nil {
		return 0, err
	}
	var seq int64
	err = tx.QueryRowContext(ctx, `SELECT seq FROM markdown_update_receipts WHERE item_id=? AND client_update_id=?`, itemID, clientUpdateID).Scan(&seq)
	if err == nil {
		return seq, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO markdown_updates(item_id,client_update_id,update_blob,created_by,created_at) VALUES(?,?,?,?,?)`, itemID, clientUpdateID, update, userID, time.Now().UTC())
	if err != nil {
		return 0, err
	}
	seq, err = result.LastInsertId()
	if err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO markdown_update_receipts(item_id,client_update_id,seq) VALUES(?,?,?)`, itemID, clientUpdateID, seq); err != nil {
		return 0, err
	}
	return seq, tx.Commit()
}

func (s *Service) UpdateMarkdownCache(ctx context.Context, userID, itemID, markdown string, seenSeq int64, generation int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return err
	}
	if item.Type != "markdown" {
		return ErrInvalid
	}
	if err := checkMarkdownGeneration(ctx, tx, itemID, generation); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE markdown_states SET markdown_cache=?,cache_seq=?,updated_at=? WHERE item_id=? AND cache_seq<=? AND ?<=MAX(snapshot_seq,(SELECT COALESCE(MAX(id),0) FROM markdown_updates WHERE item_id=?))`, markdown, seenSeq, time.Now().UTC(), itemID, seenSeq, seenSeq, itemID)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return ErrConflict
	}
	return tx.Commit()
}

func (s *Service) CommitMarkdownSnapshot(ctx context.Context, userID, itemID string, baseSeq int64, snapshot []byte, markdown string, generation int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return err
	}
	if item.Type != "markdown" || baseSeq < 0 || len(snapshot) == 0 {
		return ErrInvalid
	}
	if err := checkMarkdownGeneration(ctx, tx, itemID, generation); err != nil {
		return err
	}
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
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return WhiteboardState{}, err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, false)
	if err != nil {
		return WhiteboardState{}, err
	}
	if item.Type != "whiteboard" {
		return WhiteboardState{}, ErrInvalid
	}
	var state WhiteboardState
	err = tx.QueryRowContext(ctx, `SELECT revision,scene_json FROM whiteboard_states WHERE item_id=?`, itemID).Scan(&state.Revision, &state.Scene)
	return state, err
}

func (s *Service) UpdateWhiteboard(ctx context.Context, userID, itemID string, baseRevision int64, scene string) (WhiteboardState, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return WhiteboardState{}, err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return WhiteboardState{}, err
	}
	if item.Type != "whiteboard" {
		return WhiteboardState{}, ErrInvalid
	}
	result, err := tx.ExecContext(ctx, `UPDATE whiteboard_states SET revision=revision+1,scene_json=?,updated_by=?,updated_at=? WHERE item_id=? AND revision=?`, scene, userID, time.Now().UTC(), itemID, baseRevision)
	if err != nil {
		return WhiteboardState{}, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return WhiteboardState{}, err
	}
	if rows == 0 {
		return WhiteboardState{}, ErrConflict
	}
	return WhiteboardState{Revision: baseRevision + 1, Scene: scene}, tx.Commit()
}

func checkMarkdownGeneration(ctx context.Context, tx *sql.Tx, itemID string, expected int64) error {
	var generation int64
	if err := tx.QueryRowContext(ctx, `SELECT generation FROM markdown_states WHERE item_id=?`, itemID).Scan(&generation); err != nil {
		return err
	}
	if generation != expected {
		return ErrGeneration
	}
	return nil
}
