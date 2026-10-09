package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"madoc/internal/site"
)

var (
	ErrUnauthorized       = errors.New("unauthorized")
	ErrAlreadyInitialized = errors.New("already initialized")
	ErrDisabled           = errors.New("user disabled")
)

type Capabilities struct {
	CanManageSite      bool `json:"canManageSite"`
	CanCreateWorkspace bool `json:"canCreateWorkspace"`
}

type User struct {
	ID                 string       `json:"id"`
	AvatarURL          *string      `json:"avatarUrl"`
	Name               string       `json:"name"`
	Email              string       `json:"email"`
	IsAdmin            bool         `json:"isAdmin"`
	Disabled           bool         `json:"disabled"`
	CanCreateWorkspace bool         `json:"-"`
	Capabilities       Capabilities `json:"capabilities"`
}

// ApplyCapabilities derives public capabilities from the user's current facts.
func (u *User) ApplyCapabilities() {
	actor := site.Actor{
		ID:                 u.ID,
		IsAdmin:            u.IsAdmin,
		Disabled:           u.Disabled,
		CanCreateWorkspace: u.CanCreateWorkspace,
	}
	u.Capabilities = Capabilities{
		CanManageSite:      site.CanManageSite(actor),
		CanCreateWorkspace: site.CanCreateWorkspace(actor),
	}
}

type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db: db} }

func (s *Service) SetupStatus(ctx context.Context) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&count)
	return count > 0, err
}

func (s *Service) SetupAdmin(ctx context.Context, name, email, password string) (User, string, error) {
	// P2: setup status and first-admin creation remain separate transactions.
	initialized, err := s.SetupStatus(ctx)
	if err != nil {
		return User{}, "", err
	}
	if initialized {
		return User{}, "", ErrAlreadyInitialized
	}
	email = strings.ToLower(strings.TrimSpace(email))
	name = strings.TrimSpace(name)
	if name == "" {
		name = email
	}
	hash, err := HashPassword(password)
	if err != nil {
		return User{}, "", err
	}
	now := time.Now().UTC()
	user := User{ID: uuid.NewString(), Name: name, Email: email, IsAdmin: true, CanCreateWorkspace: true}
	user.ApplyCapabilities()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO users(id,name,email,password_hash,is_admin,can_create_workspace,signup_source,created_at,updated_at) VALUES(?,?,?,?,1,1,'setup',?,?)`, user.ID, user.Name, user.Email, hash, now, now); err != nil {
		return User{}, "", err
	}
	session, err := createSession(ctx, tx, user.ID)
	if err != nil {
		return User{}, "", err
	}
	if err := tx.Commit(); err != nil {
		return User{}, "", err
	}
	return user, session, nil
}

func (s *Service) SignIn(ctx context.Context, email, password string) (User, string, error) {
	var user User
	var hash string
	var admin, disabled, canCreateWorkspace int
	err := s.db.QueryRowContext(ctx, `SELECT id,name,email,password_hash,is_admin,disabled,can_create_workspace,(SELECT '/api/users/'||users.id||'/avatar?v='||storage_key FROM user_avatars WHERE user_id=users.id) FROM users WHERE email=?`, strings.ToLower(strings.TrimSpace(email))).Scan(&user.ID, &user.Name, &user.Email, &hash, &admin, &disabled, &canCreateWorkspace, &user.AvatarURL)
	if err != nil || !CheckPassword(hash, password) {
		return User{}, "", ErrUnauthorized
	}
	if disabled != 0 {
		return User{}, "", ErrDisabled
	}
	user.IsAdmin, user.Disabled = admin != 0, disabled != 0
	user.CanCreateWorkspace = canCreateWorkspace != 0
	user.ApplyCapabilities()
	// Password verification is expensive and runs outside a transaction. Recheck
	// the hash before issuing a session so an in-flight old-password sign-in
	// cannot create a new session after a password change revoked the others.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, "", err
	}
	defer tx.Rollback()
	var valid int
	if err = tx.QueryRowContext(ctx, `SELECT 1 FROM users WHERE id=? AND password_hash=? AND disabled=0`, user.ID, hash).Scan(&valid); err != nil {
		return User{}, "", ErrUnauthorized
	}
	session, err := createSession(ctx, tx, user.ID)
	if err != nil {
		return User{}, "", err
	}
	return user, session, tx.Commit()
}

type execer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func createSession(ctx context.Context, q execer, userID string) (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	id := hex.EncodeToString(bytes)
	now := time.Now().UTC()
	_, err := q.ExecContext(ctx, `INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)`, id, userID, now.Add(30*24*time.Hour), now)
	return id, err
}

func (s *Service) Resolve(ctx context.Context, sessionID string) (*User, error) {
	if sessionID == "" {
		return nil, ErrUnauthorized
	}
	var user User
	var admin, disabled, canCreateWorkspace int
	err := s.db.QueryRowContext(ctx, `SELECT u.id,u.name,u.email,u.is_admin,u.disabled,u.can_create_workspace,(SELECT '/api/users/'||u.id||'/avatar?v='||storage_key FROM user_avatars WHERE user_id=u.id) FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?`, sessionID, time.Now().UTC()).Scan(&user.ID, &user.Name, &user.Email, &admin, &disabled, &canCreateWorkspace, &user.AvatarURL)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if disabled != 0 {
		return nil, ErrDisabled
	}
	user.IsAdmin, user.Disabled = admin != 0, disabled != 0
	user.CanCreateWorkspace = canCreateWorkspace != 0
	user.ApplyCapabilities()
	return &user, nil
}

func (s *Service) SignOut(ctx context.Context, sessionID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id=?`, sessionID)
	return err
}

func (s *Service) CreateSession(ctx context.Context, userID string) (string, error) {
	return createSession(ctx, s.db, userID)
}

func (s *Service) GetByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	var admin, disabled, canCreateWorkspace int
	err := s.db.QueryRowContext(ctx, `SELECT id,name,email,is_admin,disabled,can_create_workspace,(SELECT '/api/users/'||users.id||'/avatar?v='||storage_key FROM user_avatars WHERE user_id=users.id) FROM users WHERE email=?`, strings.ToLower(strings.TrimSpace(email))).Scan(&user.ID, &user.Name, &user.Email, &admin, &disabled, &canCreateWorkspace, &user.AvatarURL)
	if err != nil {
		return nil, err
	}
	user.IsAdmin, user.Disabled = admin != 0, disabled != 0
	user.CanCreateWorkspace = canCreateWorkspace != 0
	user.ApplyCapabilities()
	return &user, nil
}
