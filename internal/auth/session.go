package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/google/uuid"
	"madoc/internal/db"
)

type SessionManager struct {
	repo *db.Repo
}

func NewSessionManager(repo *db.Repo) *SessionManager {
	return &SessionManager{repo: repo}
}

func (m *SessionManager) CreateSession(ctx context.Context, userID string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	sessionID := hex.EncodeToString(b)

	if err := m.repo.CreateSession(ctx, sessionID); err != nil {
		return "", err
	}

	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	id := uuidString()
	if err := m.repo.CreateUserSession(ctx, id, sessionID, userID, &expiresAt); err != nil {
		return "", err
	}

	return sessionID, nil
}

func (m *SessionManager) GetUserID(ctx context.Context, sessionID string) (string, error) {
	s, err := m.repo.GetUserSession(ctx, sessionID)
	if err != nil {
		return "", err
	}
	if s.ExpiresAt != nil && s.ExpiresAt.Before(time.Now()) {
		return "", db.ErrNotFound
	}
	return s.UserID, nil
}

func (m *SessionManager) DeleteSession(ctx context.Context, sessionID string) error {
	if err := m.repo.DeleteUserSession(ctx, sessionID); err != nil {
		return err
	}
	return m.repo.DeleteSession(ctx, sessionID)
}

func (m *SessionManager) DeleteExpiredSessions(ctx context.Context) error {
	return m.repo.DeleteExpiredSessions(ctx)
}

func uuidString() string {
	return uuid.New().String()
}
