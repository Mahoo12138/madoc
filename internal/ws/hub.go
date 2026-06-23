package ws

import (
	"context"
	"sync"

	"madoc/internal/db"
)

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
	repo  *db.Repo

	compactThreshold int
}

func NewHub(repo *db.Repo) *Hub {
	return &Hub{
		rooms:            make(map[string]*Room),
		repo:             repo,
		compactThreshold: 100,
	}
}

func (h *Hub) getOrCreate(docID string) *Room {
	h.mu.RLock()
	r, ok := h.rooms[docID]
	h.mu.RUnlock()
	if ok {
		return r
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if r, ok = h.rooms[docID]; ok {
		return r
	}
	r = newRoom(docID, h)
	h.rooms[docID] = r
	go r.run()
	return r
}

func (h *Hub) Join(ctx context.Context, docID string, c *Client) {
	r := h.getOrCreate(docID)
	r.join(c)
	go c.readLoop(ctx, r)
	c.writeLoop(ctx)
	r.leave(c)
}

func (h *Hub) removeRoom(docID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, docID)
}
