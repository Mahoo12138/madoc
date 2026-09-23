package asset

import (
	"bufio"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"madoc/internal/core"
)

type Asset struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"`
	ItemID      *string   `json:"itemId"`
	FileName    string    `json:"fileName"`
	MIME        string    `json:"mime"`
	Size        int64     `json:"size"`
	StorageKey  string    `json:"-"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Service struct {
	db       *sql.DB
	core     *core.Service
	root     string
	maxBytes int64
}

func New(db *sql.DB, domain *core.Service, root string, maxMB int64) *Service {
	return &Service{db: db, core: domain, root: root, maxBytes: maxMB << 20}
}

func (s *Service) Save(ctx context.Context, userID, workspaceID string, itemID *string, header *multipart.FileHeader) (Asset, error) {
	role, err := s.core.Role(ctx, userID, workspaceID)
	if err != nil || (role != "owner" && role != "editor") {
		return Asset{}, core.ErrForbidden
	}
	if header.Size <= 0 || header.Size > s.maxBytes {
		return Asset{}, core.ErrInvalid
	}
	mime := strings.ToLower(strings.TrimSpace(strings.Split(header.Header.Get("Content-Type"), ";")[0]))
	allowed := map[string]bool{"image/png": true, "image/jpeg": true, "image/gif": true, "image/webp": true}
	if !allowed[mime] {
		return Asset{}, core.ErrInvalid
	}
	if itemID != nil {
		item, err := s.core.GetItem(ctx, *itemID)
		if err != nil || item.WorkspaceID != workspaceID {
			return Asset{}, core.ErrInvalid
		}
	}
	source, err := header.Open()
	if err != nil {
		return Asset{}, err
	}
	defer source.Close()
	buffered := bufio.NewReader(source)
	prefix, err := buffered.Peek(512)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, bufio.ErrBufferFull) {
		return Asset{}, err
	}
	detected := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(prefix), ";")[0]))
	if !allowed[detected] || detected != mime {
		return Asset{}, core.ErrInvalid
	}
	id := uuid.NewString()
	storageKey := filepath.Join(workspaceID, id)
	dir := filepath.Join(s.root, workspaceID)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return Asset{}, err
	}
	targetPath := filepath.Join(s.root, storageKey)
	target, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return Asset{}, err
	}
	hasher := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(target, hasher), io.LimitReader(buffered, s.maxBytes+1))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil || written > s.maxBytes {
		os.Remove(targetPath)
		if copyErr != nil {
			return Asset{}, copyErr
		}
		if closeErr != nil {
			return Asset{}, closeErr
		}
		return Asset{}, core.ErrInvalid
	}
	now := time.Now().UTC()
	asset := Asset{ID: id, WorkspaceID: workspaceID, ItemID: itemID, FileName: filepath.Base(header.Filename), MIME: mime, Size: written, StorageKey: storageKey, CreatedAt: now}
	result, err := s.db.ExecContext(ctx, `INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,sha256,storage_key,created_by,created_at)
 SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND role IN ('owner','editor'))
 AND (? IS NULL OR EXISTS(SELECT 1 FROM items WHERE id=? AND workspace_id=? AND deletion_batch_id IS NULL))`, asset.ID, workspaceID, itemID, asset.FileName, mime, written, hex.EncodeToString(hasher.Sum(nil)), storageKey, userID, now, workspaceID, userID, itemID, itemID, workspaceID)
	if err == nil {
		var rows int64
		rows, err = result.RowsAffected()
		if err == nil && rows == 0 {
			err = core.ErrConflict
		}
	}
	if err != nil {
		os.Remove(targetPath)
		return Asset{}, err
	}
	return asset, nil
}

func (s *Service) Open(ctx context.Context, userID, id string) (Asset, *os.File, error) {
	var asset Asset
	err := s.db.QueryRowContext(ctx, `SELECT id,workspace_id,item_id,file_name,mime,size,storage_key,created_at FROM assets WHERE id=?`, id).Scan(&asset.ID, &asset.WorkspaceID, &asset.ItemID, &asset.FileName, &asset.MIME, &asset.Size, &asset.StorageKey, &asset.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Asset{}, nil, core.ErrNotFound
	}
	if err != nil {
		return Asset{}, nil, err
	}
	if _, err := s.core.Role(ctx, userID, asset.WorkspaceID); err != nil {
		return Asset{}, nil, core.ErrForbidden
	}
	clean := filepath.Clean(asset.StorageKey)
	if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
		return Asset{}, nil, fmt.Errorf("invalid storage key")
	}
	file, err := os.Open(filepath.Join(s.root, clean))
	return asset, file, err
}

func (s *Service) Delete(ctx context.Context, userID, id string) error {
	asset, file, err := s.Open(ctx, userID, id)
	if file != nil {
		file.Close()
	}
	if err != nil {
		return err
	}
	role, err := s.core.Role(ctx, userID, asset.WorkspaceID)
	if err != nil || (role != "owner" && role != "editor") {
		return core.ErrForbidden
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var protected int
	if err := tx.QueryRowContext(ctx, `SELECT (EXISTS(SELECT 1 FROM item_version_assets WHERE asset_id=?)) + (EXISTS(SELECT 1 FROM item_asset_refs WHERE asset_id=?))`, id, id).Scan(&protected); err != nil {
		return err
	}
	if protected > 0 {
		return core.ErrAssetVersionProtected
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM assets WHERE id=? AND NOT EXISTS(SELECT 1 FROM item_version_assets WHERE asset_id=?) AND NOT EXISTS(SELECT 1 FROM item_asset_refs WHERE asset_id=?)`, id, id, id)
	if err != nil {
		return err
	}
	deleted, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if deleted == 0 {
		return core.ErrNotFound
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return os.Remove(filepath.Join(s.root, filepath.Clean(asset.StorageKey)))
}
