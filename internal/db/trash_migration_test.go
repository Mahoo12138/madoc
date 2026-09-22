package db

import (
	"database/sql"
	"io/fs"
	"path/filepath"
	"testing"
)

func TestTrashMigrationPreservesPreviousData(t *testing.T) {
	conn, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "old.db")+"?_pragma=foreign_keys(on)")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := conn.Exec(`CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= "0007_item_trash.sql" {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(string(body)); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(`INSERT INTO schema_migrations(version) VALUES(?)`, entry.Name()); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := conn.Exec(`
 INSERT INTO users(id,email,password_hash,created_at,updated_at) VALUES('u','u@test','hash',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO workspaces(id,name,created_by,created_at,updated_at) VALUES('w','Workspace','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO items(id,workspace_id,type,title,created_by,created_at,updated_at) VALUES('folder','w','folder','Folder','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO items(id,workspace_id,parent_id,type,title,created_by,created_at,updated_at) VALUES('doc','w','folder','markdown','Doc','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO items(id,workspace_id,parent_id,type,title,created_by,created_at,updated_at) VALUES('board','w','folder','whiteboard','Board','u',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO markdown_states(item_id,snapshot,markdown_cache,generation,updated_at) VALUES('doc',X'0102','kept',4,CURRENT_TIMESTAMP);
 INSERT INTO markdown_updates(id,item_id,client_update_id,update_blob,created_at) VALUES(42,'doc','pending',X'03',CURRENT_TIMESTAMP);
 INSERT INTO markdown_update_receipts(item_id,client_update_id,seq) VALUES('doc','pending',42);
 INSERT INTO whiteboard_states(item_id,revision,scene_json,updated_at) VALUES('board',9,'{"elements":[{"id":"kept"}]}',CURRENT_TIMESTAMP);
 INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,storage_key,created_at) VALUES('a','w','doc','image','image/png',1,'kept-file',CURRENT_TIMESTAMP);
 `); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := applyMigrations(conn); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err := conn.QueryRow(`SELECT count(*) FROM items WHERE deletion_batch_id IS NULL`).Scan(&count); err != nil || count != 3 {
		t.Fatalf("active data: %d %v", count, err)
	}
	var parent, markdown, scene, assetItem string
	var generation, seq, revision int64
	var snapshot, update []byte
	if err := conn.QueryRow(`SELECT i.parent_id,s.markdown_cache,s.snapshot,s.generation,u.update_blob,r.seq FROM items i JOIN markdown_states s ON s.item_id=i.id JOIN markdown_updates u ON u.item_id=i.id JOIN markdown_update_receipts r ON r.item_id=i.id WHERE i.id='doc'`).Scan(&parent, &markdown, &snapshot, &generation, &update, &seq); err != nil {
		t.Fatal(err)
	}
	if parent != "folder" || markdown != "kept" || string(snapshot) != string([]byte{1, 2}) || generation != 4 || string(update) != string([]byte{3}) || seq != 42 {
		t.Fatal("migration changed Markdown or tree")
	}
	if err := conn.QueryRow(`SELECT revision,scene_json FROM whiteboard_states WHERE item_id='board'`).Scan(&revision, &scene); err != nil || revision != 9 || scene != `{"elements":[{"id":"kept"}]}` {
		t.Fatalf("board: %d %s %v", revision, scene, err)
	}
	if err := conn.QueryRow(`SELECT item_id FROM assets WHERE id='a'`).Scan(&assetItem); err != nil || assetItem != "doc" {
		t.Fatalf("asset: %s %v", assetItem, err)
	}
	if err := conn.QueryRow(`SELECT count(*) FROM item_deletion_batches`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("unexpected batches: %d %v", count, err)
	}
}
