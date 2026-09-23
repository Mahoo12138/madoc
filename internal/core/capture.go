package core

import (
	"context"
	"time"
)

// ItemCapture is a read-only, transaction-consistent view of one item's saved
// content. It is a value returned to the caller, not a persisted history record.
type ItemCapture struct {
	Item       Item             `json:"item"`
	CapturedAt time.Time        `json:"capturedAt"`
	Markdown   *MarkdownState   `json:"markdown,omitempty"`
	Whiteboard *WhiteboardState `json:"whiteboard,omitempty"`
}

// CaptureItem returns one item's metadata and saved editor state from a single
// SQLite read transaction. Markdown projection freshness is reported by its
// cache and head watermarks; callers must not present a stale projection as
// current content.
func (s *Service) CaptureItem(ctx context.Context, userID, itemID string) (ItemCapture, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ItemCapture{}, err
	}
	defer tx.Rollback()

	item, err := itemAccess(ctx, tx, userID, itemID, false)
	if err != nil {
		return ItemCapture{}, err
	}
	capture := ItemCapture{Item: item, CapturedAt: time.Now().UTC()}
	switch item.Type {
	case "markdown":
		state, err := readMarkdownState(ctx, tx, item.ID)
		if err != nil {
			return ItemCapture{}, err
		}
		capture.Markdown = &state
	case "whiteboard":
		var state WhiteboardState
		if err := tx.QueryRowContext(ctx, `SELECT revision,scene_json FROM whiteboard_states WHERE item_id=?`, item.ID).Scan(&state.Revision, &state.Scene); err != nil {
			return ItemCapture{}, err
		}
		capture.Whiteboard = &state
	default:
		return ItemCapture{}, ErrInvalid
	}
	if err := tx.Commit(); err != nil {
		return ItemCapture{}, err
	}
	return capture, nil
}
