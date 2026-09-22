package account

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image"
	_ "image/jpeg"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"madoc/internal/core"
)

const MaxAvatarBytes = 2 << 20

func (s *Service) SaveAvatar(ctx context.Context, userID string, source io.Reader) error {
	data, err := io.ReadAll(io.LimitReader(source, MaxAvatarBytes+1))
	if err != nil {
		return err
	}
	if len(data) == 0 || len(data) > MaxAvatarBytes {
		return core.ErrInvalid
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "png" && format != "jpeg") || config.Width < 1 || config.Height < 1 || config.Width > 4096 || config.Height > 4096 {
		return core.ErrInvalid
	}
	original, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return core.ErrInvalid
	}
	// Store only a small, re-encoded centered square. No original metadata survives.
	output := image.NewRGBA(image.Rect(0, 0, 256, 256))
	bounds := original.Bounds()
	side := min(bounds.Dx(), bounds.Dy())
	left, top := bounds.Min.X+(bounds.Dx()-side)/2, bounds.Min.Y+(bounds.Dy()-side)/2
	for y := 0; y < 256; y++ {
		for x := 0; x < 256; x++ {
			output.Set(x, y, original.At(left+x*side/256, top+y*side/256))
		}
	}
	key := uuid.NewString() + ".png"
	dir := filepath.Join(s.root, "_avatars")
	if err = os.MkdirAll(dir, 0750); err != nil {
		return err
	}
	path := filepath.Join(dir, key)
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0640)
	if err != nil {
		return err
	}
	encodeErr := png.Encode(file, output)
	closeErr := file.Close()
	if encodeErr != nil || closeErr != nil {
		os.Remove(path)
		return errors.Join(encodeErr, closeErr)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		os.Remove(path)
		return err
	}
	defer tx.Rollback()
	var old string
	err = tx.QueryRowContext(ctx, `SELECT storage_key FROM user_avatars WHERE user_id=?`, userID).Scan(&old)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		os.Remove(path)
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO user_avatars(user_id,storage_key,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET storage_key=excluded.storage_key,updated_at=excluded.updated_at`, userID, key, time.Now().UTC())
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		os.Remove(path)
		return err
	}
	if old != "" && filepath.Base(old) == old {
		_ = os.Remove(filepath.Join(dir, old))
	}
	return nil
}

func (s *Service) RemoveAvatar(ctx context.Context, userID string) error {
	var key string
	// DELETE RETURNING makes concurrent replacement/removal act on the right file.
	err := s.db.QueryRowContext(ctx, `DELETE FROM user_avatars WHERE user_id=? RETURNING storage_key`, userID).Scan(&key)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if filepath.Base(key) == key {
		_ = os.Remove(filepath.Join(s.root, "_avatars", key))
	}
	return nil
}

func (s *Service) OpenAvatar(ctx context.Context, actorID, userID string) (*os.File, error) {
	if actorID != userID {
		var shared int
		err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM workspace_members a JOIN workspace_members b ON a.workspace_id=b.workspace_id WHERE a.user_id=? AND b.user_id=?`, actorID, userID).Scan(&shared)
		if err != nil {
			return nil, err
		}
		if shared == 0 {
			return nil, core.ErrNotFound
		}
	}
	var key string
	err := s.db.QueryRowContext(ctx, `SELECT storage_key FROM user_avatars WHERE user_id=?`, userID).Scan(&key)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, core.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if filepath.Base(key) != key {
		return nil, core.ErrInvalid
	}
	file, err := os.Open(filepath.Join(s.root, "_avatars", key))
	if os.IsNotExist(err) {
		return nil, core.ErrNotFound
	}
	return file, err
}
