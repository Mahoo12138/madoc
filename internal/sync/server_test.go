package sync

import (
	"encoding/base64"
	"testing"
	"time"

	"madoc/internal/db"
)

func TestBuildLoadDocPayloadUsesOrderedUpdates(t *testing.T) {
	updates := []db.DocUpdate{
		{Blob: []byte{1, 2, 3}, CreatedAt: time.UnixMilli(100)},
		{Blob: []byte{4, 5, 6}, CreatedAt: time.UnixMilli(200)},
	}

	payload := buildLoadDocPayload(nil, updates)

	if payload.Missing != "" {
		t.Fatalf("multiple updates must not be concatenated into missing, got %q", payload.Missing)
	}
	if len(payload.Updates) != 2 {
		t.Fatalf("expected 2 ordered updates, got %d", len(payload.Updates))
	}
	if payload.Updates[0] != base64.StdEncoding.EncodeToString([]byte{1, 2, 3}) {
		t.Fatalf("unexpected first update: %q", payload.Updates[0])
	}
	if payload.Updates[1] != base64.StdEncoding.EncodeToString([]byte{4, 5, 6}) {
		t.Fatalf("unexpected second update: %q", payload.Updates[1])
	}
	if payload.Timestamp != 200 {
		t.Fatalf("expected latest update timestamp 200, got %d", payload.Timestamp)
	}
}

func TestBuildLoadDocPayloadKeepsSingleUpdateCompatibility(t *testing.T) {
	update := []byte{7, 8, 9}

	payload := buildLoadDocPayload(nil, []db.DocUpdate{
		{Blob: update, CreatedAt: time.UnixMilli(300)},
	})

	encoded := base64.StdEncoding.EncodeToString(update)
	if payload.Missing != encoded {
		t.Fatalf("expected missing to carry single update for compatibility, got %q", payload.Missing)
	}
	if len(payload.Updates) != 1 || payload.Updates[0] != encoded {
		t.Fatalf("expected updates to include the single update, got %#v", payload.Updates)
	}
}

func TestBuildLoadDocPayloadUsesSnapshotCompatibility(t *testing.T) {
	snapshot := []byte{10, 11, 12}
	payload := buildLoadDocPayload(&db.Snapshot{
		Blob:      snapshot,
		UpdatedAt: time.UnixMilli(400),
	}, nil)

	encoded := base64.StdEncoding.EncodeToString(snapshot)
	if payload.Snapshot != encoded {
		t.Fatalf("expected snapshot %q, got %q", encoded, payload.Snapshot)
	}
	if payload.Missing != encoded {
		t.Fatalf("expected missing to carry snapshot for compatibility, got %q", payload.Missing)
	}
	if len(payload.Updates) != 0 {
		t.Fatalf("expected no updates, got %#v", payload.Updates)
	}
	if payload.Timestamp != 400 {
		t.Fatalf("expected snapshot timestamp 400, got %d", payload.Timestamp)
	}
}
