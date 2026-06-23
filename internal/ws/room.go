package ws

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"sync"
	"time"

	"madoc/internal/db"
)

type Room struct {
	docID string
	hub   *Hub

	mu      sync.RWMutex
	clients map[*Client]struct{}

	inbound  chan inboundMsg
	joinCh   chan *Client
	leaveCh  chan *Client
	closeCh  chan struct{}
	closeOne sync.Once

	pendingWrites int
}

type inboundMsg struct {
	from *Client
	data []byte
}

func newRoom(docID string, hub *Hub) *Room {
	return &Room{
		docID:   docID,
		hub:     hub,
		clients: make(map[*Client]struct{}),
		inbound: make(chan inboundMsg, 256),
		joinCh:  make(chan *Client, 8),
		leaveCh: make(chan *Client, 8),
		closeCh: make(chan struct{}),
	}
}

func (r *Room) join(c *Client)  { r.joinCh <- c }
func (r *Room) leave(c *Client) { r.leaveCh <- c }

func (r *Room) deliver(from *Client, data []byte) {
	select {
	case r.inbound <- inboundMsg{from: from, data: data}:
	default:
		log.Printf("room %s inbound full, dropping message", r.docID)
	}
}

func (r *Room) run() {
	defer r.closeOne.Do(func() { close(r.closeCh) })
	idleTimer := time.NewTimer(time.Hour)
	idleTimer.Stop()
	for {
		select {
		case c := <-r.joinCh:
			r.mu.Lock()
			r.clients[c] = struct{}{}
			n := len(r.clients)
			r.mu.Unlock()
			if n == 1 {
				idleTimer.Stop()
				if cnt, err := r.hub.repo.CountUpdates(context.Background(), r.docID); err == nil {
					r.pendingWrites = cnt
				}
			}
			r.sendInitTo(c)
			if r.pendingWrites >= r.hub.compactThreshold {
				r.pendingWrites = 0
				r.requestSnapshot()
			}

		case c := <-r.leaveCh:
			r.mu.Lock()
			delete(r.clients, c)
			n := len(r.clients)
			r.mu.Unlock()
			close(c.send)
			if n == 0 {
				idleTimer.Reset(5 * time.Second)
			}

		case msg := <-r.inbound:
			r.handleInbound(msg)

		case <-idleTimer.C:
			r.mu.RLock()
			empty := len(r.clients) == 0
			r.mu.RUnlock()
			if empty {
				r.hub.removeRoom(r.docID)
				return
			}
		}
	}
}

func (r *Room) handleInbound(msg inboundMsg) {
	var env Envelope
	if err := json.Unmarshal(msg.data, &env); err != nil {
		log.Printf("room %s: bad envelope: %v", r.docID, err)
		return
	}
	if env.Channel != "doc" {
		return
	}
	var typ DocPayloadType
	if err := json.Unmarshal(env.Payload, &typ); err != nil {
		return
	}
	switch typ.Type {
	case "update":
		var p DocUpdatePayload
		if err := json.Unmarshal(env.Payload, &p); err != nil {
			log.Printf("room %s: bad update: %v", r.docID, err)
			return
		}
		blob := intsToBytes(p.Updates)
		if _, err := r.hub.repo.AppendUpdate(context.Background(), r.docID, blob); err != nil {
			log.Printf("room %s: append update: %v", r.docID, err)
		}
		r.broadcast(msg.from, msg.data)
		r.pendingWrites++
		if r.pendingWrites >= r.hub.compactThreshold {
			r.pendingWrites = 0
			r.requestSnapshot()
		}

	case "snapshot":
		var p DocSnapshotPayload
		if err := json.Unmarshal(env.Payload, &p); err != nil {
			return
		}
		snap := intsToBytes(p.Snapshot)
		ctx := context.Background()
		if err := r.hub.repo.SaveSnapshot(ctx, r.docID, snap); err != nil {
			log.Printf("room %s: save snapshot: %v", r.docID, err)
			return
		}
		ups, err := r.hub.repo.ListUpdates(ctx, r.docID)
		if err != nil || len(ups) == 0 {
			return
		}
		maxID := ups[len(ups)-1].ID
		if err := r.hub.repo.DeleteUpdatesUpTo(ctx, r.docID, maxID); err != nil {
			log.Printf("room %s: delete updates: %v", r.docID, err)
		}
	}
}

func (r *Room) broadcast(except *Client, data []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for c := range r.clients {
		if c == except {
			continue
		}
		select {
		case c.send <- data:
		default:
			log.Printf("room %s: client send buffer full, dropping", r.docID)
		}
	}
}

func (r *Room) sendInitTo(c *Client) {
	ctx := context.Background()
	snap, err := r.hub.repo.GetSnapshot(ctx, r.docID)
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		log.Printf("room %s: load snapshot: %v", r.docID, err)
	}
	if len(snap) > 0 {
		data, err := encodeUpdate(r.docID, snap)
		if err == nil {
			select {
			case c.send <- data:
			default:
			}
		}
	}
	ups, err := r.hub.repo.ListUpdates(ctx, r.docID)
	if err != nil {
		log.Printf("room %s: list updates: %v", r.docID, err)
		return
	}
	for _, u := range ups {
		data, err := encodeUpdate(r.docID, u.Bytes)
		if err != nil {
			continue
		}
		select {
		case c.send <- data:
		default:
			log.Printf("room %s: send buffer full during init", r.docID)
			return
		}
	}
}

func (r *Room) requestSnapshot() {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for c := range r.clients {
		data, err := encodeSnapshotRequest(r.docID)
		if err != nil {
			return
		}
		select {
		case c.send <- data:
			return
		default:
		}
	}
}
