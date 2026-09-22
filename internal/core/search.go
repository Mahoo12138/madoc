package core

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"unicode/utf8"
)

type SearchHit struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Title      string `json:"title"`
	Path       string `json:"path"`
	Snippet    string `json:"snippet"`
	Match      string `json:"match"`
	CacheSeq   int64  `json:"cacheSeq"`
	HeadSeq    int64  `json:"headSeq"`
	Generation int64  `json:"generation"`
}

type SearchResults struct {
	Items          []SearchHit `json:"items"`
	HasMore        bool        `json:"hasMore"`
	StaleDocuments int         `json:"staleDocuments"`
}

// Search reads metadata and derived Markdown in one permission-checked snapshot.
// instr uses literal substrings (including one-character CJK queries), so SQL
// wildcard and FTS syntax never changes the meaning of user input.
func (s *Service) Search(ctx context.Context, userID, workspaceID, query string, limit int) (SearchResults, error) {
	result := SearchResults{Items: []SearchHit{}}
	query = strings.TrimSpace(query)
	if query == "" || !utf8.ValidString(query) || utf8.RuneCountInString(query) > 128 || strings.ContainsRune(query, 0) || limit < 1 || limit > 100 {
		return result, ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	var role string
	if err := tx.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, userID).Scan(&role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return result, ErrForbidden
		}
		return result, err
	}
	// Count stale documents independently of matches: an empty result must not
	// imply that a word absent from a lagging cache is absent from current content.
	err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM items i JOIN markdown_states m ON m.item_id=i.id
 WHERE i.workspace_id=? AND i.deletion_batch_id IS NULL AND m.cache_seq < MAX(m.snapshot_seq,
 (SELECT COALESCE(MAX(u.id),0) FROM markdown_updates u WHERE u.item_id=i.id))`, workspaceID).Scan(&result.StaleDocuments)
	if err != nil {
		return result, err
	}
	rows, err := tx.QueryContext(ctx, `WITH RECURSIVE tree(id,type,title,path) AS (
 SELECT id,type,title,title FROM items WHERE workspace_id=? AND parent_id IS NULL AND deletion_batch_id IS NULL
 UNION ALL
 SELECT i.id,i.type,i.title,t.path || ' / ' || i.title FROM items i JOIN tree t ON i.parent_id=t.id
 WHERE i.workspace_id=? AND i.deletion_batch_id IS NULL
 ), bodies AS (
 SELECT t.*,m.markdown_cache,m.cache_seq,m.generation,m.snapshot_seq,madoc_search_text(m.markdown_cache) search_text
 FROM tree t LEFT JOIN markdown_states m ON m.item_id=t.id
 ), candidates AS (
 SELECT t.id,t.type,t.title,t.path,t.markdown_cache,t.search_text,COALESCE(t.cache_seq,0) cache_seq,COALESCE(t.generation,0) generation,
 MAX(COALESCE(t.snapshot_seq,0),(SELECT COALESCE(MAX(u.id),0) FROM markdown_updates u WHERE u.item_id=t.id)) head_seq,
 instr(lower(t.title),lower(?)) title_pos, instr(lower(t.path),lower(?)) path_pos,
 instr(lower(COALESCE(t.markdown_cache,'')),lower(?)) body_pos,
 instr(lower(t.search_text),lower(?)) text_pos
 FROM bodies t
 ) SELECT id,type,title,path,
 CASE WHEN body_pos>0 THEN substr(markdown_cache,MAX(1,body_pos-48),160) WHEN text_pos>0 THEN substr(search_text,MAX(1,text_pos-48),160) ELSE '' END,
 CASE WHEN title_pos>0 THEN 'title' WHEN path_pos>0 THEN 'path' ELSE 'body' END,
 cache_seq,head_seq,generation
 FROM candidates WHERE title_pos>0 OR path_pos>0 OR body_pos>0 OR text_pos>0
 ORDER BY CASE WHEN lower(title)=lower(?) THEN 0 WHEN title_pos>0 THEN 1 WHEN path_pos>0 THEN 2 ELSE 3 END,
 lower(path),id LIMIT ?`, workspaceID, workspaceID, query, query, query, query, query, limit+1)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var hit SearchHit
		if err := rows.Scan(&hit.ID, &hit.Type, &hit.Title, &hit.Path, &hit.Snippet, &hit.Match, &hit.CacheSeq, &hit.HeadSeq, &hit.Generation); err != nil {
			return result, err
		}
		if len(result.Items) == limit {
			result.HasMore = true
			break
		}
		result.Items = append(result.Items, hit)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	if err := rows.Close(); err != nil {
		return result, err
	}
	return result, tx.Commit()
}
