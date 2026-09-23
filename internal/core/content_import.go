package core

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"time"
)

// ImportContent publishes one new tree, initial content, asset metadata and a
// replay receipt in one SQLite transaction. No existing Item is overwritten.
// It is an internal operation: asset payload durability is the caller's duty.
func (s *Service) ImportContent(ctx context.Context, userID, workspaceID string, plan ContentImport) (ImportResult, error) {
	order, err := validateImport(plan)
	if err != nil {
		return ImportResult{}, err
	}
	for _, asset := range plan.Assets {
		if asset.StorageKey == "" {
			continue
		}
		parts := strings.Split(filepath.ToSlash(asset.StorageKey), "/")
		if len(parts) != 4 || parts[0] != workspaceID || parts[1] != ".imports" || !validImportID(parts[2]) || parts[3] != asset.ID || filepath.Clean(asset.StorageKey) != asset.StorageKey {
			return ImportResult{}, ErrInvalid
		}
	}
	hasher := sha256.New()
	if err := json.NewEncoder(hasher).Encode(plan); err != nil {
		return ImportResult{}, err
	}
	digest := hex.EncodeToString(hasher.Sum(nil))
	result := ImportResult{RootID: order[0].ID, ItemCount: len(order), AttachmentCount: len(plan.Assets)}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ImportResult{}, err
	}
	defer tx.Rollback()
	if err := requireWorkspaceWrite(ctx, tx, userID, workspaceID); err != nil {
		return ImportResult{}, err
	}
	var disabled bool
	if err := tx.QueryRowContext(ctx, `SELECT disabled FROM users WHERE id=?`, userID).Scan(&disabled); err != nil {
		return ImportResult{}, err
	}
	if disabled {
		return ImportResult{}, ErrForbidden
	}
	var previousWorkspace, previousUser, previousDigest, previousRoot string
	err = tx.QueryRowContext(ctx, `SELECT workspace_id,created_by,request_sha256,root_item_id FROM content_imports WHERE id=?`, plan.ID).Scan(&previousWorkspace, &previousUser, &previousDigest, &previousRoot)
	if err == nil {
		if previousWorkspace != workspaceID || previousUser != userID || previousDigest != digest {
			return ImportResult{}, ErrConflict
		}
		result.RootID = previousRoot
		result.Replayed = true
		return result, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return ImportResult{}, err
	}
	if err := validateParent(ctx, tx, workspaceID, plan.ParentID); err != nil {
		return ImportResult{}, err
	}
	var duplicate int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM items WHERE workspace_id=? AND parent_id IS ? AND title=? AND deletion_batch_id IS NULL`, workspaceID, plan.ParentID, strings.TrimSpace(order[0].Title)).Scan(&duplicate); err != nil {
		return ImportResult{}, err
	}
	if duplicate != 0 {
		return ImportResult{}, ErrConflict
	}
	// Preflight every destination ID, including trashed content, before any insert.
	for _, item := range order {
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM items WHERE id=?`, item.ID).Scan(&duplicate); err != nil {
			return ImportResult{}, err
		}
		if duplicate != 0 {
			return ImportResult{}, ErrConflict
		}
	}
	for _, asset := range plan.Assets {
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM assets WHERE id=?`, asset.ID).Scan(&duplicate); err != nil {
			return ImportResult{}, err
		}
		if duplicate != 0 {
			return ImportResult{}, ErrConflict
		}
	}
	var rootSortKey int
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_key),-1)+1 FROM items WHERE workspace_id=? AND parent_id IS ? AND deletion_batch_id IS NULL`, workspaceID, plan.ParentID).Scan(&rootSortKey); err != nil {
		return ImportResult{}, err
	}
	now := time.Now().UTC()
	nextSortKey := make(map[string]int)
	for _, item := range order {
		parent := item.ParentID
		sortKey := rootSortKey
		if parent == nil {
			parent = plan.ParentID
		} else {
			sortKey = nextSortKey[*parent]
			nextSortKey[*parent]++
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO items(id,workspace_id,parent_id,type,title,sort_key,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`, item.ID, workspaceID, parent, item.Type, strings.TrimSpace(item.Title), sortKey, userID, now, now); err != nil {
			return ImportResult{}, err
		}
		if item.Markdown != nil {
			if _, err := tx.ExecContext(ctx, `INSERT INTO markdown_states(item_id,snapshot,markdown_cache,updated_at) VALUES(?,?,?,?)`, item.ID, item.Markdown.Snapshot, item.Markdown.Markdown, now); err != nil {
				return ImportResult{}, err
			}
		}
		if item.Whiteboard != nil {
			if _, err := tx.ExecContext(ctx, `INSERT INTO whiteboard_states(item_id,scene_json,updated_by,updated_at) VALUES(?,?,?,?)`, item.ID, *item.Whiteboard, userID, now); err != nil {
				return ImportResult{}, err
			}
		}
	}
	for _, asset := range plan.Assets {
		storageKey := asset.StorageKey
		if storageKey == "" {
			storageKey = filepath.Join(workspaceID, asset.ID)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,sha256,storage_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, asset.ID, workspaceID, asset.ItemID, asset.FileName, asset.MIME, asset.Size, asset.SHA256, storageKey, userID, now); err != nil {
			return ImportResult{}, err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO content_imports(id,workspace_id,created_by,request_sha256,root_item_id,created_at) VALUES(?,?,?,?,?,?)`, plan.ID, workspaceID, userID, digest, result.RootID, now); err != nil {
		return ImportResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return ImportResult{}, err
	}
	return result, nil
}
