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
