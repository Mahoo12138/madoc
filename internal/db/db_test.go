package db

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestOpenAppliesMigrationsIdempotently(t *testing.T) {
	path := filepath.Join(t.TempDir(), "madoc.db")
	for i := 0; i < 2; i++ {
		conn, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		conn.Close()
	}
	conn, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	var count int
	if err := conn.QueryRow(`SELECT count(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("expected 2 migrations, got %d", count)
	}
}

func TestOpenRejectsLegacySchema(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	conn, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`CREATE TABLE user_sessions (id TEXT PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	conn.Close()
	_, err = Open(path)
	if !errors.Is(err, ErrLegacySchema) {
		t.Fatalf("expected ErrLegacySchema, got %v", err)
	}
}
