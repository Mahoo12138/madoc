package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var ErrNotFound = errors.New("not found")

type Repo struct {
	db *sql.DB
}

func NewRepo(db *sql.DB) *Repo { return &Repo{db: db} }

// ---------------------------------------------------------------------------
// Snapshot — latest Yjs document state per doc (table: snapshots)
// ---------------------------------------------------------------------------

type Snapshot struct {
	WorkspaceID string    `json:"workspace_id"`
	GUID        string    `json:"guid"`
	Blob        []byte    `json:"blob"`
	State       []byte    `json:"state"`
	Size        int64     `json:"size"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	CreatedBy   *string   `json:"created_by"`
	UpdatedBy   *string   `json:"updated_by"`
}

func (r *Repo) GetSnapshot(ctx context.Context, workspaceID, guid string) (*Snapshot, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT workspace_id, guid, blob, state, size, created_at, updated_at, created_by, updated_by
		 FROM snapshots WHERE workspace_id=? AND guid=?`, workspaceID, guid)
	var s Snapshot
	err := row.Scan(&s.WorkspaceID, &s.GUID, &s.Blob, &s.State, &s.Size, &s.CreatedAt, &s.UpdatedAt, &s.CreatedBy, &s.UpdatedBy)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

func (r *Repo) UpsertSnapshot(ctx context.Context, s *Snapshot) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO snapshots(workspace_id, guid, blob, state, size, created_by, updated_by)
		 VALUES(?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(workspace_id, guid) DO UPDATE SET
		   blob=excluded.blob, state=excluded.state, size=excluded.size,
		   updated_by=excluded.updated_by, updated_at=datetime('now')`,
		s.WorkspaceID, s.GUID, s.Blob, s.State, s.Size, s.CreatedBy, s.UpdatedBy)
	return err
}

// ---------------------------------------------------------------------------
// Update — sequential Yjs binary patches (table: updates)
// ---------------------------------------------------------------------------

type DocUpdate struct {
	WorkspaceID string    `json:"workspace_id"`
	GUID        string    `json:"guid"`
	CreatedAt   time.Time `json:"created_at"`
	Blob        []byte    `json:"blob"`
	CreatedBy   *string   `json:"created_by"`
}

func (r *Repo) AppendUpdate(ctx context.Context, workspaceID, guid string, blob []byte, createdBy *string) (time.Time, error) {
	now := time.Now().UTC()
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO updates(workspace_id, guid, created_at, blob, created_by) VALUES(?, ?, ?, ?, ?)`,
		workspaceID, guid, now.Format(time.RFC3339Nano), blob, createdBy)
	return now, err
}

func (r *Repo) ListUpdates(ctx context.Context, workspaceID, guid string) ([]DocUpdate, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT workspace_id, guid, created_at, blob, created_by
		 FROM updates WHERE workspace_id=? AND guid=? ORDER BY created_at ASC`,
		workspaceID, guid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DocUpdate
	for rows.Next() {
		var u DocUpdate
		if err := rows.Scan(&u.WorkspaceID, &u.GUID, &u.CreatedAt, &u.Blob, &u.CreatedBy); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *Repo) CountUpdates(ctx context.Context, workspaceID, guid string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM updates WHERE workspace_id=? AND guid=?`, workspaceID, guid).Scan(&n)
	return n, err
}

func (r *Repo) DeleteUpdatesBefore(ctx context.Context, workspaceID, guid string, before time.Time) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM updates WHERE workspace_id=? AND guid=? AND created_at<?`,
		workspaceID, guid, before.Format(time.RFC3339Nano))
	return err
}

func (r *Repo) DeleteUpdates(ctx context.Context, workspaceID, guid string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM updates WHERE workspace_id=? AND guid=?`,
		workspaceID, guid)
	return err
}

func (r *Repo) ListDocIDsByWorkspace(ctx context.Context, workspaceID string) ([]string, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT DISTINCT guid FROM updates WHERE workspace_id=?
		 UNION SELECT DISTINCT guid FROM snapshots WHERE workspace_id=?`,
		workspaceID, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ---------------------------------------------------------------------------
// Blob — file attachments per workspace (table: blobs)
// ---------------------------------------------------------------------------

type Blob struct {
	WorkspaceID string    `json:"workspace_id"`
	Key         string    `json:"key"`
	Size        int64     `json:"size"`
	Mime        string    `json:"mime"`
	Data        []byte    `json:"data"`
	Status      int       `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	DeletedAt   *string   `json:"deleted_at"`
}

func (r *Repo) CreateBlob(ctx context.Context, workspaceID, key string, size int64, mime string, data []byte) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO blobs(workspace_id, key, size, mime, data) VALUES(?, ?, ?, ?, ?)`,
		workspaceID, key, size, mime, data)
	return err
}

func (r *Repo) GetBlob(ctx context.Context, workspaceID, key string) (*Blob, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT workspace_id, key, size, mime, data, status, created_at, deleted_at
		 FROM blobs WHERE workspace_id=? AND key=?`, workspaceID, key)
	var b Blob
	err := row.Scan(&b.WorkspaceID, &b.Key, &b.Size, &b.Mime, &b.Data, &b.Status, &b.CreatedAt, &b.DeletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &b, err
}

func (r *Repo) DeleteBlob(ctx context.Context, workspaceID, key string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE blobs SET deleted_at=datetime('now') WHERE workspace_id=? AND key=?`,
		workspaceID, key)
	return err
}

func (r *Repo) ListBlobs(ctx context.Context, workspaceID string) ([]Blob, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT workspace_id, key, size, mime, data, status, created_at, deleted_at
		 FROM blobs WHERE workspace_id=? AND deleted_at IS NULL`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Blob
	for rows.Next() {
		var b Blob
		if err := rows.Scan(&b.WorkspaceID, &b.Key, &b.Size, &b.Mime, &b.Data, &b.Status, &b.CreatedAt, &b.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// WorkspacePage — page metadata per workspace (table: workspace_pages)
// ---------------------------------------------------------------------------

type WorkspacePage struct {
	WorkspaceID string `json:"workspace_id"`
	DocID       string `json:"doc_id"`
	Public      bool   `json:"public"`
	Mode        int    `json:"mode"`
	Title       string `json:"title"`
}

func (r *Repo) UpsertWorkspacePage(ctx context.Context, p *WorkspacePage) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO workspace_pages(workspace_id, doc_id, public, mode, title) VALUES(?, ?, ?, ?, ?)
		 ON CONFLICT(workspace_id, doc_id) DO UPDATE SET
		   public=excluded.public, mode=excluded.mode, title=excluded.title`,
		p.WorkspaceID, p.DocID, p.Public, p.Mode, p.Title)
	return err
}

func (r *Repo) GetWorkspacePage(ctx context.Context, workspaceID, docID string) (*WorkspacePage, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT workspace_id, doc_id, public, mode, title
		 FROM workspace_pages WHERE workspace_id=? AND doc_id=?`, workspaceID, docID)
	var p WorkspacePage
	err := row.Scan(&p.WorkspaceID, &p.DocID, &p.Public, &p.Mode, &p.Title)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// ---------------------------------------------------------------------------
// UserSnapshot — per-user Yjs docs (table: user_snapshots)
// ---------------------------------------------------------------------------

func (r *Repo) GetUserSnapshot(ctx context.Context, userID, id string) ([]byte, error) {
	var blob []byte
	err := r.db.QueryRowContext(ctx,
		`SELECT blob FROM user_snapshots WHERE user_id=? AND id=?`, userID, id).Scan(&blob)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return blob, err
}

func (r *Repo) SaveUserSnapshot(ctx context.Context, userID, id string, blob []byte) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO user_snapshots(user_id, id, blob) VALUES(?, ?, ?)
		 ON CONFLICT(user_id, id) DO UPDATE SET blob=excluded.blob, updated_at=datetime('now')`,
		userID, id, blob)
	return err
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

type User struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Password  *string   `json:"-"`
	AvatarURL *string   `json:"avatar_url"`
	Registered bool     `json:"registered"`
	Disabled  bool      `json:"disabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (r *Repo) CreateUser(ctx context.Context, id, name, email, password string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO users(id, name, email, password) VALUES(?, ?, ?, ?)`,
		id, name, email, password)
	return err
}

func (r *Repo) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, name, email, password, avatar_url, registered, disabled, created_at, updated_at
		 FROM users WHERE email=?`, email)
	var u User
	err := row.Scan(&u.ID, &u.Name, &u.Email, &u.Password, &u.AvatarURL, &u.Registered, &u.Disabled, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

func (r *Repo) GetUserByID(ctx context.Context, id string) (*User, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, name, email, password, avatar_url, registered, disabled, created_at, updated_at
		 FROM users WHERE id=?`, id)
	var u User
	err := row.Scan(&u.ID, &u.Name, &u.Email, &u.Password, &u.AvatarURL, &u.Registered, &u.Disabled, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

func (r *Repo) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, email, password, avatar_url, registered, disabled, created_at, updated_at
		 FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Password, &u.AvatarURL, &u.Registered, &u.Disabled, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *Repo) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// ---------------------------------------------------------------------------
// Session + UserSession
// ---------------------------------------------------------------------------

type Session struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
}

func (r *Repo) CreateSession(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO sessions(id) VALUES(?)`, id)
	return err
}

func (r *Repo) GetSession(ctx context.Context, id string) (*Session, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, created_at FROM sessions WHERE id=?`, id)
	var s Session
	err := row.Scan(&s.ID, &s.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

func (r *Repo) DeleteSession(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE id=?`, id)
	return err
}

type UserSession struct {
	ID        string     `json:"id"`
	SessionID string     `json:"session_id"`
	UserID    string     `json:"user_id"`
	ExpiresAt *time.Time `json:"expires_at"`
	CreatedAt time.Time  `json:"created_at"`
}

func (r *Repo) CreateUserSession(ctx context.Context, id, sessionID, userID string, expiresAt *time.Time) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO user_sessions(id, session_id, user_id, expires_at) VALUES(?, ?, ?, ?)`,
		id, sessionID, userID, expiresAt)
	return err
}

func (r *Repo) GetUserSession(ctx context.Context, sessionID string) (*UserSession, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, session_id, user_id, expires_at, created_at
		 FROM user_sessions WHERE session_id=?`, sessionID)
	var s UserSession
	err := row.Scan(&s.ID, &s.SessionID, &s.UserID, &s.ExpiresAt, &s.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

func (r *Repo) DeleteUserSession(ctx context.Context, sessionID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM user_sessions WHERE session_id=?`, sessionID)
	return err
}

func (r *Repo) DeleteExpiredSessions(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM user_sessions WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`)
	return err
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

type Workspace struct {
	ID        string    `json:"id"`
	Public    bool      `json:"public"`
	Name      *string   `json:"name"`
	AvatarKey *string   `json:"avatar_key"`
	CreatedAt time.Time `json:"created_at"`
}

func (r *Repo) CreateWorkspace(ctx context.Context, id string, public bool, name *string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO workspaces(id, public, name) VALUES(?, ?, ?)`,
		id, public, name)
	return err
}

func (r *Repo) GetWorkspace(ctx context.Context, id string) (*Workspace, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, public, name, avatar_key, created_at FROM workspaces WHERE id=?`, id)
	var w Workspace
	err := row.Scan(&w.ID, &w.Public, &w.Name, &w.AvatarKey, &w.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &w, err
}

func (r *Repo) ListWorkspacesByUser(ctx context.Context, userID string) ([]Workspace, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT w.id, w.public, w.name, w.avatar_key, w.created_at
		 FROM workspaces w
		 JOIN workspace_user_permissions p ON p.workspace_id = w.id
		 WHERE p.user_id = ?
		 ORDER BY w.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Workspace
	for rows.Next() {
		var w Workspace
		if err := rows.Scan(&w.ID, &w.Public, &w.Name, &w.AvatarKey, &w.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (r *Repo) DeleteWorkspace(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM workspaces WHERE id=?`, id)
	return err
}

// ---------------------------------------------------------------------------
// WorkspaceUserPermission
// ---------------------------------------------------------------------------

// Permission types matching AFFiNE Int-based enum:
//   Owner=100, Admin=50, Collaborator=10, External=0
const (
	PermOwner       = 100
	PermAdmin       = 50
	PermCollaborator = 10
	PermExternal    = 0
)

type WorkspaceUserPermission struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	UserID      string    `json:"user_id"`
	Type        int       `json:"type"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (r *Repo) AddWorkspacePermission(ctx context.Context, id, workspaceID, userID string, permType int) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO workspace_user_permissions(id, workspace_id, user_id, type) VALUES(?, ?, ?, ?)
		 ON CONFLICT(workspace_id, user_id) DO UPDATE SET type=excluded.type, status='Accepted'`,
		id, workspaceID, userID, permType)
	return err
}

func (r *Repo) GetWorkspacePermission(ctx context.Context, workspaceID, userID string) (*WorkspaceUserPermission, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, workspace_id, user_id, type, status, created_at, updated_at
		 FROM workspace_user_permissions WHERE workspace_id=? AND user_id=?`,
		workspaceID, userID)
	var p WorkspaceUserPermission
	err := row.Scan(&p.ID, &p.WorkspaceID, &p.UserID, &p.Type, &p.Status, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) RemoveWorkspacePermission(ctx context.Context, workspaceID, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM workspace_user_permissions WHERE workspace_id=? AND user_id=?`,
		workspaceID, userID)
	return err
}

// ---------------------------------------------------------------------------
// AppConfig
// ---------------------------------------------------------------------------

func (r *Repo) GetAppConfig(ctx context.Context, id string) (string, error) {
	var val string
	err := r.db.QueryRowContext(ctx, `SELECT value FROM app_configs WHERE id=?`, id).Scan(&val)
	if errors.Is(err, sql.ErrNoRows) {
		return "{}", nil
	}
	return val, err
}

func (r *Repo) SetAppConfig(ctx context.Context, id, value string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO app_configs(id, value) VALUES(?, ?)
		 ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`,
		id, value)
	return err
}

// ---------------------------------------------------------------------------
// Initialization check
// ---------------------------------------------------------------------------

func (r *Repo) IsInitialized(ctx context.Context) (bool, error) {
	n, err := r.CountUsers(ctx)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
