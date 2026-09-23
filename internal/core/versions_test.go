package core

import (
	"errors"
	"testing"
)

func TestManualMarkdownVersionSurvivesCompactionAndEnforcesAccess(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	if err != nil {
		t.Fatal(err)
	}
	seq1, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "client-1", []byte{1, 2}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "old text", seq1, 0); err != nil {
		t.Fatal(err)
	}
	version, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, doc.ID, "Before rewrite", nil)
	if err != nil {
		t.Fatal(err)
	}
	if version.HeadSeq == nil || *version.HeadSeq != seq1 {
		t.Fatalf("captured head = %#v; want %d", version.HeadSeq, seq1)
	}
	seq2, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "client-2", []byte{3, 4}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "new text", seq2, 0); err != nil {
		t.Fatal(err)
	}
	if err := f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, doc.ID, seq2, []byte{9, 8, 7}, "new text", 0); err != nil {
		t.Fatal(err)
	}
	detail, err := f.core.GetContentVersion(f.ctx, f.owner.ID, doc.ID, version.ID)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Markdown == nil || detail.Markdown.Markdown != "old text" || detail.Markdown.SnapshotSeq != 0 || detail.Markdown.HeadSeq != seq1 || len(detail.Markdown.Updates) != 1 || detail.Markdown.Updates[0].Seq != seq1 {
		t.Fatalf("historical Markdown changed after compaction: %#v", detail.Markdown)
	}
	viewer := f.addUser("versions-viewer@example.com", "viewer")
	if _, err := f.core.ListContentVersions(f.ctx, viewer.ID, doc.ID, "", 0); err != nil {
		t.Fatalf("viewer should read version list: %v", err)
	}
	if _, err := f.core.GetContentVersion(f.ctx, viewer.ID, doc.ID, version.ID); err != nil {
		t.Fatalf("viewer should read version: %v", err)
	}
	if _, err := f.core.CreateManualVersion(f.ctx, viewer.ID, doc.ID, "Denied", nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer create error = %v", err)
	}
	outsider := f.addUser("versions-outsider@example.com", "")
	if _, err := f.core.GetContentVersion(f.ctx, outsider.ID, doc.ID, version.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("outsider read error = %v", err)
	}
}

func TestManualVersionRejectsStaleProjectionAndInvalidTargets(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "client-1", []byte{1}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, doc.ID, "stale", nil); !errors.Is(err, ErrMarkdownExportPending) {
		t.Fatalf("stale projection error = %v", err)
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM item_versions WHERE item_id=?`, doc.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("partial version persisted: count=%d err=%v", count, err)
	}
	folder, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "folder", "Folder", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct{ itemID, label string }{{doc.ID, "  "}, {folder.ID, "Folder"}} {
		if _, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, test.itemID, test.label, nil); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid version target/label error = %v", err)
		}
	}
}

func TestManualWhiteboardVersionIsImmutable(t *testing.T) {
	f := newFixture(t)
	board, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "whiteboard", "Board", nil)
	if err != nil {
		t.Fatal(err)
	}
	first := `{"elements":[{"id":"first"}],"appState":{},"files":{}}`
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, first); err != nil {
		t.Fatal(err)
	}
	version, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, board.ID, "Initial", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 1, `{"elements":[],"appState":{},"files":{}}`); err != nil {
		t.Fatal(err)
	}
	detail, err := f.core.GetContentVersion(f.ctx, f.owner.ID, board.ID, version.ID)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Whiteboard == nil || detail.Whiteboard.Revision != 1 || detail.Whiteboard.Scene != first {
		t.Fatalf("whiteboard history changed: %#v", detail.Whiteboard)
	}
}
