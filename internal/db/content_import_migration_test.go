package db

import (
	"database/sql"
	"io/fs"
	"path/filepath"
	"testing"
)

func TestContentImportMigrationPreservesVersionEightData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "upgrade.db")
	conn, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(on)")
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
		if entry.Name() >= "0009_content_imports.sql" {
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
 INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES('w','u','owner',CURRENT_TIMESTAMP);
 INSERT INTO items(id,workspace_id,type,title,created_by,created_at,updated_at) VALUES('i','w','markdown','Kept','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO markdown_states(item_id,snapshot,markdown_cache,generation,updated_at) VALUES('i',X'010203','preserved',7,CURRENT_TIMESTAMP);
 INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,storage_key,created_at) VALUES('a','w','i','image.png','image/png',42,'w/a',CURRENT_TIMESTAMP);
 INSERT INTO item_favorites(user_id,item_id,created_at) VALUES('u','i',CURRENT_TIMESTAMP);
 `); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err = applyMigrations(conn); err != nil {
			t.Fatal(err)
		}
	}
	var body, key string
	var generation, size, favorites int
	var snapshot []byte
	if err = conn.QueryRow(`SELECT m.markdown_cache,m.snapshot,m.generation,a.storage_key,a.size,(SELECT count(*) FROM item_favorites) FROM markdown_states m JOIN assets a ON a.item_id=m.item_id WHERE m.item_id='i'`).Scan(&body, &snapshot, &generation, &key, &size, &favorites); err != nil {
		t.Fatal(err)
	}
	if body != "preserved" || string(snapshot) != string([]byte{1, 2, 3}) || generation != 7 || key != "w/a" || size != 42 || favorites != 1 {
		t.Fatal("migration changed existing content")
	}
	if _, err = conn.Exec(`INSERT INTO content_imports(id,workspace_id,created_by,request_sha256,root_item_id,created_at) VALUES('receipt','w','u','hash','i',CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err = conn.Exec(`DELETE FROM items WHERE id='i'`); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = conn.QueryRow(`SELECT count(*) FROM content_imports`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("lost receipt after delete: %d %v", count, err)
	}
	if _, err = conn.Exec(`DELETE FROM workspaces WHERE id='w'`); err != nil {
		t.Fatal(err)
	}
	if err = conn.QueryRow(`SELECT count(*) FROM content_imports`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("orphan workspace receipt: %d %v", count, err)
	}
}
