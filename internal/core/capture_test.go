package core

import (
	"errors"
	"testing"
)

func TestCaptureItemFreezesMarkdownStateAndReportsWatermarks(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Design", nil)
	if err != nil {
		t.Fatal(err)
	}
	first, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "first", []byte{1, 2}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "first projection", first, 0); err != nil {
		t.Fatal(err)
	}
	second, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "second", []byte{3, 4}, 0)
	if err != nil {
		t.Fatal(err)
	}

	capture, err := f.core.CaptureItem(f.ctx, f.owner.ID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if capture.Item.ID != doc.ID || capture.Item.Title != "Design" || capture.CapturedAt.IsZero() || capture.Markdown == nil || capture.Whiteboard != nil {
		t.Fatalf("capture metadata = %+v", capture)
	}
	state := capture.Markdown
	if state.Generation != 0 || state.CacheSeq != first || state.HeadSeq != second || state.Markdown != "first projection" || len(state.Updates) != 2 {
		t.Fatalf("markdown watermarks = %+v", state)
	}
	if string(state.Updates[0].Update) != string([]byte{1, 2}) || string(state.Updates[1].Update) != string([]byte{3, 4}) {
		t.Fatalf("captured updates = %+v", state.Updates)
	}
	if err := f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, doc.ID, second, []byte{9}, "compacted", 0); err != nil {
		t.Fatal(err)
	}
	if len(capture.Markdown.Updates) != 2 || string(capture.Markdown.Updates[1].Update) != string([]byte{3, 4}) {
		t.Fatalf("capture changed after compaction: %+v", capture.Markdown)
	}
}

func TestCaptureItemPreservesWhiteboardRevisionAndChecksAccess(t *testing.T) {
	f := newFixture(t)
	scene := `{"elements":[{"id":"element"}],"appState":{"viewBackgroundColor":"#ffffff"},"files":{"image":{"mimeType":"image/png","dataURL":"data:image/png;base64,AQ=="}}}`
	board, err := f.core.CreateWhiteboardWithScene(f.ctx, f.owner.ID, f.space.ID, "Architecture", nil, scene)
	if err != nil {
		t.Fatal(err)
	}
	updated, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, scene+" ")
	if err != nil {
		t.Fatal(err)
	}
	capture, err := f.core.CaptureItem(f.ctx, f.owner.ID, board.ID)
	if err != nil || capture.Whiteboard == nil || capture.Markdown != nil || capture.Whiteboard.Revision != updated.Revision || capture.Whiteboard.Scene != updated.Scene {
		t.Fatalf("whiteboard capture = %+v, %v", capture, err)
	}
	viewer := f.addUser("capture-viewer@example.test", "viewer")
	outsider := f.addUser("capture-outsider@example.test", "")
	if _, err := f.core.CaptureItem(f.ctx, viewer.ID, board.ID); err != nil {
		t.Fatalf("viewer capture: %v", err)
	}
	if _, err := f.core.CaptureItem(f.ctx, outsider.ID, board.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("outsider capture = %v", err)
	}
	folder := trashItem(t, f, "folder", "Folder", nil)
	if _, err := f.core.CaptureItem(f.ctx, f.owner.ID, folder.ID); !errors.Is(err, ErrInvalid) {
		t.Fatalf("folder capture = %v", err)
	}
}
