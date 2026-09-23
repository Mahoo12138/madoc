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
	DefaultVersionPageSize            = 50
	MaxVersionPageSize                = 100
	MaxVersionLabelRunes              = 120
	AutomaticVersionMergeWindow       = 15 * time.Minute
	AutomaticVersionRetention         = 90 * 24 * time.Hour
	MaxAutomaticVersionsPerItem       = 30
	MaxWorkspaceVersionBytes    int64 = 1 << 30
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
	contentAssets := make(map[string]struct{}, len(assetIDs))
	for _, id := range assetIDs {
		if !validImportID(id) {
			return ContentVersion{}, ErrInvalid
		}
		contentAssets[id] = struct{}{}
	}
	assets := make(map[string]struct{}, len(assetIDs))
	for id := range contentAssets {
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
	rows, err = tx.QueryContext(ctx, `SELECT asset_id FROM item_asset_refs WHERE item_id=?`, itemID)
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
	contentAssetIDs := make([]string, 0, len(contentAssets))
	for id := range contentAssets {
		contentAssetIDs = append(contentAssetIDs, id)
	}
	sort.Strings(contentAssetIDs)
	for _, id := range contentAssetIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO item_version_content_assets(version_id,asset_id) VALUES(?,?)`, version.ID, id); err != nil {
			return ContentVersion{}, err
		}
	}
	if err := recordActivityTx(ctx, tx, item.WorkspaceID, &item.ID, item.Title, userID, "version_created", "创建了手动历史版本", version.CreatedAt); err != nil {
		return ContentVersion{}, err
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
	item, err := itemAccess(ctx, tx, userID, itemID, false)
	if err != nil {
		return nil, err
	}
	if err := pruneAutomaticVersionsTx(ctx, tx, item.WorkspaceID, time.Now().UTC()); err != nil {
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

func (s *Service) ContentVersionUsage(ctx context.Context, userID, workspaceID string) (ContentVersionUsage, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ContentVersionUsage{}, err
	}
	defer tx.Rollback()
	var role string
	err = tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return ContentVersionUsage{}, ErrForbidden
	}
	if err != nil {
		return ContentVersionUsage{}, err
	}
	usage := ContentVersionUsage{WorkspaceID: workspaceID, LimitBytes: MaxWorkspaceVersionBytes}
	var payloadBytes, assetBytes int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(payload_bytes),0),COUNT(*) FILTER(WHERE kind='manual'),COUNT(*) FILTER(WHERE kind='automatic')
 FROM item_versions WHERE workspace_id=?`, workspaceID).Scan(&payloadBytes, &usage.ManualVersions, &usage.AutomaticVersions); err != nil {
		return ContentVersionUsage{}, err
	}
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(a.size),0) FROM assets a WHERE a.workspace_id=? AND EXISTS (
 SELECT 1 FROM item_version_assets iva JOIN item_versions v ON v.id=iva.version_id WHERE iva.asset_id=a.id AND v.workspace_id=?)`, workspaceID, workspaceID).Scan(&assetBytes); err != nil {
		return ContentVersionUsage{}, err
	}
	usage.UsedBytes = payloadBytes + assetBytes
	usage.AutomaticPaused = usage.UsedBytes >= usage.LimitBytes
	if err := tx.Commit(); err != nil {
		return ContentVersionUsage{}, err
	}
	return usage, nil
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
	detail := ContentVersionDetail{AssetIDs: []string{}}
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

// RestoreContentVersionAsCopy reconstructs a selected immutable checkpoint as
// a new sibling Item. It never changes the source Item or its live room.
func (s *Service) RestoreContentVersionAsCopy(ctx context.Context, userID, itemID, versionID, title string) (Item, error) {
	title = strings.TrimSpace(title)
	if title == "" || utf8.RuneCountInString(title) > 200 {
		return Item{}, ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Item{}, err
	}
	defer tx.Rollback()
	source, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return Item{}, err
	}
	if source.Type != "markdown" && source.Type != "whiteboard" {
		return Item{}, ErrInvalid
	}
	if err := validateParent(ctx, tx, source.WorkspaceID, source.ParentID); err != nil {
		return Item{}, err
	}
	var version ContentVersion
	var snapshot []byte
	var markdown sql.NullString
	var scene sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT id,item_id,workspace_id,content_type,kind,label,created_by,generation,snapshot_seq,head_seq,whiteboard_revision,payload_bytes,created_at,markdown_snapshot,markdown_text,whiteboard_scene
 FROM item_versions WHERE id=? AND item_id=?`, versionID, itemID).Scan(&version.ID, &version.ItemID, &version.WorkspaceID, &version.ContentType, &version.Kind, &version.Label, &version.CreatedBy, &version.Generation, &version.SnapshotSeq, &version.HeadSeq, &version.WhiteboardRevision, &version.PayloadBytes, &version.CreatedAt, &snapshot, &markdown, &scene)
	if errors.Is(err, sql.ErrNoRows) {
		return Item{}, ErrNotFound
	}
	if err != nil {
		return Item{}, err
	}
	if version.WorkspaceID != source.WorkspaceID || version.ContentType != source.Type {
		return Item{}, ErrConflict
	}
	assets, err := tx.QueryContext(ctx, `SELECT a.id,a.workspace_id FROM item_version_assets iva JOIN assets a ON a.id=iva.asset_id WHERE iva.version_id=? ORDER BY a.id`, versionID)
	if err != nil {
		return Item{}, err
	}
	var assetIDs []string
	for assets.Next() {
		var assetID, workspaceID string
		if err := assets.Scan(&assetID, &workspaceID); err != nil {
			assets.Close()
			return Item{}, err
		}
		if workspaceID != source.WorkspaceID {
			assets.Close()
			return Item{}, ErrConflict
		}
		assetIDs = append(assetIDs, assetID)
	}
	err = assets.Err()
	assets.Close()
	if err != nil {
		return Item{}, err
	}
	now := time.Now().UTC()
	var sortKey int
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_key),-1)+1 FROM items WHERE workspace_id=? AND parent_id IS ? AND deletion_batch_id IS NULL`, source.WorkspaceID, source.ParentID).Scan(&sortKey); err != nil {
		return Item{}, err
	}
	copy := Item{ID: uuid.NewString(), WorkspaceID: source.WorkspaceID, ParentID: source.ParentID, Type: source.Type, Title: title, SortKey: sortKey, CreatedBy: userID, CreatedAt: now, UpdatedAt: now}
	if _, err := tx.ExecContext(ctx, `INSERT INTO items(id,workspace_id,parent_id,type,title,sort_key,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`, copy.ID, copy.WorkspaceID, copy.ParentID, copy.Type, copy.Title, copy.SortKey, userID, now, now); err != nil {
		return Item{}, err
	}
	if copy.Type == "markdown" {
		if _, err := tx.ExecContext(ctx, `INSERT INTO markdown_states(item_id,snapshot,snapshot_seq,markdown_cache,cache_seq,generation,updated_at) VALUES(?,?,0,?,0,0,?)`, copy.ID, snapshot, markdown.String, now); err != nil {
			return Item{}, err
		}
		rows, err := tx.QueryContext(ctx, `SELECT seq,update_blob FROM item_version_updates WHERE version_id=? ORDER BY seq`, versionID)
		if err != nil {
			return Item{}, err
		}
		var head int64
		for rows.Next() {
			var oldSeq int64
			var update []byte
			if err := rows.Scan(&oldSeq, &update); err != nil {
				rows.Close()
				return Item{}, err
			}
			clientUpdateID := uuid.NewString()
			result, err := tx.ExecContext(ctx, `INSERT INTO markdown_updates(item_id,client_update_id,update_blob,created_by,created_at) VALUES(?,?,?,?,?)`, copy.ID, clientUpdateID, update, userID, now)
			if err != nil {
				rows.Close()
				return Item{}, err
			}
			head, err = result.LastInsertId()
			if err != nil {
				rows.Close()
				return Item{}, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO markdown_update_receipts(item_id,client_update_id,seq) VALUES(?,?,?)`, copy.ID, clientUpdateID, head); err != nil {
				rows.Close()
				return Item{}, err
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return Item{}, err
		}
		rows.Close()
		if _, err := tx.ExecContext(ctx, `UPDATE markdown_states SET cache_seq=? WHERE item_id=?`, head, copy.ID); err != nil {
			return Item{}, err
		}
	} else {
		if _, err := tx.ExecContext(ctx, `INSERT INTO whiteboard_states(item_id,revision,scene_json,updated_by,updated_at) VALUES(?,0,?,?,?)`, copy.ID, scene.String, userID, now); err != nil {
			return Item{}, err
		}
	}
	for _, assetID := range assetIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO item_asset_refs(item_id,asset_id) VALUES(?,?)`, copy.ID, assetID); err != nil {
			return Item{}, err
		}
	}
	if err := captureAutomaticVersionTx(ctx, tx, userID, copy.ID, copy.WorkspaceID, copy.Type, assetIDs); err != nil {
		return Item{}, err
	}
	if err := tx.Commit(); err != nil {
		return Item{}, err
	}
	return copy, nil
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

// captureAutomaticVersionTx stores or coalesces the latest automatic checkpoint
// in the same transaction as a durable content projection. The current rolling
// checkpoint is replaced for 15 minutes, then becomes a stable timeline entry.
// Hitting the Workspace history budget skips only this automatic checkpoint.
func captureAutomaticVersionTx(ctx context.Context, tx *sql.Tx, userID, itemID, workspaceID, contentType string, additionalAssetIDs ...[]string) error {
	now := time.Now().UTC()
	if err := pruneAutomaticVersionsTx(ctx, tx, workspaceID, now); err != nil {
		return err
	}

	version := ContentVersion{
		ID: uuid.NewString(), ItemID: itemID, WorkspaceID: workspaceID,
		ContentType: contentType, Kind: "automatic", CreatedAt: now,
	}
	var markdown *MarkdownState
	var whiteboard *WhiteboardState
	if contentType == "markdown" {
		state, err := readMarkdownState(ctx, tx, itemID)
		if err != nil {
			return err
		}
		if state.CacheSeq != state.HeadSeq {
			return nil
		}
		var previousSeq sql.NullInt64
		var previousGeneration sql.NullInt64
		err = tx.QueryRowContext(ctx, `SELECT head_seq,generation FROM item_versions WHERE item_id=? AND kind='automatic' ORDER BY created_at DESC,id DESC LIMIT 1`, itemID).Scan(&previousSeq, &previousGeneration)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil && previousSeq.Valid && previousGeneration.Valid && previousSeq.Int64 == state.HeadSeq && previousGeneration.Int64 == state.Generation {
			return nil
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
			return err
		}
		var previousRevision sql.NullInt64
		err := tx.QueryRowContext(ctx, `SELECT whiteboard_revision FROM item_versions WHERE item_id=? AND kind='automatic' ORDER BY created_at DESC,id DESC LIMIT 1`, itemID).Scan(&previousRevision)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil && previousRevision.Valid && previousRevision.Int64 == state.Revision {
			return nil
		}
		whiteboard = &state
		version.WhiteboardRevision = int64Ptr(state.Revision)
		version.PayloadBytes = int64(len(state.Scene))
	}

	rows, err := tx.QueryContext(ctx, `SELECT id FROM assets WHERE workspace_id=? AND item_id=?`, workspaceID, itemID)
	if err != nil {
		return err
	}
	var assetIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		assetIDs = append(assetIDs, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if len(additionalAssetIDs) > 0 {
		assetIDs = append(assetIDs, additionalAssetIDs[0]...)
	}
	assetSet := make(map[string]struct{}, len(assetIDs))
	for _, id := range assetIDs {
		assetSet[id] = struct{}{}
	}
	assetIDs = assetIDs[:0]
	for id := range assetSet {
		var assetWorkspace string
		if err := tx.QueryRowContext(ctx, `SELECT workspace_id FROM assets WHERE id=?`, id).Scan(&assetWorkspace); err != nil {
			return err
		} else if assetWorkspace != workspaceID {
			return ErrConflict
		}
		assetIDs = append(assetIDs, id)
	}
	sort.Strings(assetIDs)

	// Preserve the previous automatic checkpoint if replacing it would exceed
	// the Workspace history budget.
	if _, err := tx.ExecContext(ctx, `SAVEPOINT automatic_version_budget`); err != nil {
		return err
	}
	var previousID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM item_versions WHERE item_id=? AND kind='automatic' AND created_at>=? ORDER BY created_at DESC,id DESC LIMIT 1`, itemID, now.Add(-AutomaticVersionMergeWindow)).Scan(&previousID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM item_versions WHERE id=?`, previousID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM item_versions WHERE kind='automatic' AND item_id=? AND id IN (
 SELECT id FROM (SELECT id,row_number() OVER(ORDER BY created_at DESC,id DESC) AS position
 FROM item_versions WHERE item_id=? AND kind='automatic') WHERE position>?
 )`, itemID, itemID, MaxAutomaticVersionsPerItem-1); err != nil {
		return err
	}
	var payloadBytes, assetBytes int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(payload_bytes),0) FROM item_versions WHERE workspace_id=?`, workspaceID).Scan(&payloadBytes); err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(a.size),0) FROM assets a WHERE a.workspace_id=? AND EXISTS (
 SELECT 1 FROM item_version_assets iva JOIN item_versions v ON v.id=iva.version_id WHERE iva.asset_id=a.id AND v.workspace_id=?)`, workspaceID, workspaceID).Scan(&assetBytes); err != nil {
		return err
	}
	var pendingAssetBytes int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(a.size),0) FROM assets a WHERE a.workspace_id=? AND a.item_id=? AND NOT EXISTS (
 SELECT 1 FROM item_version_assets iva JOIN item_versions v ON v.id=iva.version_id WHERE iva.asset_id=a.id AND v.workspace_id=?)`, workspaceID, itemID, workspaceID).Scan(&pendingAssetBytes); err != nil {
		return err
	}
	if payloadBytes+assetBytes+pendingAssetBytes+version.PayloadBytes >= MaxWorkspaceVersionBytes {
		if _, err := tx.ExecContext(ctx, `ROLLBACK TO automatic_version_budget`); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `RELEASE automatic_version_budget`)
		return err
	}
	if _, err := tx.ExecContext(ctx, `RELEASE automatic_version_budget`); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `INSERT INTO item_versions(id,item_id,workspace_id,content_type,kind,label,created_by,generation,snapshot_seq,head_seq,markdown_snapshot,markdown_text,whiteboard_revision,whiteboard_scene,payload_bytes,created_at)
 VALUES(?,?,?,?,'automatic',NULL,?,?,?,?,?,?,?,?,?,?)`, version.ID, itemID, workspaceID, contentType, userID,
		nullableInt(version.Generation), nullableInt(version.SnapshotSeq), nullableInt(version.HeadSeq), markdownSnapshot(markdown), markdownText(markdown),
		nullableInt(version.WhiteboardRevision), whiteboardScene(whiteboard), version.PayloadBytes, version.CreatedAt); err != nil {
		return err
	}
	if markdown != nil {
		for _, update := range markdown.Updates {
			if _, err := tx.ExecContext(ctx, `INSERT INTO item_version_updates(version_id,seq,update_blob) VALUES(?,?,?)`, version.ID, update.Seq, update.Update); err != nil {
				return err
			}
		}
	}
	for _, assetID := range assetIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO item_version_assets(version_id,asset_id) VALUES(?,?)`, version.ID, assetID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM item_versions WHERE kind='automatic' AND item_id=? AND id IN (
 SELECT id FROM (SELECT id,row_number() OVER(ORDER BY created_at DESC,id DESC) AS position
 FROM item_versions WHERE item_id=? AND kind='automatic') WHERE position>?
	)`, itemID, itemID, MaxAutomaticVersionsPerItem); err != nil {
		return err
	}
	var itemTitle string
	if err := tx.QueryRowContext(ctx, `SELECT title FROM items WHERE id=?`, itemID).Scan(&itemTitle); err != nil {
		return err
	}
	return recordCoalescedActivityTx(ctx, tx, workspaceID, &itemID, itemTitle, userID, "content_checkpoint", "保存了内容检查点", now, AutomaticVersionMergeWindow)
}

func pruneAutomaticVersionsTx(ctx context.Context, tx *sql.Tx, workspaceID string, now time.Time) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM item_versions WHERE workspace_id=? AND kind='automatic' AND created_at<?`, workspaceID, now.Add(-AutomaticVersionRetention)); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `DELETE FROM item_versions WHERE workspace_id=? AND kind='automatic' AND id IN (
 SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY item_id ORDER BY created_at DESC,id DESC) AS position
 FROM item_versions WHERE workspace_id=? AND kind='automatic') WHERE position>?
 )`, workspaceID, workspaceID, MaxAutomaticVersionsPerItem)
	return err
}
