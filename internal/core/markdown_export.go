package core

import (
	"context"
	"errors"
)

var ErrMarkdownExportPending = errors.New("markdown projection is behind the requested content")

type MarkdownExportTarget struct {
	Generation int64
	MinSeq     int64
}

func (s *Service) ExportMarkdown(ctx context.Context, userID, itemID string, target *MarkdownExportTarget) (MarkdownState, error) {
	state, err := s.Markdown(ctx, userID, itemID)
	if err != nil {
		return MarkdownState{}, err
	}
	required := state.HeadSeq
	if target != nil {
		if target.Generation < 0 || target.MinSeq < 0 {
			return MarkdownState{}, ErrInvalid
		}
		if target.Generation != state.Generation {
			return MarkdownState{}, ErrGeneration
		}
		required = target.MinSeq
	}
	if state.CacheSeq < required || state.CacheSeq > state.HeadSeq {
		return MarkdownState{}, ErrMarkdownExportPending
	}
	return state, nil
}
