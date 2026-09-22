package realtime

import (
	"github.com/coder/websocket"
	"madoc/internal/auth"
)

func (h *Hub) profile(c *client) auth.User {
	if user, ok := h.profiles.Load(c.user.ID); ok {
		return user.(auth.User)
	}
	return *c.user
}
func (h *Hub) RefreshUser(user auth.User) {
	h.profiles.Store(user.ID, user)
	h.mu.RLock()
	rooms := map[string]bool{}
	for c := range h.clients {
		if c.user.ID == user.ID {
			for room := range c.rooms {
				rooms[room] = true
			}
		}
	}
	h.mu.RUnlock()
	for room := range rooms {
		h.presence(room)
	}
}
func (h *Hub) RevokeOtherSessions(userID, keepSession string) {
	h.revoke(func(c *client) bool { return c.user.ID == userID && c.sessionID != keepSession })
}
func (h *Hub) RevokeSession(sessionID string) {
	h.revoke(func(c *client) bool { return c.sessionID == sessionID })
}
func (h *Hub) revoke(matches func(*client) bool) {
	h.mu.RLock()
	var targets []*client
	for c := range h.clients {
		if matches(c) {
			targets = append(targets, c)
		}
	}
	h.mu.RUnlock()
	for _, c := range targets {
		go c.conn.Close(websocket.StatusPolicyViolation, "session expired")
	}
}
