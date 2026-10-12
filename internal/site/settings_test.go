package site

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// siteSchema keeps the tests of this leaf package self-contained: site must not
// depend on madoc/internal/db, so the three tables it reads are declared here.
const siteSchema = `
CREATE TABLE server_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME NOT NULL
);
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    is_admin INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    can_create_workspace INTEGER NOT NULL DEFAULT 0,
    signup_source TEXT NOT NULL DEFAULT 'legacy',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
CREATE TABLE admin_audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_kind TEXT NOT NULL,
    actor_user_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    changes_json TEXT NOT NULL DEFAULT '{}',
    request_id TEXT,
    created_at DATETIME NOT NULL
);
`

const defaultSiteSettings = `{"schemaVersion":1,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false,"origin":"new"}`

func TestEnsurePersistsNewAndUpgradeDefaults(t *testing.T) {
	ctx := context.Background()
	t.Run("new", func(t *testing.T) {
		conn := openSiteTestDB(t)
		if _, err := conn.Exec(`DELETE FROM server_config WHERE key='site_settings'`); err != nil {
			t.Fatal(err)
		}
		settings, err := New(conn).Ensure(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if settings.Revision != 0 || settings.UpgradedInstance || settings.InviteDefaultCanCreateWorkspace || settings.AllowWorkspaceOwnerInviteNewUsers {
			t.Fatalf("new defaults = %#v", settings)
		}
		var count int
		if err := conn.QueryRow(`SELECT count(*) FROM server_config WHERE key='site_settings'`).Scan(&count); err != nil || count != 1 {
			t.Fatalf("persisted row count=%d err=%v", count, err)
		}
	})
	t.Run("upgrade", func(t *testing.T) {
		conn := openSiteTestDB(t)
		if _, err := conn.Exec(`DELETE FROM server_config WHERE key='site_settings'`); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(`INSERT INTO users(id,email,signup_source,created_at,updated_at) VALUES('legacy','legacy@example.test','legacy',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
			t.Fatal(err)
		}
		settings, err := New(conn).Ensure(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if !settings.UpgradedInstance || !settings.InviteDefaultCanCreateWorkspace || !settings.AllowWorkspaceOwnerInviteNewUsers {
			t.Fatalf("upgrade defaults = %#v", settings)
		}
	})
}

func TestLoadStrictValidationAndUnknownKeys(t *testing.T) {
	ctx := context.Background()
	valid := `{"schemaVersion":1,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false,"origin":"new","futureKey":{"safe":true}}`
	tests := []struct {
		name string
		raw  string
		want error
	}{
		{name: "unknown key ignored", raw: valid},
		{name: "invalid json", raw: `{`, want: ErrCorrupt},
		{name: "missing key", raw: `{"schemaVersion":1}`, want: ErrCorrupt},
		{name: "schema version", raw: `{"schemaVersion":2,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false}`, want: ErrCorrupt},
		{name: "fractional revision", raw: `{"schemaVersion":1,"revision":0.5,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false}`, want: ErrCorrupt},
		{name: "null revision", raw: `{"schemaVersion":1,"revision":null,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false}`, want: ErrCorrupt},
		{name: "string boolean", raw: `{"schemaVersion":1,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":"false","inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false}`, want: ErrCorrupt},
		{name: "number boolean", raw: `{"schemaVersion":1,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":1,"publicSignupDefaultCanCreateWorkspace":false}`, want: ErrCorrupt},
		{name: "null boolean", raw: `{"schemaVersion":1,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":null}`, want: ErrCorrupt},
		{name: "invalid mode", raw: `{"schemaVersion":1,"revision":0,"registrationMode":"public","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false}`, want: ErrCorrupt},
		{name: "invalid origin type", raw: `{"schemaVersion":1,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false,"origin":null}`, want: ErrCorrupt},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			conn := openSiteTestDB(t)
			if _, err := conn.Exec(`UPDATE server_config SET value=? WHERE key='site_settings'`, test.raw); err != nil {
				t.Fatal(err)
			}
			_, err := New(conn).Load(ctx, conn)
			if !errors.Is(err, test.want) {
				t.Fatalf("Load() error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestUpdateOrderingRevisionAuditAndNoOp(t *testing.T) {
	ctx := context.Background()
	conn := openSiteTestDB(t)
	insertSiteUser(t, conn, "admin", true, false, false)
	store := New(conn)
	actor := Actor{ID: "admin"}

	openChange := rawChanges(KeyRegistrationMode, `"open"`)
	if _, err := store.Update(ctx, actor, 99, openChange); !errors.Is(err, ErrRegistrationNotReady) {
		t.Fatalf("an unusable open must precede revision and admin checks: %v", err)
	}
	if _, err := store.Update(ctx, Actor{ID: "missing"}, 99, rawChanges(KeyInviteDefaultCanCreateWorkspace, `true`)); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("revision must precede admin check: %v", err)
	}
	if _, err := store.Update(ctx, Actor{ID: "missing"}, 0, rawChanges(KeyInviteDefaultCanCreateWorkspace, `true`)); !errors.Is(err, ErrAdminRequired) {
		t.Fatalf("admin recheck error = %v", err)
	}
	for _, raw := range []string{`"true"`, `1`, `null`} {
		if _, err := store.Update(ctx, actor, 0, rawChanges(KeyInviteDefaultCanCreateWorkspace, raw)); !errors.Is(err, ErrInvalidChange) {
			t.Fatalf("strict boolean %s error = %v", raw, err)
		}
	}
	if _, err := store.Update(ctx, actor, 0, rawChanges("revision", `1`)); !errors.Is(err, ErrInvalidChange) {
		t.Fatalf("unknown/meta key error = %v", err)
	}

	updated, err := store.Update(ctx, actor, 0, rawChanges(KeyInviteDefaultCanCreateWorkspace, `true`))
	if err != nil {
		t.Fatal(err)
	}
	if updated.Revision != 1 || !updated.InviteDefaultCanCreateWorkspace {
		t.Fatalf("updated settings = %#v", updated)
	}
	var count int
	var changesJSON string
	if err := conn.QueryRow(`SELECT count(*),changes_json FROM admin_audit_events`).Scan(&count, &changesJSON); err != nil {
		t.Fatal(err)
	}
	if count != 1 || changesJSON != `{"inviteDefaultCanCreateWorkspace":{"from":false,"to":true}}` {
		t.Fatalf("audit count/body = %d/%s", count, changesJSON)
	}
	noOp, err := store.Update(ctx, actor, 1, rawChanges(KeyInviteDefaultCanCreateWorkspace, `true`))
	if err != nil {
		t.Fatal(err)
	}
	if noOp.Revision != 1 {
		t.Fatalf("no-op revision = %d", noOp.Revision)
	}
	if err := conn.QueryRow(`SELECT count(*) FROM admin_audit_events`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("no-op audit count=%d err=%v", count, err)
	}
}

// TestOpenRegistrationRequiresAReadyCapability covers both halves of the new
// contract: "open" is a storable mode, but only on a deployment that can
// actually complete a registration.
func TestOpenRegistrationRequiresAReadyCapability(t *testing.T) {
	t.Run("stored open mode is a valid document", func(t *testing.T) {
		// It used to be treated as corruption on the grounds that no write path
		// could produce it. That is no longer true, and keeping the old rule
		// would make every read of a legitimately open instance fail closed.
		store := New(openSiteTestDBWithOpenMode(t))
		settings, err := store.Load(context.Background(), store.db)
		if err != nil {
			t.Fatalf("Load() error = %v, want the stored open mode to be accepted", err)
		}
		if settings.RegistrationMode != "open" {
			t.Fatalf("registrationMode = %q", settings.RegistrationMode)
		}
	})
	t.Run("stored open survives Ensure and unrelated changes", func(t *testing.T) {
		conn := openSiteTestDBWithOpenMode(t)
		store := New(conn).EnablePublicRegistration(readyPublicRegistration())
		if _, err := store.Ensure(context.Background()); err != nil {
			t.Fatalf("Ensure() error = %v", err)
		}
		// An unrelated change must be applied to the stored document, not
		// rejected because of a mode that is now legitimate.
		updated, err := store.Update(context.Background(), Actor{ID: "admin"}, 0, rawChanges(KeyInviteDefaultCanCreateWorkspace, `true`))
		if err != nil {
			t.Fatalf("Update() error = %v", err)
		}
		if !updated.InviteDefaultCanCreateWorkspace || updated.RegistrationMode != "open" {
			t.Fatalf("updated settings = %#v", updated)
		}
	})
	t.Run("invite policy still reads under open mode", func(t *testing.T) {
		conn := openSiteTestDBWithOpenMode(t)
		if _, err := New(conn).InviteDefaultCanCreateWorkspace(context.Background(), conn); err != nil {
			t.Fatalf("InviteDefaultCanCreateWorkspace() error = %v", err)
		}
	})
	t.Run("requested open is refused without mail", func(t *testing.T) {
		ctx := context.Background()
		conn := openSiteTestDB(t)
		insertSiteUser(t, conn, "admin", true, false, false)
		store := New(conn)
		// Without the capability the request is still refused — storing a mode
		// this deployment cannot execute would be worse than refusing it.
		if _, err := store.Update(ctx, Actor{ID: "admin"}, 0, rawChanges(KeyRegistrationMode, `"open"`)); !errors.Is(err, ErrRegistrationNotReady) {
			t.Fatalf("requested open error = %v, want ErrRegistrationNotReady", err)
		}
		var count int
		if err := conn.QueryRow(`SELECT count(*) FROM admin_audit_events`).Scan(&count); err != nil || count != 0 {
			t.Fatalf("rejected update wrote audit rows: count=%d err=%v", count, err)
		}
	})
	t.Run("requested open is accepted with mail", func(t *testing.T) {
		ctx := context.Background()
		conn := openSiteTestDB(t)
		insertSiteUser(t, conn, "admin", true, false, false)
		store := New(conn).EnablePublicRegistration(readyPublicRegistration())
		updated, err := store.Update(ctx, Actor{ID: "admin"}, 0, rawChanges(KeyRegistrationMode, `"open"`))
		if err != nil {
			t.Fatalf("Update() error = %v", err)
		}
		if updated.RegistrationMode != "open" {
			t.Fatalf("registrationMode = %q", updated.RegistrationMode)
		}
	})
	t.Run("an unrelated change under open without mail is refused", func(t *testing.T) {
		// The document already says open and the deployment cannot run it, so
		// nothing may be written on top of that state.
		conn := openSiteTestDBWithOpenMode(t)
		store := New(conn)
		if _, err := store.Update(context.Background(), Actor{ID: "admin"}, 0, rawChanges(KeyInviteDefaultCanCreateWorkspace, `true`)); !errors.Is(err, ErrRegistrationNotReady) {
			t.Fatalf("Update() error = %v, want ErrRegistrationNotReady", err)
		}
		assertStoredOpenUnchanged(t, conn)
	})
}

const storedOpenSiteSettings = `{"schemaVersion":1,"revision":0,"registrationMode":"open","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false,"origin":"new"}`

func openSiteTestDBWithOpenMode(t *testing.T) *sql.DB {
	t.Helper()
	conn := openSiteTestDB(t)
	insertSiteUser(t, conn, "admin", true, false, false)
	if _, err := conn.Exec(`UPDATE server_config SET value=? WHERE key='site_settings'`, storedOpenSiteSettings); err != nil {
		t.Fatal(err)
	}
	return conn
}

func assertStoredOpenUnchanged(t *testing.T, conn *sql.DB) {
	t.Helper()
	var raw string
	if err := conn.QueryRow(`SELECT value FROM server_config WHERE key='site_settings'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if raw != storedOpenSiteSettings {
		t.Fatalf("stored document was rewritten: %s", raw)
	}
	var count int
	if err := conn.QueryRow(`SELECT count(*) FROM admin_audit_events`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rejected updates wrote audit rows: count=%d err=%v", count, err)
	}
}

func TestUpdateConcurrentRevisionConflict(t *testing.T) {
	ctx := context.Background()
	conn := openSiteTestDB(t)
	insertSiteUser(t, conn, "admin", true, false, false)
	store := New(conn)
	results := make(chan error, 2)
	start := make(chan struct{})
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			_, err := store.Update(ctx, Actor{ID: "admin"}, 0, rawChanges(KeyInviteDefaultCanCreateWorkspace, `true`))
			results <- err
		}()
	}
	close(start)
	workers.Wait()
	close(results)
	var successes, conflicts int
	for err := range results {
		if err == nil {
			successes++
		} else if errors.Is(err, ErrRevisionConflict) {
			conflicts++
		} else {
			t.Fatalf("unexpected concurrent error: %v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent results successes=%d conflicts=%d", successes, conflicts)
	}
}

func TestInvitePolicyFailsClosedAndUsesTransaction(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	conn := openSiteTestDB(t)
	store := New(conn)
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	allowed, err := store.InviteDefaultCanCreateWorkspace(ctx, tx)
	if err != nil || allowed {
		t.Fatalf("transaction policy = %v, %v", allowed, err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE server_config SET value='{}' WHERE key='site_settings'`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.InviteDefaultCanCreateWorkspace(ctx, conn); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("corrupt policy error = %v", err)
	}
}

// openSiteTestDB mirrors production's single-connection SQLite pool so the
// transaction tests exercise the same SetMaxOpenConns(1) constraints.
func openSiteTestDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "site.db")
	conn, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(on)")
	if err != nil {
		t.Fatal(err)
	}
	conn.SetMaxOpenConns(1)
	if _, err := conn.Exec(siteSchema); err != nil {
		conn.Close()
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO server_config(key,value,updated_at) VALUES('site_settings',?,CURRENT_TIMESTAMP)`, defaultSiteSettings); err != nil {
		conn.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func insertSiteUser(t *testing.T, conn *sql.DB, id string, admin, disabled, canCreate bool) {
	t.Helper()
	if _, err := conn.Exec(`INSERT INTO users(id,email,is_admin,disabled,can_create_workspace,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, id, id+"@example.test", admin, disabled, canCreate, time.Now().UTC(), time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
}

func rawChanges(key, raw string) map[string]json.RawMessage {
	return map[string]json.RawMessage{key: json.RawMessage(raw)}
}
