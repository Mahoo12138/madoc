package db

import (
	"database/sql"
	"io/fs"
	"path/filepath"
	"testing"
)

func TestAdminRevisionMigrationAddsColumnWithoutTouchingData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "admin-revision.db")
	conn := openBeforeAdminRevisionMigration(t, path)
	if _, err := conn.Exec(`INSERT INTO users(id,email,password_hash,is_admin,disabled,created_at,updated_at) VALUES('legacy-user','legacy@example.test','hash',1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES('session-1','legacy-user',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE server_config SET value='{"schemaVersion":1,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":true,"inviteDefaultCanCreateWorkspace":true,"publicSignupDefaultCanCreateWorkspace":false,"origin":"upgrade"}' WHERE key='site_settings'`); err != nil {
		t.Fatal(err)
	}
	if err := applyMigrations(conn); err != nil {
		t.Fatal(err)
	}

	var revision int
	var admin, disabled, canCreate int
	var name, signupSource string
	if err := conn.QueryRow(`SELECT admin_revision,is_admin,disabled,can_create_workspace,name,signup_source FROM users WHERE id='legacy-user'`).Scan(&revision, &admin, &disabled, &canCreate, &name, &signupSource); err != nil {
		t.Fatal(err)
	}
	// Existing accounts start at 0: no administrator has managed them yet, and
	// the migration must not fabricate revision history.
	if revision != 0 || admin != 1 || disabled != 0 || canCreate != 1 || signupSource != "legacy" {
		t.Fatalf("legacy user after migration = revision %d admin %d disabled %d canCreate %d source %q", revision, admin, disabled, canCreate, signupSource)
	}
	var sessions int
	if err := conn.QueryRow(`SELECT count(*) FROM sessions`).Scan(&sessions); err != nil {
		t.Fatal(err)
	}
	if sessions != 1 {
		t.Fatalf("migration dropped sessions: count=%d", sessions)
	}
	if _, err := conn.Exec(`UPDATE users SET admin_revision=-1 WHERE id='legacy-user'`); err == nil {
		t.Fatal("admin_revision CHECK accepted a negative value")
	}
	if _, err := conn.Exec(`UPDATE users SET admin_revision=NULL WHERE id='legacy-user'`); err == nil {
		t.Fatal("admin_revision accepted NULL")
	}
	if _, err := conn.Exec(`UPDATE users SET admin_revision=7 WHERE id='legacy-user'`); err != nil {
		t.Fatalf("admin_revision rejected a valid value: %v", err)
	}
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}

	// Reopening must not reset a revision an administrator already advanced.
	conn, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	var reopened int
	if err := conn.QueryRow(`SELECT admin_revision FROM users WHERE id='legacy-user'`).Scan(&reopened); err != nil {
		t.Fatal(err)
	}
	if reopened != 7 {
		t.Fatalf("reopen reset admin_revision: %d", reopened)
	}
}

func TestAdminRevisionMigrationAppliesToFreshDatabase(t *testing.T) {
	conn, err := Open(filepath.Join(t.TempDir(), "fresh.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	var revision int
	if err := conn.QueryRow(`SELECT admin_revision FROM users WHERE id='missing'`).Scan(&revision); err == nil {
		t.Fatal("expected no rows for a missing user")
	}
	var columns int
	if err := conn.QueryRow(`SELECT count(*) FROM pragma_table_info('users') WHERE name='admin_revision'`).Scan(&columns); err != nil {
		t.Fatal(err)
	}
	if columns != 1 {
		t.Fatalf("admin_revision column missing on a fresh database: count=%d", columns)
	}
}

func openBeforeAdminRevisionMigration(t *testing.T, path string) *sql.DB {
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
