package realtime

import (
	"context"
	"encoding/json"
	"testing"
)

func watchMessage(workspaceID string) Envelope {
	payload, _ := json.Marshal(map[string]string{"workspaceId": workspaceID})
	return Envelope{Type: "workspace.watch", RequestID: "watch", Payload: payload}
}

func TestWorkspaceWatchAuthorizationAndIsolation(t *testing.T) {
	f := newAccessFixture(t, "markdown")
	ctx := context.Background()
	f.hub.clients[f.reader] = struct{}{}
	f.hub.handle(ctx, f.reader, watchMessage(f.space.ID))
	if got := messages(f.reader); len(got) != 1 || got[0].Type != "workspace.changed" {
		t.Fatalf("watch: %v", got)
	}
	other, err := f.hub.core.CreateWorkspace(ctx, f.owner.user.ID, "Other")
	if err != nil {
		t.Fatal(err)
	}
	f.hub.NotifyWorkspace(other.ID)
	if got := messages(f.reader); len(got) != 0 {
		t.Fatalf("cross-workspace event: %v", got)
	}
	f.hub.handle(ctx, f.reader, watchMessage(other.ID))
	if got := messages(f.reader); len(got) != 1 || got[0].Type != "error" {
		t.Fatalf("unauthorized watch: %v", got)
	}
	if f.reader.workspaceID != f.space.ID {
		t.Fatal("failed watch changed subscription")
	}
	f.hub.NotifyWorkspace(f.space.ID)
	if got := messages(f.reader); len(got) != 1 || got[0].Type != "workspace.changed" {
		t.Fatalf("authorized invalidation: %v", got)
	}
	f.hub.handle(ctx, f.reader, Envelope{Type: "workspace.unwatch"})
	f.hub.NotifyWorkspace(f.space.ID)
	if got := messages(f.reader); len(got) != 0 {
		t.Fatalf("unwatch: %v", got)
	}
}

func TestWorkspaceNotificationRechecksPermissionAndLeavesDeletedRooms(t *testing.T) {
	for _, kind := range []string{"markdown", "whiteboard"} {
		t.Run(kind, func(t *testing.T) {
			f := newAccessFixture(t, kind)
			ctx := context.Background()
			f.hub.clients[f.reader] = struct{}{}
			f.hub.handle(ctx, f.reader, watchMessage(f.space.ID))
			messages(f.reader)
			if err := f.hub.core.DeleteItem(ctx, f.owner.user.ID, f.item.ID); err != nil {
				t.Fatal(err)
			}
			f.hub.NotifyWorkspace(f.space.ID)
			got := messages(f.reader)
			if len(got) != 2 || got[0].Type != "error" || got[1].Type != "workspace.changed" {
				t.Fatalf("deleted content: %v", got)
			}
			if len(f.reader.rooms) != 0 {
				t.Fatal("deleted room still subscribed")
			}
			if err := f.hub.core.RemoveMember(ctx, f.owner.user.ID, f.space.ID, f.reader.user.ID); err != nil {
				t.Fatal(err)
			}
			f.hub.NotifyWorkspace(f.space.ID)
			got = messages(f.reader)
			if len(got) != 1 || got[0].Type != "workspace.unavailable" {
				t.Fatalf("revocation: %v", got)
			}
			if f.reader.workspaceID != "" {
				t.Fatal("revoked workspace still watched")
			}
			f.hub.NotifyWorkspace(f.space.ID)
			if got := messages(f.reader); len(got) != 0 {
				t.Fatalf("event after revocation: %v", got)
			}
		})
	}
}

func TestWorkspaceNotificationRechecksSession(t *testing.T) {
	f := newAccessFixture(t, "markdown")
	f.hub.clients[f.reader] = struct{}{}
	f.hub.handle(context.Background(), f.reader, watchMessage(f.space.ID))
	messages(f.reader)
	f.reader.sessionID = "expired"
	f.hub.NotifyWorkspace(f.space.ID)
	got := messages(f.reader)
	if len(got) != 2 || got[1].Type != "workspace.unavailable" {
		t.Fatalf("expired session: %v", got)
	}
	if f.reader.workspaceID != "" || len(f.reader.rooms) != 0 {
		t.Fatal("expired subscriptions retained")
	}
}
