package realtime

import (
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
