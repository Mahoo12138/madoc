package core

import (
	"errors"
	"testing"
)

func TestCreateInitialWhiteboardIsAtomicAndPermissionChecked(t *testing.T) {
	f := newFixture(t)
	scene := `{"elements":[{"id":"element-1"}],"appState":{"viewBackgroundColor":"#ffffff"},"files":{"image-1":{"mimeType":"image/png","dataURL":"data:image/png;base64,AQ=="}}}`
	folder := trashItem(t, f, "folder", "Destination", nil)
	board, err := f.core.CreateWhiteboardWithScene(f.ctx, f.owner.ID, f.space.ID, "Imported", &folder.ID, scene)
	if err != nil {
		t.Fatal(err)
	}
	state, err := f.core.Whiteboard(f.ctx, f.owner.ID, board.ID)
	if err != nil || state.Revision != 0 || state.Scene != scene {
		t.Fatalf("initial: %+v %v", state, err)
	}
	viewer := f.addUser("whiteboard-import-viewer@example.test", "viewer")
	if _, err := f.core.CreateWhiteboardWithScene(f.ctx, viewer.ID, f.space.ID, "Denied", nil, scene); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	for _, invalid := range []string{"null", `[]`, `{"elements":[],"appState":{}}`, `{"elements":{},"appState":{},"files":{}}`} {
		if _, err := f.core.CreateWhiteboardWithScene(f.ctx, f.owner.ID, f.space.ID, "Invalid", nil, invalid); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid scene %s: %v", invalid, err)
		}
	}
	missingParent := "missing"
	if _, err := f.core.CreateWhiteboardWithScene(f.ctx, f.owner.ID, f.space.ID, "Invalid parent", &missingParent, scene); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`CREATE TRIGGER fail_initial_whiteboard BEFORE INSERT ON whiteboard_states BEGIN SELECT RAISE(ABORT,'fail'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.CreateWhiteboardWithScene(f.ctx, f.owner.ID, f.space.ID, "Rolled back", nil, scene); err == nil {
		t.Fatal("expected storage failure")
	}
	var count int
	if err := f.db.QueryRow(`SELECT COUNT(*) FROM items WHERE title='Rolled back'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("partial item: %d %v", count, err)
	}
}
