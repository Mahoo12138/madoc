package db

import (
	"database/sql"
	"io/fs"
	"path/filepath"
	"testing"
)

func TestWorkspaceDescriptionMigrationPreservesDataAndReopens(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	conn, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(on)")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { conn.Close() }()
	if _, err := conn.Exec(`CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= "0016_workspace_description.sql" {
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
	if _, err := conn.Exec(`
 INSERT INTO users(id,email,password_hash,created_at,updated_at) VALUES('u','u@test','hash',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO workspaces(id,name,created_by,created_at,updated_at) VALUES('w','Workspace','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES('w','u','owner',CURRENT_TIMESTAMP);
 INSERT INTO items(id,workspace_id,type,title,created_by,created_at,updated_at) VALUES('doc','w','markdown','Doc','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO markdown_states(item_id,markdown_cache,generation,updated_at) VALUES('doc','preserved',3,CURRENT_TIMESTAMP);
 `); err != nil {
		t.Fatal(err)
	}
	if err := applyMigrations(conn); err != nil {
		t.Fatal(err)
	}
	var name, description, role, body string
	var generation int
	if err := conn.QueryRow(`SELECT w.name,w.description,m.role,s.markdown_cache,s.generation FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id JOIN items i ON i.workspace_id=w.id JOIN markdown_states s ON s.item_id=i.id WHERE w.id='w'`).Scan(&name, &description, &role, &body, &generation); err != nil || name != "Workspace" || description != "" || role != "owner" || body != "preserved" || generation != 3 {
		t.Fatalf("migration preservation: %q %q %q %q %d %v", name, description, role, body, generation, err)
	}
	if _, err := conn.Exec(`UPDATE workspaces SET description='saved description' WHERE id='w'`); err != nil {
		t.Fatal(err)
	}
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}
	conn, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(`SELECT description FROM workspaces WHERE id='w'`).Scan(&description); err != nil || description != "saved description" {
		t.Fatalf("reopen: %q %v", description, err)
	}
}
