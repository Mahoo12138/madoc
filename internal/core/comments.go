package core

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	DefaultCommentPageSize = 50
	MaxCommentPageSize     = 100
	MaxCommentRunes        = 4000
)

func (s *Service) ListItemComments(ctx context.Context, userID, itemID, before string, limit int) ([]ItemComment, string, error) {
	if limit == 0 {
		limit = DefaultCommentPageSize
	}
	if limit < 1 || limit > MaxCommentPageSize || (before != "" && !validImportID(before)) {
		return nil, "", ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, false)
	if err != nil {
		return nil, "", err
	}
	if item.Type == "folder" {
		return nil, "", ErrInvalid
	}
	var role string
	if err := tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, item.WorkspaceID, userID).Scan(&role); errors.Is(err, sql.ErrNoRows) {
		return nil, "", ErrForbidden
	} else if err != nil {
		return nil, "", err
	}
	query := `SELECT c.id,c.item_id,c.user_id,c.author_name,c.body,c.created_at FROM item_comments c WHERE c.item_id=?`
	args := []any{itemID}
	if before != "" {
		query += ` AND (c.created_at,c.id)<(SELECT created_at,id FROM item_comments WHERE id=? AND item_id=?)`
		args = append(args, before, itemID)
	}
	query += ` ORDER BY c.created_at DESC,c.id DESC LIMIT ?`
	args = append(args, limit+1)
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	comments := make([]ItemComment, 0, limit+1)
	nextBefore := ""
	for rows.Next() {
		var comment ItemComment
		var authorID sql.NullString
		if err := rows.Scan(&comment.ID, &comment.ItemID, &authorID, &comment.AuthorName, &comment.Body, &comment.CreatedAt); err != nil {
			return nil, "", err
		}
		comment.CanDelete = canWrite(role) && (role == "owner" || (authorID.Valid && authorID.String == userID))
		comments = append(comments, comment)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	if len(comments) > limit {
		comments = comments[:limit]
		nextBefore = comments[len(comments)-1].ID
	}
	return comments, nextBefore, nil
}

func (s *Service) CreateItemComment(ctx context.Context, userID, itemID, body string) (ItemComment, error) {
	body = strings.TrimSpace(body)
	if body == "" || utf8.RuneCountInString(body) > MaxCommentRunes {
		return ItemComment{}, ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ItemComment{}, err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, true)
	if err != nil {
		return ItemComment{}, err
	}
	if item.Type == "folder" {
		return ItemComment{}, ErrInvalid
	}
	var authorName string
	if err := tx.QueryRowContext(ctx, `SELECT name FROM users WHERE id=? AND disabled=0`, userID).Scan(&authorName); errors.Is(err, sql.ErrNoRows) {
		return ItemComment{}, ErrForbidden
	} else if err != nil {
		return ItemComment{}, err
	}
	now := time.Now().UTC()
	comment := ItemComment{ID: uuid.NewString(), ItemID: itemID, AuthorName: authorName, Body: body, CreatedAt: now, CanDelete: true}
	if _, err := tx.ExecContext(ctx, `INSERT INTO item_comments(id,workspace_id,item_id,user_id,author_name,body,created_at) VALUES(?,?,?,?,?,?,?)`, comment.ID, item.WorkspaceID, itemID, userID, authorName, body, now); err != nil {
		return ItemComment{}, err
	}
	if err := tx.Commit(); err != nil {
		return ItemComment{}, err
	}
	return comment, nil
}

func (s *Service) DeleteItemComment(ctx context.Context, userID, itemID, commentID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	item, err := itemAccess(ctx, tx, userID, itemID, false)
	if err != nil {
		return err
	}
	var role string
	if err := tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, item.WorkspaceID, userID).Scan(&role); errors.Is(err, sql.ErrNoRows) {
		return ErrForbidden
	} else if err != nil {
		return err
	}
	if !canWrite(role) {
		return ErrForbidden
	}
	var authorID sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT user_id FROM item_comments WHERE id=? AND item_id=?`, commentID, itemID).Scan(&authorID); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if role != "owner" && (!authorID.Valid || authorID.String != userID) {
		return ErrForbidden
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM item_comments WHERE id=? AND item_id=?`, commentID, itemID); err != nil {
		return err
	}
	return tx.Commit()
}
