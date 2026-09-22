package db

import (
	"database/sql"
	"io/fs"
	"path/filepath"
	"testing"
)

func TestPersonalItemsMigrationPreservesContentAndTrash(t *testing.T) {
	conn, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "old.db")+"?_pragma=foreign_keys(on)")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err = conn.Exec(`CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= "0008_personal_items.sql" {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		if _, err = conn.Exec(string(body)); err != nil {
			t.Fatal(err)
		}
		if _, err = conn.Exec(`INSERT INTO schema_migrations(version) VALUES(?)`, entry.Name()); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = conn.Exec(`
 INSERT INTO users(id,email,password_hash,created_at,updated_at) VALUES('u','u@test','hash',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO workspaces(id,name,created_by,created_at,updated_at) VALUES('w','Workspace','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO item_deletion_batches(id,workspace_id,root_item_id,deleted_by,deleted_at) VALUES('batch','w','doc','u',CURRENT_TIMESTAMP);
 INSERT INTO items(id,workspace_id,type,title,created_by,created_at,updated_at,deletion_batch_id) VALUES('doc','w','markdown','Doc','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'batch');
 INSERT INTO markdown_states(item_id,markdown_cache,generation,updated_at) VALUES('doc','preserved',3,CURRENT_TIMESTAMP);
 `); err != nil {
		t.Fatal(err)
	}
	if err = applyMigrations(conn); err != nil {
		t.Fatal(err)
	}
	if _, err = conn.Exec(`INSERT INTO item_favorites VALUES('u','doc',CURRENT_TIMESTAMP); INSERT INTO item_visits VALUES('u','doc',CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if err = applyMigrations(conn); err != nil {
		t.Fatal(err)
	}
	var body, batch string
	var generation int
	if err = conn.QueryRow(`SELECT m.markdown_cache,m.generation,i.deletion_batch_id FROM markdown_states m JOIN items i ON i.id=m.item_id WHERE i.id='doc'`).Scan(&body, &generation, &batch); err != nil || body != "preserved" || generation != 3 || batch != "batch" {
		t.Fatalf("preservation: %q %d %q %v", body, generation, batch, err)
	}
	for _, table := range []string{"item_favorites", "item_visits"} {
		var count int
		if err = conn.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil || count != 1 {
			t.Fatalf("reapply %s: %d %v", table, count, err)
		}
	}
}
