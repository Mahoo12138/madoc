package maintenance

import (
	"database/sql"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Backup copies the complete local state into the data directory's backups
// folder so it remains available when MADOC_DATA is a container volume. The
// server must be stopped so assets and SQLite describe the same point in time.
func Backup(dataDir, dbPath string) (string, error) {
	dataDir, err := safeDataDir(dataDir)
	if err != nil {
		return "", err
	}
	backupRoot := filepath.Join(dataDir, "backups")
	if err := os.MkdirAll(backupRoot, 0o750); err != nil {
		return "", fmt.Errorf("create backup root: %w", err)
	}
	backupDir, err := os.MkdirTemp(backupRoot, "backup-"+time.Now().UTC().Format("20060102T150405Z")+"-")
	if err != nil {
		return "", fmt.Errorf("create backup directory: %w", err)
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(backupDir)
		}
	}()
	conn, err := sql.Open("sqlite", "file:"+dbPath+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return "", err
	}
	defer conn.Close()
	if _, err := conn.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		return "", fmt.Errorf("checkpoint database: %w", err)
	}
	if _, err := conn.Exec(`BEGIN EXCLUSIVE`); err != nil {
		return "", fmt.Errorf("lock database: %w", err)
	}
	locked := true
	defer func() {
		if locked {
			_, _ = conn.Exec(`ROLLBACK`)
		}
	}()
	if err := copyFile(dbPath, filepath.Join(backupDir, "madoc.db"), 0o640); err != nil {
		return "", err
	}
	for _, name := range []string{"server.secret", "assets"} {
		source := filepath.Join(dataDir, name)
		if _, err := os.Stat(source); os.IsNotExist(err) && name == "assets" {
			if err := os.Mkdir(filepath.Join(backupDir, "assets"), 0o750); err != nil {
				return "", err
			}
			continue
		} else if err != nil {
			return "", fmt.Errorf("inspect %s: %w", name, err)
		}
		if err := copyTree(source, filepath.Join(backupDir, name)); err != nil {
			return "", err
		}
	}
	if _, err := conn.Exec(`COMMIT`); err != nil {
		return "", fmt.Errorf("unlock database: %w", err)
	}
	locked = false
	if err := validateBackup(backupDir); err != nil {
		return "", err
	}
	cleanup = false
	return backupDir, nil
}

// Restore replaces the canonical state files after validating the backup,
// preserving the previous state in the volume for recovery.
func Restore(dataDir, dbPath, backupDir string, confirmed bool) (string, error) {
	if !confirmed {
		return "", fmt.Errorf("restore requires --confirm")
	}
	dataDir, err := safeDataDir(dataDir)
	if err != nil {
		return "", err
	}
	backupDir, err = filepath.Abs(backupDir)
	if err != nil {
		return "", err
	}
	if err := validateBackup(backupDir); err != nil {
		return "", err
	}
	backupRoot := filepath.Join(dataDir, "backups")
	if err := os.MkdirAll(backupRoot, 0o750); err != nil {
		return "", fmt.Errorf("create backup root: %w", err)
	}
	recovery, err := os.MkdirTemp(backupRoot, "pre-restore-"+time.Now().UTC().Format("20060102T150405Z")+"-")
	if err != nil {
		return "", fmt.Errorf("create recovery directory: %w", err)
	}
	if err := copyState(dataDir, dbPath, recovery); err != nil {
		_ = os.RemoveAll(recovery)
		return "", fmt.Errorf("preserve current data: %w", err)
	}
	if err := validateBackup(recovery); err != nil {
		_ = os.RemoveAll(recovery)
		return "", fmt.Errorf("validate preserved data: %w", err)
	}
	if err := replaceState(dataDir, dbPath, backupDir); err != nil {
		rollbackErr := replaceState(dataDir, dbPath, recovery)
		if rollbackErr != nil {
			return recovery, fmt.Errorf("restore backup: %v; rollback failed: %w", err, rollbackErr)
		}
		return recovery, fmt.Errorf("restore backup: %w", err)
	}
	if err := validateState(dataDir, dbPath); err != nil {
		rollbackErr := replaceState(dataDir, dbPath, recovery)
		if rollbackErr != nil {
			return recovery, fmt.Errorf("validate restored state: %v; rollback failed: %w", err, rollbackErr)
		}
		return recovery, fmt.Errorf("validate restored state: %w", err)
	}
	return recovery, nil
}

func copyState(dataDir, dbPath, target string) error {
	if err := copyFile(dbPath, filepath.Join(target, "madoc.db"), 0o640); err != nil {
		return err
	}
	for _, name := range []string{"server.secret", "assets"} {
		if err := copyTree(filepath.Join(dataDir, name), filepath.Join(target, name)); err != nil {
			return err
		}
	}
	return nil
}

func replaceState(dataDir, dbPath, source string) error {
	stage, err := os.MkdirTemp(dataDir, ".restore-stage-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	if err := copyTree(source, stage); err != nil {
		return err
	}
	if err := validateBackup(stage); err != nil {
		return err
	}
	for _, path := range []string{dbPath, dbPath + "-wal", dbPath + "-shm", filepath.Join(dataDir, "server.secret"), filepath.Join(dataDir, "assets")} {
		if err := os.RemoveAll(path); err != nil {
			return err
		}
	}
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o750); err != nil {
		return err
	}
	if err := os.Rename(filepath.Join(stage, "madoc.db"), dbPath); err != nil {
		return err
	}
	for _, name := range []string{"server.secret", "assets"} {
		if err := os.Rename(filepath.Join(stage, name), filepath.Join(dataDir, name)); err != nil {
			return err
		}
	}
	return nil
}

func validateState(dataDir, dbPath string) error {
	temp, err := os.MkdirTemp(dataDir, ".validate-state-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(temp)
	if err := copyState(dataDir, dbPath, temp); err != nil {
		return err
	}
	return validateBackup(temp)
}

func validateBackup(dir string) error {
	for _, name := range []string{"madoc.db", "server.secret", "assets"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			return fmt.Errorf("invalid backup: missing %s", name)
		}
	}
	conn, err := sql.Open("sqlite", "file:"+filepath.Join(dir, "madoc.db")+"?mode=ro")
	if err != nil {
		return fmt.Errorf("open backup database: %w", err)
	}
	defer conn.Close()
	var result string
	if err := conn.QueryRow(`PRAGMA quick_check`).Scan(&result); err != nil || result != "ok" {
		return fmt.Errorf("backup database check failed: %s: %w", result, err)
	}
	return nil
}

func safeDataDir(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	volume := filepath.VolumeName(abs) + string(filepath.Separator)
	if abs == volume || abs == filepath.Dir(abs) {
		return "", fmt.Errorf("refusing broad data directory %q", abs)
	}
	return abs, nil
}

func copyTree(source, target string) error {
	info, err := os.Stat(source)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return copyFile(source, target, info.Mode().Perm())
	}
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(source, path)
		if err != nil || strings.HasPrefix(rel, "..") {
			return fmt.Errorf("invalid backup path %q", path)
		}
		destination := filepath.Join(target, rel)
		if entry.IsDir() {
			return os.MkdirAll(destination, 0o750)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		return copyFile(path, destination, info.Mode().Perm())
	})
}

func copyFile(source, target string, mode os.FileMode) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
		return err
	}
	out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}
