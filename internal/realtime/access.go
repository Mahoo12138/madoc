package realtime

import (
	"context"
	"strings"
	"time"

	"madoc/internal/core"
)

// Room membership is a subscription, not a cached authorization grant. Check
// both session and current Item access before relaying any room information.
func (h *Hub) roomAccess(c *client, room string) bool {
	parts := strings.SplitN(room, ":", 2)
	if len(parts) != 2 {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.auth.Resolve(ctx, c.sessionID)
	if err != nil {
		err = core.ErrForbidden
	} else {
		_, err = h.core.ItemAccess(ctx, c.user.ID, parts[1], false)
	}
	if err == nil {
		return true
	}
	h.leaveItem(c, parts[1])
	h.coreError(c, Envelope{ItemID: parts[1]}, err)
	return false
}
