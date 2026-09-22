package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
)

func TestConcurrentMarkdownJoinAndWritesDeliverCompleteOrderedState(t *testing.T) {
	f := newAccessFixture(t, "markdown")
	ctx := context.Background()
	for round := 0; round < 40; round++ {
		item, err := f.hub.core.CreateItem(ctx, f.owner.user.ID, f.space.ID, "markdown", "Concurrent join", nil)
		if err != nil {
			t.Fatal(err)
		}
		reader := &client{user: f.reader.user, sessionID: f.reader.sessionID, send: make(chan []byte, 256), rooms: map[string]struct{}{}}
		start := make(chan struct{})
		var group sync.WaitGroup
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			f.hub.handle(ctx, reader, Envelope{Type: "markdown.join", ItemID: item.ID})
		}()
		const updates = 16
		writers := make([]*client, updates)
		for i := range writers {
			writer := &client{user: f.owner.user, sessionID: f.owner.sessionID, send: make(chan []byte, 8), rooms: map[string]struct{}{}}
			writers[i] = writer
			payload := json.RawMessage(fmt.Sprintf(`{"generation":0,"clientUpdateId":"update-%d","update":"AQ=="}`, i))
			group.Add(1)
			go func() {
				defer group.Done()
				<-start
				f.hub.handle(ctx, writer, Envelope{Type: "markdown.update", ItemID: item.ID, Payload: payload})
			}()
		}
		close(start)
		group.Wait()
		seen := map[int64]bool{}
		initialized := false
		var last int64
		for _, m := range messages(reader) {
			var payload struct {
				HeadSeq int64 `json:"headSeq"`
				Seq     int64 `json:"seq"`
				Updates []struct {
					Seq int64 `json:"seq"`
				} `json:"updates"`
			}
			if err := json.Unmarshal(m.Payload, &payload); err != nil {
				t.Fatal(err)
			}
			switch m.Type {
			case "markdown.init":
				if initialized {
					t.Fatal("duplicate init")
				}
				initialized = true
				last = payload.HeadSeq
				for _, update := range payload.Updates {
					seen[update.Seq] = true
				}
			case "markdown.update.remote":
				if !initialized {
					t.Fatalf("round %d: update %d preceded init", round, payload.Seq)
				}
				if payload.Seq <= last {
					t.Fatalf("round %d: update %d followed watermark %d", round, payload.Seq, last)
				}
				last = payload.Seq
				seen[payload.Seq] = true
			case "error":
				t.Fatalf("join error: %s", m.Payload)
			}
		}
		if !initialized || len(seen) != updates {
			t.Fatalf("round %d: init=%v, delivered=%d, expected=%d", round, initialized, len(seen), updates)
		}
		for _, writer := range writers {
			got := messages(writer)
			if len(got) != 1 || got[0].Type != "markdown.update.ack" {
				t.Fatalf("write response: %v", got)
			}
		}
		f.hub.leaveItem(reader, item.ID)
	}
}

func TestConcurrentWhiteboardJoinAndWritesDeliverLatestScene(t *testing.T) {
	f := newAccessFixture(t, "whiteboard")
	ctx := context.Background()
	for round := 0; round < 20; round++ {
		item, err := f.hub.core.CreateItem(ctx, f.owner.user.ID, f.space.ID, "whiteboard", "Concurrent board join", nil)
		if err != nil {
			t.Fatal(err)
		}
		reader := &client{user: f.reader.user, sessionID: f.reader.sessionID, send: make(chan []byte, 256), rooms: map[string]struct{}{}}
		start := make(chan struct{})
		var group sync.WaitGroup
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			f.hub.handle(ctx, reader, Envelope{Type: "whiteboard.join", ItemID: item.ID})
		}()
		const updates = 16
		writers := make([]*client, updates)
		for i := range writers {
			writer := &client{user: f.owner.user, sessionID: f.owner.sessionID, send: make(chan []byte, 8), rooms: map[string]struct{}{}}
			writers[i] = writer
			payload := json.RawMessage(fmt.Sprintf(`{"baseRevision":0,"scene":{"elements":[{"id":"element-%d","version":1}]}}`, i))
			group.Add(1)
			go func() {
				defer group.Done()
				<-start
				f.hub.handle(ctx, writer, Envelope{Type: "whiteboard.scene.update", ItemID: item.ID, Payload: payload})
			}()
		}
		close(start)
		group.Wait()
		initialized := false
		var revision int64
		var ids map[string]bool
		for _, m := range messages(reader) {
			if m.Type == "error" {
				t.Fatalf("join error: %s", m.Payload)
			}
			if m.Type != "whiteboard.init" && m.Type != "whiteboard.scene.remote" {
				continue
			}
			var payload struct {
				Revision int64 `json:"revision"`
				Scene    struct {
					Elements []struct {
						ID string `json:"id"`
					} `json:"elements"`
				} `json:"scene"`
			}
			if err := json.Unmarshal(m.Payload, &payload); err != nil {
				t.Fatal(err)
			}
			if m.Type == "whiteboard.init" {
				if initialized {
					t.Fatal("duplicate init")
				}
				initialized = true
			} else if !initialized || payload.Revision <= revision {
				t.Fatalf("round %d: init=%v, revision %d followed %d", round, initialized, payload.Revision, revision)
			}
			revision = payload.Revision
			ids = map[string]bool{}
			for _, element := range payload.Scene.Elements {
				ids[element.ID] = true
			}
		}
		if !initialized || revision != updates || len(ids) != updates {
			t.Fatalf("round %d: init=%v revision=%d elements=%d", round, initialized, revision, len(ids))
		}
		for _, writer := range writers {
			got := messages(writer)
			if len(got) != 1 || got[0].Type != "whiteboard.scene.ack" {
				t.Fatalf("write response: %v", got)
			}
		}
		f.hub.leaveItem(reader, item.ID)
	}
}
