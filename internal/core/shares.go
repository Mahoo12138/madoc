package core

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
)

func validShareHash(value string) bool {
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == 32
}

func shareOwnerInTx(ctx context.Context, tx *sql.Tx, userID, workspaceID string) error {
	var role string
	if err := tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, userID).Scan(&role); err != nil {
		return ErrForbidden
	}
	if role != "owner" {
		return ErrForbidden
	}
	return nil
}

func (s *Service) CreateItemShare(ctx context.Context, userID, itemID, versionID, tokenHash string, expiresAt *time.Time) (ItemShare, error) {
	if !validShareHash(tokenHash) || (expiresAt != nil && !expiresAt.After(time.Now().UTC())) {
		return ItemShare{}, ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ItemShare{}, err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return ItemShare{}, err
	}
	if err := shareOwnerInTx(ctx, tx, userID, item.WorkspaceID); err != nil {
		return ItemShare{}, err
	}
	if item.Type != "markdown" && item.Type != "whiteboard" {
		return ItemShare{}, ErrInvalid
	}
	var kind, contentType string
	if err := tx.QueryRowContext(ctx, `SELECT kind,content_type FROM item_versions WHERE id=? AND item_id=?`, versionID, itemID).Scan(&kind, &contentType); errors.Is(err, sql.ErrNoRows) {
		return ItemShare{}, ErrNotFound
	} else if err != nil {
		return ItemShare{}, err
	}
	if kind != "manual" || contentType != item.Type {
		return ItemShare{}, ErrInvalid
	}
	now := time.Now().UTC()
	share := ItemShare{ID: uuid.NewString(), ItemID: itemID, VersionID: versionID, ContentType: contentType, CreatedAt: now, UpdatedAt: now, ExpiresAt: expiresAt}
	var label string
	if err := tx.QueryRowContext(ctx, `SELECT label FROM item_versions WHERE id=?`, versionID).Scan(&label); err != nil {
		return ItemShare{}, err
	}
	share.VersionName = label
	if _, err := tx.ExecContext(ctx, `INSERT INTO item_shares(id,item_id,version_id,published_title,token_hash,created_by,created_at,updated_at,expires_at)
 VALUES(?,?,?,?,?,?,?,?,?)`, share.ID, itemID, versionID, item.Title, tokenHash, userID, now, now, expiresAt); err != nil {
		return ItemShare{}, err
	}
	if err := tx.Commit(); err != nil {
		return ItemShare{}, err
	}
	return share, nil
}

func (s *Service) ListItemShares(ctx context.Context, userID, itemID string) ([]ItemShare, error) {
	item, err := s.GetItem(ctx, itemID)
	if err != nil {
		return nil, err
	}
	role, err := s.Role(ctx, userID, item.WorkspaceID)
	if err != nil || role != "owner" {
		return nil, ErrForbidden
	}
	rows, err := s.db.QueryContext(ctx, `SELECT sh.id,sh.item_id,sh.version_id,v.content_type,v.label,sh.created_at,sh.updated_at,sh.expires_at,sh.revoked_at
 FROM item_shares sh JOIN item_versions v ON v.id=sh.version_id WHERE sh.item_id=? ORDER BY sh.created_at DESC,sh.id DESC`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]ItemShare, 0)
	for rows.Next() {
		var share ItemShare
		var label sql.NullString
		var expires, revoked sql.NullTime
		if err := rows.Scan(&share.ID, &share.ItemID, &share.VersionID, &share.ContentType, &label, &share.CreatedAt, &share.UpdatedAt, &expires, &revoked); err != nil {
			return nil, err
		}
		if label.Valid {
			share.VersionName = label.String
		}
		if expires.Valid {
			share.ExpiresAt = &expires.Time
		}
		if revoked.Valid {
			share.RevokedAt = &revoked.Time
		}
		result = append(result, share)
	}
	return result, rows.Err()
}

func (s *Service) PublishItemShare(ctx context.Context, userID, itemID, shareID, versionID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return err
	}
	if err := shareOwnerInTx(ctx, tx, userID, item.WorkspaceID); err != nil {
		return err
	}
	var kind, contentType string
	if err := tx.QueryRowContext(ctx, `SELECT kind,content_type FROM item_versions WHERE id=? AND item_id=?`, versionID, itemID).Scan(&kind, &contentType); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if kind != "manual" || contentType != item.Type {
		return ErrInvalid
	}
	now := time.Now().UTC()
	result, err := tx.ExecContext(ctx, `UPDATE item_shares SET version_id=?,published_title=?,updated_at=?
 WHERE id=? AND item_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)`, versionID, item.Title, now, shareID, itemID, now)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM item_shares WHERE id=? AND item_id=?`, shareID, itemID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return ErrNotFound
		}
		return ErrConflict
	}
	return tx.Commit()
}

func (s *Service) RevokeItemShare(ctx context.Context, userID, itemID, shareID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return err
	}
	if err := shareOwnerInTx(ctx, tx, userID, item.WorkspaceID); err != nil {
		return err
	}
	now := time.Now().UTC()
	result, err := tx.ExecContext(ctx, `UPDATE item_shares SET revoked_at=?,updated_at=? WHERE id=? AND item_id=? AND revoked_at IS NULL`, now, now, shareID, itemID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

func (s *Service) GetSharedItem(ctx context.Context, tokenHash string) (SharedItem, error) {
	if !validShareHash(tokenHash) {
		return SharedItem{}, ErrNotFound
	}
	now := time.Now().UTC()
	var result SharedItem
	var label sql.NullString
	var markdown sql.NullString
	var scene sql.NullString
	var revision sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT sh.published_title,v.content_type,v.label,sh.updated_at,v.markdown_text,v.whiteboard_scene,v.whiteboard_revision
 FROM item_shares sh JOIN items i ON i.id=sh.item_id JOIN item_versions v ON v.id=sh.version_id
 WHERE sh.token_hash=? AND sh.revoked_at IS NULL AND (sh.expires_at IS NULL OR sh.expires_at>?) AND i.deletion_batch_id IS NULL`, tokenHash, now).
		Scan(&result.Title, &result.ContentType, &label, &result.PublishedAt, &markdown, &scene, &revision)
	if errors.Is(err, sql.ErrNoRows) {
		return SharedItem{}, ErrNotFound
	}
	if err != nil {
		return SharedItem{}, err
	}
	if label.Valid {
		result.VersionName = label.String
	}
	if markdown.Valid {
		result.Markdown = &markdown.String
	}
	if scene.Valid && revision.Valid {
		result.Whiteboard = &WhiteboardState{Revision: revision.Int64, Scene: scene.String}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT a.id,a.file_name,a.mime FROM item_shares sh
 JOIN item_version_assets va ON va.version_id=sh.version_id JOIN assets a ON a.id=va.asset_id
 JOIN items i ON i.id=sh.item_id WHERE sh.token_hash=? AND sh.revoked_at IS NULL
 AND (sh.expires_at IS NULL OR sh.expires_at>?) AND i.deletion_batch_id IS NULL ORDER BY a.file_name,a.id`, tokenHash, now)
	if err != nil {
		return SharedItem{}, err
	}
	defer rows.Close()
	result.Assets = make([]SharedAsset, 0)
	for rows.Next() {
		var item SharedAsset
		if err := rows.Scan(&item.ID, &item.FileName, &item.MIME); err != nil {
			return SharedItem{}, err
		}
		result.Assets = append(result.Assets, item)
	}
	return result, rows.Err()
}
