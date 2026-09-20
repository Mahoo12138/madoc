package db

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

var ErrLegacySchema = errors.New("legacy AFFiNE-compatible schema detected; back up the database and run `madoc maintenance legacy-clean`")

func Open(path string) (*sql.DB, error) {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
	}
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(on)", path)
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	conn.SetMaxOpenConns(1)
	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	if err := rejectLegacySchema(conn); err != nil {
		conn.Close()
		return nil, err
	}
	if err := applyMigrations(conn); err != nil {
		conn.Close()
		return nil, err
	}
	return conn, nil
}

func rejectLegacySchema(conn *sql.DB) error {
	var migrations int
	if err := conn.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'`).Scan(&migrations); err != nil {
		return fmt.Errorf("inspect schema: %w", err)
	}
	if migrations > 0 {
		return nil
	}
	var legacy int
	if err := conn.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('user_sessions','snapshots','workspace_user_permissions')`).Scan(&legacy); err != nil {
		return fmt.Errorf("inspect legacy schema: %w", err)
	}
	if legacy > 0 {
		return ErrLegacySchema
	}
	return nil
}

func applyMigrations(conn *sql.DB) error {
	if _, err := conn.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		return fmt.Errorf("create migration table: %w", err)
	}
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		var applied int
		if err := conn.QueryRow(`SELECT count(*) FROM schema_migrations WHERE version=?`, entry.Name()).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", entry.Name(), err)
		}
		if applied > 0 {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		tx, err := conn.Begin()
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", entry.Name(), err)
		}
		if _, err = tx.Exec(string(body)); err == nil {
			_, err = tx.Exec(`INSERT INTO schema_migrations(version) VALUES(?)`, entry.Name())
		}
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", entry.Name(), err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func IsLegacy(path string) (bool, error) {
	conn, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(off)")
	if err != nil {
		return false, err
	}
	defer conn.Close()
	var count int
	err = conn.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('user_sessions','snapshots','workspace_user_permissions')`).Scan(&count)
	return count > 0, err
}
