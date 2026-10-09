package db

import (
	"database/sql"
	"encoding/json"
	"io/fs"
	"path/filepath"
	"testing"
)

func TestSiteSettingsMigrationUpgradePreservesCapabilities(t *testing.T) {
	path := filepath.Join(t.TempDir(), "upgrade.db")
	conn := openBeforeSiteSettingsMigration(t, path)
	if _, err := conn.Exec(`INSERT INTO users(id,email,password_hash,created_at,updated_at) VALUES('legacy-user','legacy@example.test','hash',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if err := applyMigrations(conn); err != nil {
		t.Fatal(err)
	}

	var canCreate int
	var signupSource string
	if err := conn.QueryRow(`SELECT can_create_workspace,signup_source FROM users WHERE id='legacy-user'`).Scan(&canCreate, &signupSource); err != nil {
		t.Fatal(err)
	}
	if canCreate != 1 || signupSource != "legacy" {
		t.Fatalf("legacy capability/source = %d/%q", canCreate, signupSource)
	}
	settings := readStoredSiteSettings(t, conn)
	if settings.Origin != "upgrade" || !settings.AllowOwnerInvite || !settings.InviteCanCreate {
		t.Fatalf("upgrade settings = %#v", settings)
	}
	var tableCount, indexCount int
	if err := conn.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='admin_audit_events'`).Scan(&tableCount); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='index' AND name='idx_admin_audit_target'`).Scan(&indexCount); err != nil {
		t.Fatal(err)
	}
	if tableCount != 1 || indexCount != 1 {
		t.Fatalf("audit schema missing: table=%d index=%d", tableCount, indexCount)
	}
	if _, err := conn.Exec(`UPDATE users SET can_create_workspace=2 WHERE id='legacy-user'`); err == nil {
		t.Fatal("can_create_workspace CHECK accepted an invalid value")
	}
	if _, err := conn.Exec(`UPDATE users SET signup_source='invalid' WHERE id='legacy-user'`); err == nil {
		t.Fatal("signup_source CHECK accepted an invalid value")
	}

	custom := `{"schemaVersion":1,"revision":9,"registrationMode":"closed","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false,"origin":"upgrade"}`
	if _, err := conn.Exec(`UPDATE server_config SET value=? WHERE key='site_settings'`, custom); err != nil {
		t.Fatal(err)
	}
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}
	conn, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	var reopened string
	if err := conn.QueryRow(`SELECT value FROM server_config WHERE key='site_settings'`).Scan(&reopened); err != nil {
		t.Fatal(err)
	}
	if reopened != custom {
		t.Fatalf("reopen overwrote settings: %s", reopened)
	}
}

func TestSiteSettingsMigrationUsesNewInstallDefaults(t *testing.T) {
	conn, err := Open(filepath.Join(t.TempDir(), "new.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	settings := readStoredSiteSettings(t, conn)
	if settings.Origin != "new" || settings.AllowOwnerInvite || settings.InviteCanCreate {
		t.Fatalf("new install settings = %#v", settings)
	}
}

type storedSiteSettings struct {
	Origin           string `json:"origin"`
	AllowOwnerInvite bool   `json:"allowWorkspaceOwnerInviteNewUsers"`
	InviteCanCreate  bool   `json:"inviteDefaultCanCreateWorkspace"`
}

func readStoredSiteSettings(t *testing.T, conn *sql.DB) storedSiteSettings {
	t.Helper()
	var raw string
	if err := conn.QueryRow(`SELECT value FROM server_config WHERE key='site_settings'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var settings storedSiteSettings
	if err := json.Unmarshal([]byte(raw), &settings); err != nil {
		t.Fatal(err)
	}
	return settings
}

func openBeforeSiteSettingsMigration(t *testing.T, path string) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(on)")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		conn.Close()
		t.Fatal(err)
	}
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		conn.Close()
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.IsDir() || entry.Name() >= "0017_site_settings_and_user_capabilities.sql" {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			conn.Close()
			t.Fatal(err)
		}
		if _, err := conn.Exec(string(body)); err != nil {
			conn.Close()
			t.Fatal(err)
		}
		if _, err := conn.Exec(`INSERT INTO schema_migrations(version) VALUES(?)`, entry.Name()); err != nil {
			conn.Close()
			t.Fatal(err)
		}
	}
	return conn
}
