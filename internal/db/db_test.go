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
	if count != 6 {
		t.Fatalf("expected 6 migrations, got %d", count)
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

func TestMarkdownReceiptMigrationPreservesExistingUpdates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "upgrade.db")
	conn, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	// Reconstruct the previous schema with one existing document/update.
	_, err = conn.Exec(`
 DROP TABLE markdown_update_receipts;
 DELETE FROM schema_migrations WHERE version='0005_markdown_receipts.sql';
 INSERT INTO users(id,email,password_hash,created_at,updated_at) VALUES('u','u@test','hash',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO workspaces(id,name,created_by,created_at,updated_at) VALUES('w','Workspace','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO items(id,workspace_id,type,title,created_by,created_at,updated_at) VALUES('i','w','markdown','Doc','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO markdown_states(item_id,markdown_cache,updated_at) VALUES('i','kept',CURRENT_TIMESTAMP);
 INSERT INTO markdown_updates(id,item_id,client_update_id,update_blob,created_by,created_at) VALUES(42,'i','pending-ack',X'0102','u',CURRENT_TIMESTAMP);
 `)
	if err != nil {
		t.Fatal(err)
	}
	if err := applyMigrations(conn); err != nil {
		t.Fatal(err)
	}
	if err := applyMigrations(conn); err != nil {
		t.Fatal(err)
	}
	var seq int64
	if err := conn.QueryRow(`SELECT seq FROM markdown_update_receipts WHERE item_id='i' AND client_update_id='pending-ack'`).Scan(&seq); err != nil {
		t.Fatal(err)
	}
	if seq != 42 {
		t.Fatalf("receipt sequence = %d", seq)
	}
	var markdown string
	var update []byte
	if err := conn.QueryRow(`SELECT markdown_cache,update_blob FROM markdown_states JOIN markdown_updates USING(item_id) WHERE item_id='i'`).Scan(&markdown, &update); err != nil {
		t.Fatal(err)
	}
	if markdown != "kept" || string(update) != string([]byte{1, 2}) {
		t.Fatalf("migration changed content: %q, %v", markdown, update)
	}
}
