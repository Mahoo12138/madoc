package db

import (
	"database/sql"
	"io/fs"
	"path/filepath"
	"testing"
)

// TestAccountEnrollmentsMigrationAddsStructureWithoutTouchingData pins that the
// migration only adds structure: all pre-existing rows survive with their values
// intact and no account is marked as email verified.
func TestAccountEnrollmentsMigrationAddsStructureWithoutTouchingData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "enrollments.db")
	conn := openBeforeAccountEnrollmentsMigration(t, path)
	if _, err := conn.Exec(`INSERT INTO users(id,email,password_hash,is_admin,disabled,created_at,updated_at) VALUES('legacy-user','legacy@example.test','hash',1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES('session-1','legacy-user',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO admin_audit_events(actor_kind,actor_user_id,action,target_type,target_id,changes_json,created_at) VALUES('user','legacy-user','user.disabled','user','legacy-user','{"disabled":{"from":false,"to":true}}',CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if err := applyMigrations(conn); err != nil {
		t.Fatal(err)
	}

	var verified *string
	if err := conn.QueryRow(`SELECT email_verified_at FROM users WHERE id='legacy-user'`).Scan(&verified); err != nil {
		t.Fatal(err)
	}
	// Existing accounts must not be retroactively declared verified.
	if verified != nil {
		t.Fatalf("email_verified_at after migration = %v, want NULL", *verified)
	}
	var sessions, users, audits int
	if err := conn.QueryRow(`SELECT count(*) FROM sessions`).Scan(&sessions); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(`SELECT count(*) FROM users`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(`SELECT count(*) FROM admin_audit_events`).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if sessions != 1 || users != 1 || audits != 1 {
		t.Fatalf("migration changed existing data: users=%d sessions=%d audits=%d", users, sessions, audits)
	}

	// Structural constraints must hold for rows written afterwards.
	if _, err := conn.Exec(`INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at,created_by,can_create_workspace) VALUES('enrollment-1','admin_created','new@example.test','hash','pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'legacy-user',1)`); err != nil {
		t.Fatalf("valid admin_created row rejected: %v", err)
	}
	// The reserved public_signup kind already validates today: it carries no
	// issuer and no frozen grant, so the later package needs no migration.
	if _, err := conn.Exec(`INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at) VALUES('enrollment-2','public_signup','public@example.test','hash2','pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatalf("public_signup row rejected: %v", err)
	}
	if _, err := conn.Exec(`INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at) VALUES('enrollment-3','legacy','new@example.test','hash3','pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err == nil {
		t.Fatal("kind CHECK accepted a value outside the reserved pair")
	}
	if _, err := conn.Exec(`INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at) VALUES('enrollment-4','admin_created','invalid@example.test','hash4','done',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err == nil {
		t.Fatal("status CHECK accepted an unknown value")
	}
	if _, err := conn.Exec(`INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at,created_by) VALUES('enrollment-5','admin_created','missing-admin@example.test','hash5','pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'no-such-user')`); err == nil {
		t.Fatal("created_by accepted a user id that does not exist")
	}
	if _, err := conn.Exec(`INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at,can_create_workspace) VALUES('enrollment-6','admin_created','bad-grant@example.test','hash6','pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,2)`); err == nil {
		t.Fatal("can_create_workspace CHECK accepted 2")
	}

	// Removing the issuer keeps the record instead of deleting it, so the history
	// of who approved an account stays readable.
	if _, err := conn.Exec(`DELETE FROM users WHERE id='legacy-user'`); err != nil {
		t.Fatal(err)
	}
	var issuer *string
	if err := conn.QueryRow(`SELECT created_by FROM account_enrollments WHERE id='enrollment-1'`).Scan(&issuer); err != nil {
		t.Fatal(err)
	}
	if issuer != nil {
		t.Fatalf("created_by after deleting the issuer = %v, want NULL", *issuer)
	}
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}

	// Reopening must find the same structure and not re-run anything.
	reopened, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	for _, index := range []string{"idx_account_enrollments_email_status", "idx_account_enrollments_issuer"} {
		var count int
		if err := reopened.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='index' AND name=?`, index).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatalf("index %s missing after reopen: count=%d", index, count)
		}
	}
}

func TestAccountEnrollmentsMigrationAppliesToFreshDatabase(t *testing.T) {
	conn, err := Open(filepath.Join(t.TempDir(), "fresh.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	for _, check := range []struct{ query string }{
		{`SELECT count(*) FROM pragma_table_info('account_enrollments') WHERE name='token_hash'`},
		{`SELECT count(*) FROM pragma_table_info('users') WHERE name='email_verified_at'`},
	} {
		var count int
		if err := conn.QueryRow(check.query).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatalf("missing column after %s: count=%d", check.query, count)
		}
	}
	// A nullable timestamp must accept both states; the activation flow writes
	// NULL and only a real verification writes a value.
	if _, err := conn.Exec(`INSERT INTO account_enrollments(id,kind,email,token_hash,status,expires_at,created_at,consumed_at) VALUES('e','admin_created','a@example.test','h','consumed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE account_enrollments SET consumed_at=NULL WHERE id='e'`); err != nil {
		t.Fatal(err)
	}
}

func openBeforeAccountEnrollmentsMigration(t *testing.T, path string) *sql.DB {
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
		if entry.IsDir() || entry.Name() >= "0019_account_enrollments.sql" {
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
