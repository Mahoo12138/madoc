package maintenance

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"madoc/internal/db"
)

func TestBackupAndRestore(t *testing.T) {
	parent := t.TempDir()
	dataDir := filepath.Join(parent, "data")
	if err := os.MkdirAll(filepath.Join(dataDir, "assets", "workspace"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "server.secret"), []byte("012345678901234567890123456789012345678901234567"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "assets", "workspace", "asset"), []byte("asset-data"), 0o640); err != nil {
		t.Fatal(err)
	}
	dbPath := filepath.Join(dataDir, "madoc.db")
	conn, err := db.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	conn.Close()
	backupDir, err := Backup(dataDir, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "assets", "workspace", "asset"), []byte("changed"), 0o640); err != nil {
		t.Fatal(err)
	}
	recovery, err := Restore(dataDir, dbPath, backupDir, true)
	if err != nil {
		t.Fatal(err)
	}
	restored, _ := os.ReadFile(filepath.Join(dataDir, "assets", "workspace", "asset"))
	preserved, _ := os.ReadFile(filepath.Join(recovery, "assets", "workspace", "asset"))
	if string(restored) != "asset-data" || string(preserved) != "changed" {
		t.Fatalf("restore=%q recovery=%q", restored, preserved)
	}
	if filepath.Dir(backupDir) != filepath.Join(dataDir, "backups") || filepath.Dir(recovery) != filepath.Join(dataDir, "backups") {
		t.Fatalf("backup paths must remain inside MADOC_DATA: backup=%q recovery=%q", backupDir, recovery)
	}
}

func TestCleanLegacyRequiresConfirmationAndPreservesDatabase(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		t.Fatal(err)
	}
	dbPath := filepath.Join(dataDir, "madoc.db")
	legacy, err := sql.Open("sqlite", "file:"+dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Exec(`CREATE TABLE user_sessions (id TEXT PRIMARY KEY); INSERT INTO user_sessions(id) VALUES('legacy')`); err != nil {
		t.Fatal(err)
	}
	legacy.Close()
	if _, err := CleanLegacy(dbPath, filepath.Join(dataDir, "backups"), false); err == nil {
		t.Fatal("expected confirmation to be required")
	}
	backup, err := CleanLegacy(dbPath, filepath.Join(dataDir, "backups"), true)
	if err != nil {
		t.Fatal(err)
	}
	var legacyRows int
	preserved, err := sql.Open("sqlite", "file:"+backup+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	if err := preserved.QueryRow(`SELECT count(*) FROM user_sessions`).Scan(&legacyRows); err != nil {
		t.Fatal(err)
	}
	preserved.Close()
	if legacyRows != 1 {
		t.Fatalf("legacy backup row count = %d", legacyRows)
	}
	canonical, err := db.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer canonical.Close()
	var migrations int
	if err := canonical.QueryRow(`SELECT count(*) FROM schema_migrations`).Scan(&migrations); err != nil || migrations != 2 {
		t.Fatalf("canonical migrations = %d, %v", migrations, err)
	}
}
