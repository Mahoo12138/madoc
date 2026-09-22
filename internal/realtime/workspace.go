package realtime

import (
	"context"
	"encoding/json"
	"time"
)

// A connection watches at most one Workspace, independently of content rooms.
// The acknowledgement is itself an invalidation: clients fetch REST state only
// after it arrives and repeat this process on every reconnect.
func (h *Hub) watchWorkspace(ctx context.Context, c *client, m Envelope) {
	var p struct {
		WorkspaceID string `json:"workspaceId"`
	}
	if json.Unmarshal(m.Payload, &p) != nil || p.WorkspaceID == "" {
		h.sendError(c, m.RequestID, "INVALID_REQUEST", "workspaceId is required")
		return
	}
	if _, err := h.core.GetWorkspace(ctx, c.user.ID, p.WorkspaceID); err != nil {
		h.coreError(c, m, err)
		return
	}
	h.mu.Lock()
	c.workspaceID = p.WorkspaceID
	h.mu.Unlock()
	// Recheck after registration so a concurrent removal cannot leave a stale
	// authorized subscription between the initial lookup and registration.
	h.workspaceChanged(c, p.WorkspaceID)
}

func (h *Hub) workspaceChanged(c *client, workspaceID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.auth.Resolve(ctx, c.sessionID)
	if err == nil {
		_, err = h.core.GetWorkspace(ctx, c.user.ID, workspaceID)
	}
	h.mu.Lock()
	watching := c.workspaceID == workspaceID
	if watching && err != nil {
		c.workspaceID = ""
	}
	h.mu.Unlock()
	if !watching {
		return
	}
	kind := "workspace.changed"
	if err != nil {
		kind = "workspace.unavailable"
	}
	h.send(c, kind, "", map[string]string{"workspaceId": workspaceID})
}

// NotifyWorkspace is called only after a successful metadata transaction. The
// event contains no names, contents or role snapshots; REST remains authoritative.
// Missed events need no replay: watch/reconnect always invalidates the snapshot.
func (h *Hub) NotifyWorkspace(workspaceID string) {
	h.mu.RLock()
	targets := make(map[*client][]string, len(h.clients))
	for c := range h.clients {
		targets[c] = nil
		for room := range c.rooms {
			targets[c] = append(targets[c], room)
		}
	}
	h.mu.RUnlock()
	for c, rooms := range targets {
		// Also covers old content-only clients and deleted descendants whose Item
		// can no longer be looked up to discover its former Workspace.
		for _, room := range rooms {
			h.roomAccess(c, room)
		}
		h.workspaceChanged(c, workspaceID)
	}
}
