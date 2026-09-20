package maintenance

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"madoc/internal/db"
)

func CleanLegacy(dbPath, backupDir string, confirmed bool) (string, error) {
	if !confirmed {
		return "", fmt.Errorf("refusing to clean legacy data without --confirm")
	}
	legacy, err := db.IsLegacy(dbPath)
	if err != nil {
		return "", err
	}
	if !legacy {
		return "", fmt.Errorf("database is not a legacy madoc database")
	}
	if err := os.MkdirAll(backupDir, 0o750); err != nil {
		return "", err
	}
	backupPath := filepath.Join(backupDir, "madoc-legacy-"+time.Now().UTC().Format("20060102T150405Z")+".db")
	if err := os.Rename(dbPath, backupPath); err != nil {
		return "", fmt.Errorf("move legacy database to backup: %w", err)
	}
	for _, suffix := range []string{"-wal", "-shm"} {
		oldPath := dbPath + suffix
		if _, err := os.Stat(oldPath); err == nil {
			_ = os.Rename(oldPath, backupPath+suffix)
		}
	}
	conn, err := db.Open(dbPath)
	if err != nil {
		_ = os.Rename(backupPath, dbPath)
		return "", fmt.Errorf("initialize clean database: %w", err)
	}
	conn.Close()
	return backupPath, nil
}
