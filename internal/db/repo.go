package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrNotFound = errors.New("not found")

type Repo struct {
	db *sql.DB
}

func NewRepo(db *sql.DB) *Repo { return &Repo{db: db} }

type Doc struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (r *Repo) CreateDoc(ctx context.Context, id, title string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO docs(id, title) VALUES(?, ?) ON CONFLICT(id) DO NOTHING`,
		id, title)
	return err
}

func (r *Repo) ListDocs(ctx context.Context) ([]Doc, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, title, created_at, updated_at FROM docs ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Doc
	for rows.Next() {
		var d Doc
		if err := rows.Scan(&d.ID, &d.Title, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *Repo) GetDoc(ctx context.Context, id string) (*Doc, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, title, created_at, updated_at FROM docs WHERE id=?`, id)
	var d Doc
	if err := row.Scan(&d.ID, &d.Title, &d.CreatedAt, &d.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

func (r *Repo) GetSnapshot(ctx context.Context, id string) ([]byte, error) {
	row := r.db.QueryRowContext(ctx, `SELECT snapshot FROM docs WHERE id=?`, id)
	var b []byte
	if err := row.Scan(&b); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return b, nil
}

func (r *Repo) SaveSnapshot(ctx context.Context, id string, blob []byte) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE docs SET snapshot=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, blob, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		_, err = r.db.ExecContext(ctx,
			`INSERT INTO docs(id, title, snapshot) VALUES(?, 'Untitled', ?)`, id, blob)
	}
	return err
}

func (r *Repo) AppendUpdate(ctx context.Context, docID string, blob []byte) (int64, error) {
	if _, err := r.db.ExecContext(ctx,
		`INSERT INTO docs(id, title) VALUES(?, 'Untitled') ON CONFLICT(id) DO NOTHING`, docID); err != nil {
		return 0, fmt.Errorf("ensure doc: %w", err)
	}
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO doc_updates(doc_id, update_blob) VALUES(?, ?)`, docID, blob)
	if err != nil {
		return 0, err
	}
	if _, err := r.db.ExecContext(ctx,
		`UPDATE docs SET updated_at=CURRENT_TIMESTAMP WHERE id=?`, docID); err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

type Update struct {
	ID    int64
	Bytes []byte
}

func (r *Repo) ListUpdates(ctx context.Context, docID string) ([]Update, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, update_blob FROM doc_updates WHERE doc_id=? ORDER BY id ASC`, docID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Update
	for rows.Next() {
		var u Update
		if err := rows.Scan(&u.ID, &u.Bytes); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *Repo) CountUpdates(ctx context.Context, docID string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM doc_updates WHERE doc_id=?`, docID).Scan(&n)
	return n, err
}

func (r *Repo) DeleteUpdatesUpTo(ctx context.Context, docID string, maxID int64) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM doc_updates WHERE doc_id=? AND id<=?`, docID, maxID)
	return err
}

func (r *Repo) UpsertText(ctx context.Context, docID, content string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM doc_search WHERE doc_id=?`, docID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO doc_search(doc_id, content) VALUES(?, ?)`, docID, content); err != nil {
		return err
	}
	return tx.Commit()
}

type SearchHit struct {
	DocID   string `json:"doc_id"`
	Snippet string `json:"snippet"`
}

func (r *Repo) SearchFTS(ctx context.Context, query string) ([]SearchHit, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT doc_id, snippet(doc_search, 1, '<b>', '</b>', '...', 16)
		 FROM doc_search WHERE doc_search MATCH ? ORDER BY rank LIMIT 50`, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SearchHit
	for rows.Next() {
		var h SearchHit
		if err := rows.Scan(&h.DocID, &h.Snippet); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
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
