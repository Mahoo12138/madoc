package realtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"madoc/internal/auth"
	"madoc/internal/core"
	"madoc/internal/db"
)

type accessFixture struct {
	hub           *Hub
	db            *sql.DB
	owner, reader *client
	space         core.Workspace
	item          core.Item
	room          string
}

func newAccessFixture(t *testing.T, kind string) accessFixture {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Open(filepath.Join(t.TempDir(), "access.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	a := auth.New(conn)
	owner, token, err := a.SetupAdmin(ctx, "Owner", "owner@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	domain := core.New(conn)
	space, err := domain.CreateWorkspace(ctx, owner.ID, "Room")
	if err != nil {
		t.Fatal(err)
	}
	item, err := domain.CreateItem(ctx, owner.ID, space.ID, kind, "Private content", nil)
	if err != nil {
		t.Fatal(err)
	}
	// A viewer may receive content and awareness, but never persist updates.
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if _, err := conn.Exec(`INSERT INTO users(id,name,email,password_hash,created_at,updated_at) VALUES('reader','Reader','reader@example.com',?,?,?)`, hash, now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,'reader','viewer',?)`, space.ID, now); err != nil {
		t.Fatal(err)
	}
	reader, readerToken, err := a.SignIn(ctx, "reader@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	makeClient := func(user auth.User, session string) *client {
		return &client{user: &user, sessionID: session, send: make(chan []byte, 64), rooms: map[string]struct{}{}}
	}
	h := New(a, domain, false)
	f := accessFixture{h, conn, makeClient(owner, token), makeClient(reader, readerToken), space, item, kind + ":" + item.ID}
	// Register without asynchronous presence so each assertion observes exactly
	// the broadcast under test, after the database change has committed.
	h.rooms[f.room] = map[*client]struct{}{f.owner: {}, f.reader: {}}
	f.owner.rooms[f.room] = struct{}{}
	f.reader.rooms[f.room] = struct{}{}
	return f
}

func messages(c *client) []Envelope {
	var result []Envelope
	for len(c.send) > 0 {
		var message Envelope
		_ = json.Unmarshal(<-c.send, &message)
		result = append(result, message)
	}
	return result
}

func TestRoomBroadcastRechecksReadAccess(t *testing.T) {
	for _, kind := range []string{"markdown", "whiteboard"} {
		for _, reason := range []string{"removed", "expired", "disabled", "deleted"} {
			t.Run(kind+"/"+reason, func(t *testing.T) {
				f := newAccessFixture(t, kind)
				f.hub.broadcast(f.owner, f.room, "content", f.item.ID, "before")
				if got := messages(f.reader); len(got) != 1 || got[0].Type != "content" {
					t.Fatalf("authorized viewer: %v", got)
				}
				var err error
				switch reason {
				case "removed":
					err = f.hub.core.RemoveMember(context.Background(), f.owner.user.ID, f.space.ID, f.reader.user.ID)
				case "expired":
					_, err = f.db.Exec(`UPDATE sessions SET expires_at=? WHERE user_id=?`, time.Now().UTC().Add(-time.Hour), f.reader.user.ID)
				case "disabled":
					_, err = f.db.Exec(`UPDATE users SET disabled=1 WHERE id=?`, f.reader.user.ID)
				case "deleted":
					err = f.hub.core.DeleteItem(context.Background(), f.owner.user.ID, f.item.ID)
				}
				if err != nil {
					t.Fatal(err)
				}
				f.hub.broadcast(f.owner, f.room, "content", f.item.ID, "private after revocation")
				got := messages(f.reader)
				if len(got) != 1 || got[0].Type != "error" {
					t.Fatalf("revoked reader received: %v", got)
				}
				if _, joined := f.reader.rooms[f.room]; joined {
					t.Fatal("revoked reader remains subscribed")
				}
				f.hub.broadcast(f.owner, f.room, "content", f.item.ID, "later")
				if got := messages(f.reader); len(got) != 0 {
					t.Fatalf("unsubscribed reader received: %v", got)
				}
			})
		}
	}
}

func TestRevokedMemberCannotRelayPresenceOrReceiveRoster(t *testing.T) {
	for _, kind := range []string{"markdown", "whiteboard"} {
		for _, action := range []string{"awareness", "pointer", "roster"} {
			t.Run(kind+"/"+action, func(t *testing.T) {
				f := newAccessFixture(t, kind)
				if err := f.hub.core.RemoveMember(context.Background(), f.owner.user.ID, f.space.ID, f.reader.user.ID); err != nil {
					t.Fatal(err)
				}
				m := Envelope{Type: action, ItemID: f.item.ID, Payload: json.RawMessage(`{"selection":"private"}`)}
				switch action {
				case "awareness":
					f.hub.relay(f.reader, f.room, m)
				case "pointer":
					f.hub.relayWithUser(f.reader, f.room, m)
				case "roster":
					f.hub.presence(f.room)
				}
				if got := messages(f.reader); len(got) != 1 || got[0].Type != "error" {
					t.Fatalf("revoked reader: %v", got)
				}
				got := messages(f.owner)
				if action != "roster" && len(got) != 0 {
					t.Fatalf("revoked relay delivered: %v", got)
				}
				if action == "roster" {
					if len(got) != 1 {
						t.Fatalf("roster: %v", got)
					}
					var payload struct {
						Members []auth.User `json:"members"`
					}
					if err := json.Unmarshal(got[0].Payload, &payload); err != nil {
						t.Fatal(err)
					}
					if len(payload.Members) != 1 || payload.Members[0].ID != f.owner.user.ID {
						t.Fatalf("revoked member in roster: %+v", payload)
					}
				}
			})
		}
	}
}

func TestExistingConnectionCannotWriteAfterMemberChange(t *testing.T) {
	for _, role := range []string{"removed", "viewer"} {
		for _, kind := range []string{"markdown", "whiteboard"} {
			t.Run(kind+"/"+role, func(t *testing.T) {
				f := newAccessFixture(t, kind)
				ctx := context.Background()
				if err := f.hub.core.UpdateMember(ctx, f.owner.user.ID, f.space.ID, f.reader.user.ID, "editor"); err != nil {
					t.Fatal(err)
				}
				operations := []Envelope{
					{Type: "markdown.update", ItemID: f.item.ID, Payload: json.RawMessage(`{"generation":0,"clientUpdateId":"denied","update":"AQ=="}`)},
					{Type: "markdown.cache.update", ItemID: f.item.ID, Payload: json.RawMessage(`{"generation":0,"seenSeq":0,"markdown":"denied"}`)},
					{Type: "markdown.snapshot.commit", ItemID: f.item.ID, Payload: json.RawMessage(`{"generation":0,"baseSeq":0,"snapshot":"AQ==","markdown":"denied"}`)},
				}
				if kind == "whiteboard" {
					operations = []Envelope{{Type: "whiteboard.scene.update", ItemID: f.item.ID, Payload: json.RawMessage(`{"baseRevision":0,"scene":{"elements":[]}}`)}}
				}
				var err error
				if role == "removed" {
					err = f.hub.core.RemoveMember(ctx, f.owner.user.ID, f.space.ID, f.reader.user.ID)
				} else {
					err = f.hub.core.UpdateMember(ctx, f.owner.user.ID, f.space.ID, f.reader.user.ID, role)
				}
				if err != nil {
					t.Fatal(err)
				}
				for _, operation := range operations {
					f.hub.handle(ctx, f.reader, operation)
					got := messages(f.reader)
					if len(got) != 1 || got[0].Type != "error" {
						t.Fatalf("%s: %v", operation.Type, got)
					}
					var payload struct {
						Code string `json:"code"`
					}
					if err := json.Unmarshal(got[0].Payload, &payload); err != nil {
						t.Fatal(err)
					}
					if payload.Code != "FORBIDDEN" {
						t.Fatalf("%s: %s", operation.Type, payload.Code)
					}
				}
				if got := messages(f.owner); len(got) != 0 {
					t.Fatalf("denied writes were broadcast: %v", got)
				}
				if kind == "markdown" {
					state, err := f.hub.core.Markdown(ctx, f.owner.user.ID, f.item.ID)
					if err != nil || state.HeadSeq != 0 || state.Markdown != "" || len(state.Snapshot) != 0 {
						t.Fatalf("denied write changed content: %+v, %v", state, err)
					}
				} else {
					state, err := f.hub.core.Whiteboard(ctx, f.owner.user.ID, f.item.ID)
					if err != nil || state.Revision != 0 {
						t.Fatalf("denied write changed board: %+v, %v", state, err)
					}
				}
			})
		}
	}
}
