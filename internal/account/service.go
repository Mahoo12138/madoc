package account

import (
	"context"
	"database/sql"
	"strings"
	"time"
	"unicode/utf8"

	"madoc/internal/auth"
	"madoc/internal/core"
)

type Service struct {
	db   *sql.DB
	root string
}

func New(db *sql.DB, assetRoot string) *Service { return &Service{db: db, root: assetRoot} }

func (s *Service) Rename(ctx context.Context, userID, name string) error {
	name = strings.TrimSpace(name)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 80 {
		return core.ErrInvalid
	}
	_, err := s.db.ExecContext(ctx, `UPDATE users SET name=?,updated_at=? WHERE id=?`, name, time.Now().UTC(), userID)
	return err
}

func (s *Service) ChangePassword(ctx context.Context, userID, sessionID, current, next string) error {
	if len(next) < 8 || len(next) > 72 {
		return core.ErrInvalid
	}
	// Hash outside the transaction; compare again inside it to serialize password changes.
	var previous string
	if err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE id=?`, userID).Scan(&previous); err != nil {
		return err
	}
	if !auth.CheckPassword(previous, current) {
		return auth.ErrUnauthorized
	}
	hash, err := auth.HashPassword(next)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE users SET password_hash=?,updated_at=? WHERE id=? AND password_hash=? AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND user_id=? AND expires_at>?)`, hash, time.Now().UTC(), userID, previous, sessionID, userID, time.Now().UTC())
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		return core.ErrConflict
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id=? AND id<>?`, userID, sessionID); err != nil {
		return err
	}
	return tx.Commit()
}
