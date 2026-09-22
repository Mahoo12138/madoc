package account

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"madoc/internal/core"
	"time"
)

type Preferences struct {
	FontSize        int     `json:"fontSize"`
	LineHeight      float64 `json:"lineHeight"`
	ContentWidth    int     `json:"contentWidth"`
	CodeLineNumbers bool    `json:"codeLineNumbers"`
	AutoPair        bool    `json:"autoPair"`
	FocusMode       bool    `json:"focusMode"`
	TypewriterMode  bool    `json:"typewriterMode"`
}
type PreferencesState struct {
	Preferences Preferences `json:"preferences"`
	Initialized bool        `json:"initialized"`
	Revision    int64       `json:"revision"`
}
type PreferencesPatch struct {
	FontSize        *int     `json:"fontSize"`
	LineHeight      *float64 `json:"lineHeight"`
	ContentWidth    *int     `json:"contentWidth"`
	CodeLineNumbers *bool    `json:"codeLineNumbers"`
	AutoPair        *bool    `json:"autoPair"`
	FocusMode       *bool    `json:"focusMode"`
	TypewriterMode  *bool    `json:"typewriterMode"`
}

func DefaultPreferences() Preferences {
	return Preferences{FontSize: 16, LineHeight: 1.75, ContentWidth: 760, CodeLineNumbers: true, AutoPair: true}
}

type queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readPreferences(ctx context.Context, q queryer, userID string) (PreferencesState, error) {
	state := PreferencesState{Preferences: DefaultPreferences()}
	var data string
	err := q.QueryRowContext(ctx, `SELECT preferences_json,revision FROM user_preferences WHERE user_id=?`, userID).Scan(&data, &state.Revision)
	if errors.Is(err, sql.ErrNoRows) {
		return state, nil
	}
	if err != nil {
		return state, err
	}
	state.Initialized = true
	err = json.Unmarshal([]byte(data), &state.Preferences)
	return state, err
}
func (s *Service) Preferences(ctx context.Context, userID string) (PreferencesState, error) {
	return readPreferences(ctx, s.db, userID)
}
func (s *Service) PatchPreferences(ctx context.Context, userID string, patch PreferencesPatch, onlyIfAbsent bool) (PreferencesState, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return PreferencesState{}, err
	}
	defer tx.Rollback()
	state, err := readPreferences(ctx, tx, userID)
	if err != nil {
		return state, err
	}
	if onlyIfAbsent && state.Initialized {
		return state, core.ErrConflict
	}
	p := &state.Preferences
	if patch.FontSize != nil {
		p.FontSize = *patch.FontSize
	}
	if patch.LineHeight != nil {
		p.LineHeight = *patch.LineHeight
	}
	if patch.ContentWidth != nil {
		p.ContentWidth = *patch.ContentWidth
	}
	if patch.CodeLineNumbers != nil {
		p.CodeLineNumbers = *patch.CodeLineNumbers
	}
	if patch.AutoPair != nil {
		p.AutoPair = *patch.AutoPair
	}
	if patch.FocusMode != nil {
		p.FocusMode = *patch.FocusMode
	}
	if patch.TypewriterMode != nil {
		p.TypewriterMode = *patch.TypewriterMode
	}
	if p.FontSize < 14 || p.FontSize > 22 || (p.LineHeight != 1.5 && p.LineHeight != 1.75 && p.LineHeight != 2) || (p.ContentWidth != 640 && p.ContentWidth != 760 && p.ContentWidth != 960) {
		return state, core.ErrInvalid
	}
	data, err := json.Marshal(p)
	if err != nil {
		return state, err
	}
	state.Revision++
	state.Initialized = true
	_, err = tx.ExecContext(ctx, `INSERT INTO user_preferences(user_id,preferences_json,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET preferences_json=excluded.preferences_json,revision=excluded.revision,updated_at=excluded.updated_at`, userID, string(data), state.Revision, time.Now().UTC())
	if err != nil {
		return state, err
	}
	return state, tx.Commit()
}
