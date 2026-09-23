package core

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	DefaultVersionPageSize = 50
	MaxVersionPageSize     = 100
	MaxVersionLabelRunes   = 120
)

// CreateManualVersion stores the exact durable state visible in this SQLite
// transaction. A Markdown projection behind its update head is rejected so the
// saved version always has an immediately previewable text representation.
// Assets uploaded for the item are included automatically; assetIDs covers
// additional same-workspace resources referenced by the editor document.
func (s *Service) CreateManualVersion(ctx context.Context, userID, itemID, label string, assetIDs []string) (ContentVersion, error) {
	label = strings.TrimSpace(label)
	if label == "" || utf8.RuneCountInString(label) > MaxVersionLabelRunes || len(assetIDs) > 5000 {
		return ContentVersion{}, ErrInvalid
	}
	assets := make(map[string]struct{}, len(assetIDs))
	for _, id := range assetIDs {
		if !validImportID(id) {
			return ContentVersion{}, ErrInvalid
		}
		assets[id] = struct{}{}
	}
	orderedAssets := make([]string, 0, len(assets))
	for id := range assets {
		orderedAssets = append(orderedAssets, id)
	}
	sort.Strings(orderedAssets)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ContentVersion{}, err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return ContentVersion{}, err
	}
	if item.Type != "markdown" && item.Type != "whiteboard" {
		return ContentVersion{}, ErrInvalid
	}
	version := ContentVersion{
		ID: uuid.NewString(), ItemID: item.ID, WorkspaceID: item.WorkspaceID,
		ContentType: item.Type, Kind: "manual", Label: &label, CreatedBy: &userID,
		CreatedAt: time.Now().UTC(),
	}
	var markdown *MarkdownState
	var whiteboard *WhiteboardState
	if item.Type == "markdown" {
		state, err := readMarkdownState(ctx, tx, itemID)
		if err != nil {
			return ContentVersion{}, err
		}
		if state.CacheSeq != state.HeadSeq {
			return ContentVersion{}, ErrMarkdownExportPending
		}
		markdown = &state
		version.Generation = int64Ptr(state.Generation)
		version.SnapshotSeq = int64Ptr(state.SnapshotSeq)
		version.HeadSeq = int64Ptr(state.HeadSeq)
		version.PayloadBytes = int64(len(state.Snapshot)) + int64(len(state.Markdown))
		for _, update := range state.Updates {
			version.PayloadBytes += int64(len(update.Update))
		}
	} else {
		var state WhiteboardState
		if err := tx.QueryRowContext(ctx, `SELECT revision,scene_json FROM whiteboard_states WHERE item_id=?`, itemID).Scan(&state.Revision, &state.Scene); err != nil {
			return ContentVersion{}, err
		}
		whiteboard = &state
		version.WhiteboardRevision = int64Ptr(state.Revision)
		version.PayloadBytes = int64(len(state.Scene))
	}

	rows, err := tx.QueryContext(ctx, `SELECT id FROM assets WHERE workspace_id=? AND item_id=?`, item.WorkspaceID, itemID)
	if err != nil {
		return ContentVersion{}, err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return ContentVersion{}, err
		}
		assets[id] = struct{}{}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return ContentVersion{}, err
	}
	orderedAssets = orderedAssets[:0]
	for id := range assets {
		orderedAssets = append(orderedAssets, id)
	}
	sort.Strings(orderedAssets)
	for _, id := range orderedAssets {
		var workspaceID string
		if err := tx.QueryRowContext(ctx, `SELECT workspace_id FROM assets WHERE id=?`, id).Scan(&workspaceID); errors.Is(err, sql.ErrNoRows) {
			return ContentVersion{}, ErrInvalid
		} else if err != nil {
			return ContentVersion{}, err
		} else if workspaceID != item.WorkspaceID {
			return ContentVersion{}, ErrInvalid
		}
	}

	if _, err := tx.ExecContext(ctx, `INSERT INTO item_versions(id,item_id,workspace_id,content_type,kind,label,created_by,generation,snapshot_seq,head_seq,markdown_snapshot,markdown_text,whiteboard_revision,whiteboard_scene,payload_bytes,created_at)
 VALUES(?,?,?,?,'manual',?,?,?,?,?,?,?,?,?,?,?)`, version.ID, item.ID, item.WorkspaceID, item.Type,
		version.Label, userID, nullableInt(version.Generation), nullableInt(version.SnapshotSeq), nullableInt(version.HeadSeq),
		markdownSnapshot(markdown), markdownText(markdown), nullableInt(version.WhiteboardRevision), whiteboardScene(whiteboard), version.PayloadBytes, version.CreatedAt); err != nil {
		return ContentVersion{}, err
	}
	if markdown != nil {
		for _, update := range markdown.Updates {
			if _, err := tx.ExecContext(ctx, `INSERT INTO item_version_updates(version_id,seq,update_blob) VALUES(?,?,?)`, version.ID, update.Seq, update.Update); err != nil {
				return ContentVersion{}, err
			}
		}
	}
	for _, id := range orderedAssets {
		if _, err := tx.ExecContext(ctx, `INSERT INTO item_version_assets(version_id,asset_id) VALUES(?,?)`, version.ID, id); err != nil {
			return ContentVersion{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return ContentVersion{}, err
	}
	return version, nil
}

func (s *Service) ListContentVersions(ctx context.Context, userID, itemID, before string, limit int) ([]ContentVersion, error) {
	if limit == 0 {
		limit = DefaultVersionPageSize
	}
	if limit < 1 || limit > MaxVersionPageSize || (before != "" && !validImportID(before)) {
		return nil, ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := itemAccess(ctx, tx, userID, itemID, false); err != nil {
		return nil, err
	}
	query := `SELECT id,item_id,workspace_id,content_type,kind,label,created_by,generation,snapshot_seq,head_seq,whiteboard_revision,payload_bytes,created_at
 FROM item_versions WHERE item_id=?`
	args := []any{itemID}
	if before != "" {
		query += ` AND (created_at,id)<(SELECT created_at,id FROM item_versions WHERE id=? AND item_id=?)`
		args = append(args, before, itemID)
	}
	query += ` ORDER BY created_at DESC,id DESC LIMIT ?`
	args = append(args, limit)
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	versions := make([]ContentVersion, 0, limit)
	for rows.Next() {
		var version ContentVersion
		if err := rows.Scan(&version.ID, &version.ItemID, &version.WorkspaceID, &version.ContentType, &version.Kind, &version.Label, &version.CreatedBy, &version.Generation, &version.SnapshotSeq, &version.HeadSeq, &version.WhiteboardRevision, &version.PayloadBytes, &version.CreatedAt); err != nil {
			return nil, err
		}
		versions = append(versions, version)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return versions, nil
}

func (s *Service) GetContentVersion(ctx context.Context, userID, itemID, versionID string) (ContentVersionDetail, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ContentVersionDetail{}, err
	}
	defer tx.Rollback()
	if _, err := itemAccess(ctx, tx, userID, itemID, false); err != nil {
		return ContentVersionDetail{}, err
	}
	var detail ContentVersionDetail
	var snapshot []byte
	var markdownText sql.NullString
	var whiteboardScene sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT id,item_id,workspace_id,content_type,kind,label,created_by,generation,snapshot_seq,head_seq,whiteboard_revision,payload_bytes,created_at,markdown_snapshot,markdown_text,whiteboard_scene
 FROM item_versions WHERE id=? AND item_id=?`, versionID, itemID).Scan(
		&detail.Version.ID, &detail.Version.ItemID, &detail.Version.WorkspaceID, &detail.Version.ContentType, &detail.Version.Kind,
		&detail.Version.Label, &detail.Version.CreatedBy, &detail.Version.Generation, &detail.Version.SnapshotSeq,
		&detail.Version.HeadSeq, &detail.Version.WhiteboardRevision, &detail.Version.PayloadBytes, &detail.Version.CreatedAt,
		&snapshot, &markdownText, &whiteboardScene)
	if errors.Is(err, sql.ErrNoRows) {
		return ContentVersionDetail{}, ErrNotFound
	}
	if err != nil {
		return ContentVersionDetail{}, err
	}
	if detail.Version.ContentType == "markdown" {
		state := MarkdownState{Generation: *detail.Version.Generation, Snapshot: snapshot, SnapshotSeq: *detail.Version.SnapshotSeq, HeadSeq: *detail.Version.HeadSeq, CacheSeq: *detail.Version.HeadSeq}
		// The binary snapshot and ordered tail updates are loaded below. CacheSeq
		// is the version head by construction and Markdown is its captured text.
		state.Markdown = markdownText.String
		rows, err := tx.QueryContext(ctx, `SELECT seq,update_blob FROM item_version_updates WHERE version_id=? ORDER BY seq`, versionID)
		if err != nil {
			return ContentVersionDetail{}, err
		}
		for rows.Next() {
			var update MarkdownUpdate
			if err := rows.Scan(&update.Seq, &update.Update); err != nil {
				rows.Close()
				return ContentVersionDetail{}, err
			}
			state.Updates = append(state.Updates, update)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return ContentVersionDetail{}, err
		}
		rows.Close()
		detail.Markdown = &state
	} else {
		detail.Whiteboard = &WhiteboardState{Revision: *detail.Version.WhiteboardRevision, Scene: whiteboardScene.String}
	}
	rows, err := tx.QueryContext(ctx, `SELECT asset_id FROM item_version_assets WHERE version_id=? ORDER BY asset_id`, versionID)
	if err != nil {
		return ContentVersionDetail{}, err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return ContentVersionDetail{}, err
		}
		detail.AssetIDs = append(detail.AssetIDs, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return ContentVersionDetail{}, err
	}
	rows.Close()
	if err := tx.Commit(); err != nil {
		return ContentVersionDetail{}, err
	}
	return detail, nil
}

func int64Ptr(value int64) *int64 { return &value }
func nullableInt(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}
func markdownSnapshot(state *MarkdownState) any {
	if state == nil {
		return nil
	}
	if state.Snapshot == nil {
		return []byte{}
	}
	return state.Snapshot
}
func markdownText(state *MarkdownState) any {
	if state == nil {
		return nil
	}
	return state.Markdown
}
func whiteboardScene(state *WhiteboardState) any {
	if state == nil {
		return nil
	}
	return state.Scene
}
