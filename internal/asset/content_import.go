package asset

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
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

// ImportContent consumes only attachment parts, after the API has read the plan.
// Each attempt owns a distinct directory. Database references publish its files;
// an error or replay can never delete files belonging to another attempt.
func (s *Service) ImportContent(ctx context.Context, userID, workspaceID string, plan core.ContentImport, reader *multipart.Reader) (result core.ImportResult, err error) {
	if err = core.ValidateContentImport(plan); err != nil {
		return result, err
	}
	if !importUUID(workspaceID) {
		return result, core.ErrInvalid
	}
	var allowed bool
	if err = s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.user_id=? AND m.role IN ('owner','editor') AND u.disabled=0)`, workspaceID, userID).Scan(&allowed); err != nil {
		return result, err
	}
	if !allowed {
		return result, core.ErrForbidden
	}
	for _, asset := range plan.Assets {
		if asset.Size > s.maxBytes {
			return result, core.ErrInvalid
		}
	}
	plan.Assets = append([]core.ImportAsset(nil), plan.Assets...)
	expected := make(map[string]int, len(plan.Assets))
	journal := importJournal{Version: 1, WorkspaceID: workspaceID, AttemptID: uuid.NewString()}
	key := filepath.Join(workspaceID, ".imports", journal.AttemptID)
	directory := filepath.Join(s.root, key)
	if len(plan.Assets) > 0 {
		if err = os.MkdirAll(filepath.Dir(directory), 0o750); err != nil {
			return result, err
		}
		if err = os.Mkdir(directory, 0o750); err != nil {
			return result, err
		}
		defer func() {
			if err == nil && !result.Replayed {
				return
			}
			cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			err = errors.Join(err, s.cleanupImportDirectory(cleanupCtx, key))
		}()
	}
	for index, asset := range plan.Assets {
		expected[asset.ID] = index
		journal.Assets = append(journal.Assets, asset.ID)
		plan.Assets[index].StorageKey = filepath.Join(key, asset.ID)
	}
	if len(plan.Assets) > 0 {
		data, marshalErr := json.Marshal(journal)
		if marshalErr != nil {
			return result, marshalErr
		}
		if err = writeSyncedFile(filepath.Join(directory, "journal.json"), data); err != nil {
			return result, err
		}
		if err = syncImportDirectory(directory); err != nil {
			return result, err
		}
	}
	received := make(map[string]bool, len(plan.Assets))
	for {
		if err = ctx.Err(); err != nil {
			return result, err
		}
		var part *multipart.Part
		part, err = reader.NextPart()
		if errors.Is(err, io.EOF) {
			err = nil
			break
		}
		if err != nil {
			return result, errors.Join(core.ErrInvalid, err)
		}
		index, exists := expected[part.FormName()]
		if !exists || received[part.FormName()] || part.FileName() == "" {
			return result, core.ErrInvalid
		}
		asset := plan.Assets[index]
		if err = s.stageImportAsset(ctx, filepath.Join(directory, asset.ID), asset, part); err != nil {
			return result, err
		}
		if err = part.Close(); err != nil {
			return result, err
		}
		received[asset.ID] = true
	}
	if len(received) != len(expected) {
		return result, core.ErrInvalid
	}
	if len(plan.Assets) > 0 {
		// Persist file entries and their parent directories before publishing metadata.
		for _, dir := range []string{directory, filepath.Dir(directory), filepath.Dir(filepath.Dir(directory)), s.root} {
			if err = syncImportDirectory(dir); err != nil {
				return result, err
			}
		}
	}
	return s.core.ImportContent(ctx, userID, workspaceID, plan)
}

type importContextReader struct {
	ctx    context.Context
	source io.Reader
}

func (r importContextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.source.Read(p)
}

func (s *Service) stageImportAsset(ctx context.Context, path string, asset core.ImportAsset, part *multipart.Part) error {
	mime := strings.ToLower(strings.TrimSpace(strings.Split(part.Header.Get("Content-Type"), ";")[0]))
	if mime != asset.MIME {
		return core.ErrInvalid
	}
	source := bufio.NewReader(importContextReader{ctx: ctx, source: part})
	prefix, err := source.Peek(512)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, bufio.ErrBufferFull) {
		return err
	}
	if http.DetectContentType(prefix) != asset.MIME {
		return core.ErrInvalid
	}
	target, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	hasher := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(target, hasher), io.LimitReader(source, asset.Size+1))
	if copyErr == nil && (written != asset.Size || hex.EncodeToString(hasher.Sum(nil)) != asset.SHA256) {
		copyErr = core.ErrInvalid
	}
	if copyErr == nil {
		copyErr = target.Sync()
	}
	closeErr := target.Close()
	return errors.Join(copyErr, closeErr)
}

func writeSyncedFile(path string, data []byte) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	_, err = file.Write(data)
	if err == nil {
		err = file.Sync()
	}
	return errors.Join(err, file.Close())
}

func syncImportDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	return errors.Join(directory.Sync(), directory.Close())
}
