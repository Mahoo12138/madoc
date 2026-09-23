package asset

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"madoc/internal/core"
)

type importJournal struct {
	Version     int      `json:"version"`
	WorkspaceID string   `json:"workspaceId"`
	AttemptID   string   `json:"attemptId"`
	Assets      []string `json:"assets"`
}

func importUUID(id string) bool {
	parsed, err := uuid.Parse(id)
	return err == nil && parsed != uuid.Nil && parsed.String() == id
}

func (s *Service) cleanupImportDirectory(ctx context.Context, key string) error {
	prefix := key + string(filepath.Separator)
	var references int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM assets WHERE substr(storage_key,1,?)=?`, len(prefix), prefix).Scan(&references); err != nil {
		return err
	}
	if references > 0 {
		return nil
	}
	return os.RemoveAll(filepath.Join(s.root, key))
}

// RecoverImports runs once before accepting requests, never concurrently with
// imports. Only recognised attempt directories with no database references are
// removed. Unknown data, symlinks and incomplete journals remain untouched.
func (s *Service) RecoverImports(ctx context.Context) error {
	workspaces, err := os.ReadDir(s.root)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, workspace := range workspaces {
		if !workspace.IsDir() || !importUUID(workspace.Name()) {
			continue
		}
		container := filepath.Join(s.root, workspace.Name(), ".imports")
		info, err := os.Lstat(container)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		if !info.IsDir() {
			continue
		}
		attempts, err := os.ReadDir(container)
		if err != nil {
			return err
		}
		for _, attempt := range attempts {
			if !attempt.IsDir() || !importUUID(attempt.Name()) {
				continue
			}
			directory := filepath.Join(container, attempt.Name())
			valid, err := validImportJournal(directory, workspace.Name(), attempt.Name())
			if err != nil {
				return err
			}
			if !valid {
				continue
			}
			if err := s.cleanupImportDirectory(ctx, filepath.Join(workspace.Name(), ".imports", attempt.Name())); err != nil {
				return err
			}
		}
	}
	return nil
}

func validImportJournal(directory, workspaceID, attemptID string) (bool, error) {
	path := filepath.Join(directory, "journal.json")
	info, err := os.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !info.Mode().IsRegular() || info.Size() > 2<<20 {
		return false, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	var journal importJournal
	if json.Unmarshal(data, &journal) != nil || journal.Version != 1 || journal.WorkspaceID != workspaceID || journal.AttemptID != attemptID || len(journal.Assets) > core.MaxImportEntries {
		return false, nil
	}
	names := map[string]bool{"journal.json": true}
	for _, id := range journal.Assets {
		if !importUUID(id) || names[id] {
			return false, nil
		}
		names[id] = true
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		return false, err
	}
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			return false, err
		}
		if !names[entry.Name()] || !info.Mode().IsRegular() {
			return false, nil
		}
	}
	return true, nil
}
