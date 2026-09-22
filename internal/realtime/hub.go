package realtime

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"madoc/internal/auth"
	"madoc/internal/core"
)

type Envelope struct {
	Type      string          `json:"type"`
	RequestID string          `json:"requestId,omitempty"`
	ItemID    string          `json:"itemId,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

type client struct {
	conn      *websocket.Conn
	user      *auth.User
	send      chan []byte
	rooms     map[string]struct{}
	sessionID string
}

type Hub struct {
	// The single-instance hub orders durable operations through their outgoing
	// queue writes. SQLite commit order alone does not order broadcasts or close
	// the gap between reading initial state and subscribing to the room.
	contentMu sync.Mutex
	auth      *auth.Service
	core      *core.Service
	dev       bool
	mu        sync.RWMutex
	rooms     map[string]map[*client]struct{}
	clients   map[*client]struct{}
	profiles  sync.Map
}

func New(authService *auth.Service, domain *core.Service, dev bool) *Hub {
	return &Hub{auth: authService, core: domain, dev: dev, rooms: map[string]map[*client]struct{}{}, clients: map[*client]struct{}{}}
}

func (h *Hub) Active(itemID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms["markdown:"+itemID])+len(h.rooms["whiteboard:"+itemID]) > 0
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(auth.SessionCookie)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.auth.Resolve(r.Context(), cookie.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !h.validOrigin(r) {
		http.Error(w, "invalid origin", http.StatusForbidden)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	conn.SetReadLimit(5 << 20)
	c := &client{conn: conn, user: user, sessionID: cookie.Value, send: make(chan []byte, 64), rooms: map[string]struct{}{}}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	if _, err := h.auth.Resolve(r.Context(), c.sessionID); err != nil {
		h.remove(c)
		_ = conn.Close(websocket.StatusPolicyViolation, "session expired")
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	defer h.remove(c)
	defer conn.Close(websocket.StatusNormalClosure, "closed")
	go h.writer(ctx, c)
	h.send(c, "hello.ok", "", map[string]any{"user": user})
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var message Envelope
		if json.Unmarshal(data, &message) != nil {
			h.sendError(c, message.RequestID, "INVALID_MESSAGE", "invalid message")
			continue
		}
		if _, err := h.auth.Resolve(ctx, c.sessionID); err != nil {
			_ = conn.Close(websocket.StatusPolicyViolation, "session expired")
			return
		}
		h.handle(ctx, c, message)
	}
}

func (h *Hub) validOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	return h.dev && (strings.HasPrefix(u.Host, "localhost:") || strings.HasPrefix(u.Host, "127.0.0.1:"))
}

func (h *Hub) writer(ctx context.Context, c *client) {
	for {
		select {
		case data, ok := <-c.send:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.conn.Write(writeCtx, websocket.MessageText, data)
			cancel()
			if err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

func (h *Hub) handle(ctx context.Context, c *client, m Envelope) {
	switch m.Type {
	case "markdown.join", "markdown.update", "markdown.cache.update", "markdown.snapshot.commit", "whiteboard.join", "whiteboard.scene.update":
		h.contentMu.Lock()
		defer h.contentMu.Unlock()
	}
	switch m.Type {
	case "ping":
		h.send(c, "pong", m.ItemID, map[string]any{"time": time.Now().UTC()})
	case "room.leave":
		h.leaveItem(c, m.ItemID)
	case "markdown.join":
		h.markdownJoin(ctx, c, m)
	case "markdown.update":
		h.markdownUpdate(ctx, c, m)
	case "markdown.cache.update":
		h.markdownCache(ctx, c, m)
	case "markdown.snapshot.commit":
		h.markdownSnapshot(ctx, c, m)
	case "markdown.awareness":
		h.relay(c, "markdown:"+m.ItemID, m)
	case "whiteboard.join":
		h.whiteboardJoin(ctx, c, m)
	case "whiteboard.scene.update":
		h.whiteboardUpdate(ctx, c, m)
	case "whiteboard.pointer", "whiteboard.presence":
		h.relayWithUser(c, "whiteboard:"+m.ItemID, m)
	default:
		h.sendError(c, m.RequestID, "UNKNOWN_TYPE", "unknown message type")
	}
}

func (h *Hub) markdownJoin(ctx context.Context, c *client, m Envelope) {
	state, err := h.core.Markdown(ctx, c.user.ID, m.ItemID)
	if err != nil {
		h.coreError(c, m, err)
		return
	}
	h.join(c, "markdown:"+m.ItemID)
	updates := make([]map[string]any, 0, len(state.Updates))
	for _, u := range state.Updates {
		updates = append(updates, map[string]any{"seq": u.Seq, "update": base64.StdEncoding.EncodeToString(u.Update), "userId": u.UserID})
	}
	var snapshot any
	if len(state.Snapshot) > 0 {
		snapshot = base64.StdEncoding.EncodeToString(state.Snapshot)
	}
	h.send(c, "markdown.init", m.ItemID, map[string]any{"snapshot": snapshot, "snapshotSeq": state.SnapshotSeq, "updates": updates, "headSeq": state.HeadSeq, "markdown": state.Markdown, "generation": state.Generation})
}

func (h *Hub) markdownUpdate(ctx context.Context, c *client, m Envelope) {
	var p struct {
		ClientUpdateID, Update string
		Generation             *int64
	}
	if json.Unmarshal(m.Payload, &p) != nil {
		h.sendError(c, m.RequestID, "INVALID_PAYLOAD", "invalid payload")
		return
	}
	if p.Generation == nil {
		h.sendError(c, m.RequestID, "GENERATION_REQUIRED", "refresh this page before editing")
		return
	}
	blob, err := base64.StdEncoding.DecodeString(p.Update)
	if err != nil || len(blob) > 1<<20 {
		h.sendError(c, m.RequestID, "INVALID_UPDATE", "invalid update")
		return
	}
	seq, err := h.core.AppendMarkdownUpdate(ctx, c.user.ID, m.ItemID, p.ClientUpdateID, blob, *p.Generation)
	if err != nil {
		h.coreError(c, m, err)
		return
	}
	h.send(c, "markdown.update.ack", m.ItemID, map[string]any{"clientUpdateId": p.ClientUpdateID, "seq": seq, "generation": *p.Generation})
	h.broadcast(c, "markdown:"+m.ItemID, "markdown.update.remote", m.ItemID, map[string]any{"seq": seq, "update": p.Update, "userId": c.user.ID, "generation": *p.Generation})
	count, bytes, _ := h.core.MarkdownUpdateStats(ctx, m.ItemID)
	if count >= 200 || bytes >= 4<<20 {
		h.send(c, "markdown.snapshot.request", m.ItemID, map[string]any{"baseSeq": seq, "generation": *p.Generation})
	}
}

func (h *Hub) markdownCache(ctx context.Context, c *client, m Envelope) {
	var p struct {
		Markdown   string
		Generation *int64
		SeenSeq    int64
	}
	if json.Unmarshal(m.Payload, &p) != nil {
		h.sendError(c, m.RequestID, "INVALID_PAYLOAD", "invalid payload")
		return
	}
	if p.Generation == nil {
		h.sendError(c, m.RequestID, "GENERATION_REQUIRED", "refresh this page before editing")
		return
	}
	if err := h.core.UpdateMarkdownCache(ctx, c.user.ID, m.ItemID, p.Markdown, p.SeenSeq, *p.Generation); err != nil {
		h.coreError(c, m, err)
		return
	}
	h.send(c, "markdown.cache.ack", m.ItemID, map[string]any{"seenSeq": p.SeenSeq, "generation": *p.Generation})
}

func (h *Hub) markdownSnapshot(ctx context.Context, c *client, m Envelope) {
	var p struct {
		Generation         *int64
		BaseSeq            int64
		Snapshot, Markdown string
	}
	if json.Unmarshal(m.Payload, &p) != nil {
		h.sendError(c, m.RequestID, "INVALID_PAYLOAD", "invalid payload")
		return
	}
	if p.Generation == nil {
		h.sendError(c, m.RequestID, "GENERATION_REQUIRED", "refresh this page before editing")
		return
	}
	snapshot, err := base64.StdEncoding.DecodeString(p.Snapshot)
	if err != nil {
		h.sendError(c, m.RequestID, "INVALID_SNAPSHOT", "invalid snapshot")
		return
	}
	if err := h.core.CommitMarkdownSnapshot(ctx, c.user.ID, m.ItemID, p.BaseSeq, snapshot, p.Markdown, *p.Generation); err != nil {
		h.coreError(c, m, err)
		return
	}
	h.send(c, "markdown.snapshot.ack", m.ItemID, map[string]any{"baseSeq": p.BaseSeq, "generation": *p.Generation})
}

func (h *Hub) whiteboardJoin(ctx context.Context, c *client, m Envelope) {
	state, err := h.core.Whiteboard(ctx, c.user.ID, m.ItemID)
	if err != nil {
		h.coreError(c, m, err)
		return
	}
	h.join(c, "whiteboard:"+m.ItemID)
	var scene any
	_ = json.Unmarshal([]byte(state.Scene), &scene)
	h.send(c, "whiteboard.init", m.ItemID, map[string]any{"revision": state.Revision, "scene": scene})
}

func (h *Hub) whiteboardUpdate(ctx context.Context, c *client, m Envelope) {
	var p struct {
		BaseRevision int64           `json:"baseRevision"`
		Scene        json.RawMessage `json:"scene"`
	}
	if json.Unmarshal(m.Payload, &p) != nil || !json.Valid(p.Scene) {
		h.sendError(c, m.RequestID, "INVALID_PAYLOAD", "invalid payload")
		return
	}
	state, err := h.core.UpdateWhiteboard(ctx, c.user.ID, m.ItemID, p.BaseRevision, string(p.Scene))
	if errors.Is(err, core.ErrConflict) {
		current, getErr := h.core.Whiteboard(ctx, c.user.ID, m.ItemID)
		if getErr != nil {
			h.coreError(c, m, getErr)
			return
		}
		merged := mergeScenes([]byte(current.Scene), p.Scene)
		state, err = h.core.UpdateWhiteboard(ctx, c.user.ID, m.ItemID, current.Revision, string(merged))
	}
	if err != nil {
		h.coreError(c, m, err)
		return
	}
	h.send(c, "whiteboard.scene.ack", m.ItemID, map[string]any{"revision": state.Revision, "clientUpdateId": m.RequestID})
	var scene any
	_ = json.Unmarshal([]byte(state.Scene), &scene)
	h.broadcast(c, "whiteboard:"+m.ItemID, "whiteboard.scene.remote", m.ItemID, map[string]any{"revision": state.Revision, "scene": scene, "userId": c.user.ID})
}

func mergeScenes(current, incoming []byte) []byte {
	type scene struct {
		Elements []map[string]any `json:"elements"`
		AppState map[string]any   `json:"appState"`
		Files    map[string]any   `json:"files"`
	}
	var a, b scene
	if json.Unmarshal(current, &a) != nil {
		return incoming
	}
	if json.Unmarshal(incoming, &b) != nil {
		return current
	}
	byID := map[string]map[string]any{}
	currentOrder := make([]string, 0, len(a.Elements))
	for _, e := range a.Elements {
		if id, _ := e["id"].(string); id != "" {
			byID[id] = e
			currentOrder = append(currentOrder, id)
		}
	}
	incomingOrder := make([]string, 0, len(b.Elements))
	for _, e := range b.Elements {
		id, _ := e["id"].(string)
		if id == "" {
			continue
		}
		incomingOrder = append(incomingOrder, id)
		old := byID[id]
		if old == nil || number(e["version"]) > number(old["version"]) || (number(e["version"]) == number(old["version"]) && number(e["versionNonce"]) > number(old["versionNonce"])) {
			byID[id] = e
		}
	}
	b.Elements = b.Elements[:0]
	added := map[string]bool{}
	for _, id := range append(incomingOrder, currentOrder...) {
		if !added[id] {
			b.Elements = append(b.Elements, byID[id])
			added[id] = true
		}
	}
	if b.Files == nil {
		b.Files = map[string]any{}
	}
	for id, file := range a.Files {
		if _, ok := b.Files[id]; !ok {
			b.Files[id] = file
		}
	}
	out, err := json.Marshal(b)
	if err != nil {
		return current
	}
	return out
}
func number(v any) float64 { n, _ := v.(float64); return n }

func (h *Hub) join(c *client, room string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = map[*client]struct{}{}
	}
	h.rooms[room][c] = struct{}{}
	c.rooms[room] = struct{}{}
	go h.presence(room)
}
func (h *Hub) leaveItem(c *client, itemID string) {
	h.mu.Lock()
	for _, prefix := range []string{"markdown:", "whiteboard:"} {
		room := prefix + itemID
		delete(h.rooms[room], c)
		delete(c.rooms, room)
		if len(h.rooms[room]) == 0 {
			delete(h.rooms, room)
		}
	}
	h.mu.Unlock()
}
func (h *Hub) remove(c *client) {
	h.mu.Lock()
	rooms := make([]string, 0, len(c.rooms))
	for room := range c.rooms {
		delete(h.rooms[room], c)
		rooms = append(rooms, room)
		if len(h.rooms[room]) == 0 {
			delete(h.rooms, room)
		}
	}
	delete(h.clients, c)
	h.mu.Unlock()
	for _, room := range rooms {
		h.presence(room)
	}
}
func (h *Hub) presence(room string) {
	h.mu.RLock()
	targets := make([]*client, 0, len(h.rooms[room]))
	for c := range h.rooms[room] {
		targets = append(targets, c)
	}
	h.mu.RUnlock()
	members := []map[string]any{}
	authorized := targets[:0]
	for _, c := range targets {
		if h.roomAccess(c, room) {
			authorized = append(authorized, c)
			members = append(members, map[string]any{"id": c.user.ID, "name": h.profile(c).Name, "avatarUrl": h.profile(c).AvatarURL})
		}
	}
	parts := strings.SplitN(room, ":", 2)
	for _, c := range authorized {
		h.send(c, "presence.changed", parts[1], map[string]any{"room": parts[0], "members": members})
	}
}
func (h *Hub) relay(sender *client, room string, m Envelope) {
	h.mu.RLock()
	_, joined := sender.rooms[room]
	h.mu.RUnlock()
	if !joined || !h.roomAccess(sender, room) {
		return
	}
	var payload any
	_ = json.Unmarshal(m.Payload, &payload)
	h.broadcast(sender, room, m.Type, m.ItemID, payload)
}
func (h *Hub) relayWithUser(sender *client, room string, m Envelope) {
	h.mu.RLock()
	_, joined := sender.rooms[room]
	h.mu.RUnlock()
	if !joined || !h.roomAccess(sender, room) {
		return
	}
	payload := map[string]any{}
	_ = json.Unmarshal(m.Payload, &payload)
	payload["userId"] = sender.user.ID
	payload["userName"] = h.profile(sender).Name
	h.broadcast(sender, room, m.Type, m.ItemID, payload)
}
func (h *Hub) broadcast(sender *client, room, messageType, itemID string, payload any) {
	data, _ := json.Marshal(map[string]any{"type": messageType, "itemId": itemID, "payload": payload})
	h.mu.RLock()
	targets := make([]*client, 0, len(h.rooms[room]))
	for c := range h.rooms[room] {
		if c != sender {
			targets = append(targets, c)
		}
	}
	h.mu.RUnlock()
	for _, c := range targets {
		if !h.roomAccess(c, room) {
			continue
		}
		select {
		case c.send <- data:
		default:
			go c.conn.Close(websocket.StatusPolicyViolation, "slow client")
		}
	}
}
func (h *Hub) send(c *client, messageType, itemID string, payload any) {
	data, _ := json.Marshal(map[string]any{"type": messageType, "itemId": itemID, "payload": payload})
	select {
	case c.send <- data:
	default:
		go c.conn.Close(websocket.StatusPolicyViolation, "slow client")
	}
}
func (h *Hub) sendError(c *client, requestID, code, message string) {
	data, _ := json.Marshal(map[string]any{"type": "error", "requestId": requestID, "payload": map[string]string{"code": code, "message": message}})
	select {
	case c.send <- data:
	default:
	}
}
func (h *Hub) coreError(c *client, m Envelope, err error) {
	code := "INTERNAL"
	message := "internal error"
	if errors.Is(err, core.ErrGeneration) {
		code, message = "GENERATION_CHANGED", "content was replaced; keep a local copy before reloading"
	} else if errors.Is(err, core.ErrForbidden) {
		code, message = "FORBIDDEN", "operation is not allowed"
	} else if errors.Is(err, core.ErrNotFound) {
		code, message = "NOT_FOUND", "item not found"
	} else if errors.Is(err, core.ErrConflict) {
		code, message = "CONFLICT", "state conflict"
	} else if errors.Is(err, core.ErrInvalid) {
		code, message = "INVALID_REQUEST", "invalid request"
	}
	h.sendError(c, m.RequestID, code, message)
}

func (h *Hub) Close(ctx context.Context) error {
	h.mu.RLock()
	clients := make([]*client, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.RUnlock()
	for _, c := range clients {
		_ = c.conn.Close(websocket.StatusGoingAway, "server shutting down")
	}
	return nil
}
