package realtime

import (
	"context"
	"encoding/json"
	"testing"
)

func TestMergeScenesReconcilesByElementVersion(t *testing.T) {
	current := []byte(`{"elements":[{"id":"a","version":2,"versionNonce":1},{"id":"b","version":1}],"appState":{"theme":"light"},"files":{"old":{"id":"old"}}}`)
	incoming := []byte(`{"elements":[{"id":"a","version":1,"versionNonce":9},{"id":"c","version":1}],"appState":{"theme":"dark"},"files":{"new":{"id":"new"}}}`)
	var result struct {
		Elements []map[string]any `json:"elements"`
		Files    map[string]any   `json:"files"`
	}
	if err := json.Unmarshal(mergeScenes(current, incoming), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Elements) != 3 || len(result.Files) != 2 {
		t.Fatalf("merged scene = %#v", result)
	}
	wantOrder := []string{"a", "c", "b"}
	for i, element := range result.Elements {
		if element["id"] != wantOrder[i] {
			t.Fatalf("element order = %#v, want %#v", result.Elements, wantOrder)
		}
	}
	for _, element := range result.Elements {
		if element["id"] == "a" && element["version"] != float64(2) {
			t.Fatalf("older incoming element won: %#v", element)
		}
	}
}

func TestWhiteboardAckIdentifiesTheSubmittedRequest(t *testing.T) {
	f := newAccessFixture(t, "whiteboard")
	f.hub.handle(context.Background(), f.owner, Envelope{
		Type: "whiteboard.scene.update", ItemID: f.item.ID, RequestID: "stable-scene-id",
		Payload: json.RawMessage(`{"baseRevision":0,"scene":{"elements":[]}}`),
	})
	got := messages(f.owner)
	if len(got) != 1 || got[0].Type != "whiteboard.scene.ack" {
		t.Fatalf("response: %v", got)
	}
	var payload struct {
		ClientUpdateID string `json:"clientUpdateId"`
		Revision       int64  `json:"revision"`
	}
	if err := json.Unmarshal(got[0].Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.ClientUpdateID != "stable-scene-id" || payload.Revision != 1 {
		t.Fatalf("ACK: %+v", payload)
	}
}
