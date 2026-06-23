package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"madoc/internal/db"
)

func newTestHub(t *testing.T) *Hub {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return NewHub(db.NewRepo(conn))
}

func runWSServer(t *testing.T, hub *Hub) (*httptest.Server, string) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := NewClient(w, r)
		if err != nil {
			return
		}
		docID := strings.TrimPrefix(r.URL.Path, "/ws/")
		hub.Join(context.Background(), docID, c)
	}))
	t.Cleanup(srv.Close)
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/d1"
	return srv, wsURL
}

func dial(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { c.Close() })
	return c
}

func TestBroadcastAndPersist(t *testing.T) {
	hub := newTestHub(t)
	_, url := runWSServer(t, hub)

	a := dial(t, url)
	b := dial(t, url)

	// Let both joins propagate to room.run.
	time.Sleep(100 * time.Millisecond)

	// A sends an update; B should receive it.
	updateBytes := []byte{1, 2, 3, 4, 5}
	payload, _ := json.Marshal(DocUpdatePayload{
		Type: "update", DocID: "d1", Updates: bytesToInts(updateBytes),
	})
	env, _ := json.Marshal(Envelope{Channel: "doc", Payload: payload})
	if err := a.WriteMessage(websocket.TextMessage, env); err != nil {
		t.Fatalf("write: %v", err)
	}

	b.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := b.ReadMessage()
	if err != nil {
		t.Fatalf("b read: %v", err)
	}
	var got Envelope
	json.Unmarshal(msg, &got)
	if got.Channel != "doc" {
		t.Fatalf("expected doc channel, got %q", got.Channel)
	}
	var up DocUpdatePayload
	json.Unmarshal(got.Payload, &up)
	if string(intsToBytes(up.Updates)) != string(updateBytes) {
		t.Fatalf("update mismatch: got %v want %v", up.Updates, updateBytes)
	}

	// Wait a moment for async DB write, then verify persistence.
	time.Sleep(150 * time.Millisecond)
	ups, err := hub.repo.ListUpdates(context.Background(), "d1")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(ups) != 1 || string(ups[0].Bytes) != string(updateBytes) {
		t.Fatalf("expected 1 update with %v, got %+v", updateBytes, ups)
	}
}

func TestInitReplaysHistory(t *testing.T) {
	hub := newTestHub(t)
	repo := hub.repo
	repo.AppendUpdate(context.Background(), "d1", []byte{9, 9, 9})
	repo.AppendUpdate(context.Background(), "d1", []byte{8, 8, 8})

	_, url := runWSServer(t, hub)
	c := dial(t, url)

	var received [][]byte
	c.SetReadDeadline(time.Now().Add(1 * time.Second))
	for i := 0; i < 2; i++ {
		_, msg, err := c.ReadMessage()
		if err != nil {
			t.Fatalf("read %d: %v", i, err)
		}
		var env Envelope
		json.Unmarshal(msg, &env)
		var up DocUpdatePayload
		json.Unmarshal(env.Payload, &up)
		received = append(received, intsToBytes(up.Updates))
	}
	if len(received) != 2 || string(received[0]) != string([]byte{9, 9, 9}) || string(received[1]) != string([]byte{8, 8, 8}) {
		t.Fatalf("history replay mismatch: %v", received)
	}
}

func TestSnapshotRequestAndCompaction(t *testing.T) {
	hub := newTestHub(t)
	hub.compactThreshold = 3
	_, url := runWSServer(t, hub)
	c := dial(t, url)

	time.Sleep(100 * time.Millisecond)

	sendUpdate := func(b []byte) {
		p, _ := json.Marshal(DocUpdatePayload{Type: "update", DocID: "d1", Updates: bytesToInts(b)})
		env, _ := json.Marshal(Envelope{Channel: "doc", Payload: p})
		c.WriteMessage(websocket.TextMessage, env)
	}

	sendUpdate([]byte{1})
	sendUpdate([]byte{2})
	sendUpdate([]byte{3})

	// Expect server to push a snapshot-request after threshold (3) crossed.
	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	gotReq := false
	for !gotReq {
		_, msg, err := c.ReadMessage()
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		var env Envelope
		json.Unmarshal(msg, &env)
		var typ DocPayloadType
		json.Unmarshal(env.Payload, &typ)
		if typ.Type == "snapshot-request" {
			gotReq = true
		}
	}

	// Reply with a snapshot.
	snap := []byte{0xAA, 0xBB, 0xCC}
	p, _ := json.Marshal(DocSnapshotPayload{Type: "snapshot", DocID: "d1", Snapshot: bytesToInts(snap)})
	env, _ := json.Marshal(Envelope{Channel: "doc", Payload: p})
	c.WriteMessage(websocket.TextMessage, env)

	time.Sleep(200 * time.Millisecond)
	stored, err := hub.repo.GetSnapshot(context.Background(), "d1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if string(stored) != string(snap) {
		t.Fatalf("snapshot stored %v want %v", stored, snap)
	}
	ups, _ := hub.repo.ListUpdates(context.Background(), "d1")
	if len(ups) != 0 {
		t.Fatalf("expected updates cleared, got %d", len(ups))
	}
}
