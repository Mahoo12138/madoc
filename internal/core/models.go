package core

import (
	"errors"
	"time"
)

var (
	ErrGeneration = errors.New("content generation changed")
	ErrNotFound   = errors.New("not found")
	ErrForbidden  = errors.New("forbidden")
	ErrConflict   = errors.New("conflict")
	ErrInvalid    = errors.New("invalid request")
)

type Workspace struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Member struct {
	AvatarURL *string   `json:"avatarUrl"`
	UserID    string    `json:"userId"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
}

type Invite struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	Status      string    `json:"status"`
	ExpiresAt   time.Time `json:"expiresAt"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Item struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"`
	ParentID    *string   `json:"parentId"`
	Type        string    `json:"type"`
	Title       string    `json:"title"`
	SortKey     int       `json:"sortKey"`
	CreatedBy   string    `json:"createdBy"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type MarkdownState struct {
	Generation  int64            `json:"generation"`
	Snapshot    []byte           `json:"snapshot"`
	SnapshotSeq int64            `json:"snapshotSeq"`
	Markdown    string           `json:"markdown"`
	CacheSeq    int64            `json:"cacheSeq"`
	Updates     []MarkdownUpdate `json:"updates"`
	HeadSeq     int64            `json:"headSeq"`
}

type MarkdownUpdate struct {
	Seq    int64  `json:"seq"`
	Update []byte `json:"update"`
	UserID string `json:"userId,omitempty"`
}

type WhiteboardState struct {
	Revision int64  `json:"revision"`
	Scene    string `json:"scene"`
}
