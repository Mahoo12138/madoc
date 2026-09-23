package core

import (
	"bytes"
	"errors"
	"testing"
	"time"
)

func TestDuplicateMarkdownPreservesCanonicalStateAndIsolation(t *testing.T) {
	f := newFixture(t)
	folder := trashItem(t, f, "folder", "Parent", nil)
	source := trashItem(t, f, "markdown", "Source", &folder.ID)
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, source.ID, []byte{1, 2}, "base"); err != nil {
		t.Fatal(err)
	}
	state, _ := f.core.Markdown(f.ctx, f.owner.ID, source.ID)
	seq, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, source.ID, "original", []byte{3, 4}, state.Generation)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.DuplicateItem(f.ctx, f.owner.ID, source.ID, "Behind"); !errors.Is(err, ErrMarkdownExportPending) {
		t.Fatalf("lag: %v", err)
	}
	items, _ := f.core.ListItems(f.ctx, f.owner.ID, f.space.ID)
	if len(items) != 2 {
		t.Fatal("failed copy left an item")
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, source.ID, "complete", seq, state.Generation); err != nil {
		t.Fatal(err)
	}
	copy, err := f.core.DuplicateItem(f.ctx, f.owner.ID, source.ID, " Copy ")
	if err != nil {
		t.Fatal(err)
	}
	got, err := f.core.Markdown(f.ctx, f.owner.ID, copy.ID)
	if err != nil {
		t.Fatal(err)
	}
	if copy.ID == source.ID || copy.Title != "Copy" || copy.ParentID == nil || *copy.ParentID != folder.ID || copy.SortKey <= source.SortKey || got.Generation != 0 || got.SnapshotSeq != 0 || got.Markdown != "complete" || !bytes.Equal(got.Snapshot, []byte{1, 2}) || len(got.Updates) != 1 || !bytes.Equal(got.Updates[0].Update, []byte{3, 4}) || got.CacheSeq != got.HeadSeq || got.HeadSeq == seq {
		t.Fatalf("copy: %+v %+v", copy, got)
	}
	var sourceIDs int
	f.db.QueryRow(`SELECT count(*) FROM markdown_update_receipts WHERE item_id=? AND client_update_id='original'`, copy.ID).Scan(&sourceIDs)
	if sourceIDs != 0 {
		t.Fatal("copied source retry identity")
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, copy.ID, nil, "independent"); err != nil {
		t.Fatal(err)
	}
	original, _ := f.core.Markdown(f.ctx, f.owner.ID, source.ID)
	if original.Markdown != "complete" || original.HeadSeq != seq {
		t.Fatal("source changed")
	}
	if err := f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, source.ID, seq, []byte{5}, "complete", state.Generation); err != nil {
		t.Fatal(err)
	}
	compact, err := f.core.DuplicateItem(f.ctx, f.owner.ID, source.ID, "Compacted")
	if err != nil {
		t.Fatal(err)
	}
	after, _ := f.core.Markdown(f.ctx, f.owner.ID, compact.ID)
	if after.HeadSeq != 0 || after.CacheSeq != 0 || !bytes.Equal(after.Snapshot, []byte{5}) || len(after.Updates) != 0 {
		t.Fatalf("compacted: %+v", after)
	}
}

func TestDuplicateMarkdownRetainsSharedAssetsAfterSourcePurge(t *testing.T) {
	f := newFixture(t)
	source := trashItem(t, f, "markdown", "Source with image", nil)
	const assetID = "11111111-1111-4111-8111-111111111111"
	if _, err := f.db.Exec(`INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,sha256,storage_key,created_by,created_at) VALUES(?,?,?,'shared.png','image/png',3,'hash','shared.png',?,?)`, assetID, f.space.ID, source.ID, f.owner.ID, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, source.ID, nil, "![shared](/api/assets/"+assetID+")"); err != nil {
		t.Fatal(err)
	}
	copy, err := f.core.DuplicateItem(f.ctx, f.owner.ID, source.ID, "Copy")
	if err != nil {
		t.Fatal(err)
	}
	copyState, err := f.core.Markdown(f.ctx, f.owner.ID, copy.ID)
	if err != nil {
		t.Fatal(err)
	}
	seq, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, copy.ID, "copy-edit", []byte{1}, copyState.Generation)
	if err != nil {
		t.Fatal(err)
	}
	copyMarkdown := "![shared](/api/assets/" + assetID + ") updated"
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, copy.ID, copyMarkdown, seq, copyState.Generation); err != nil {
		t.Fatal(err)
	}
	var refs, retained int
	if err := f.db.QueryRow(`SELECT count(*) FROM item_asset_refs WHERE item_id=? AND asset_id=?`, copy.ID, assetID).Scan(&refs); err != nil || refs != 1 {
		t.Fatalf("duplicate live asset ref = %d, %v", refs, err)
	}
	if err := f.db.QueryRow(`SELECT count(*) FROM item_version_assets va JOIN item_versions v ON v.id=va.version_id WHERE v.item_id=? AND va.asset_id=? AND v.kind='automatic'`, copy.ID, assetID).Scan(&retained); err != nil || retained != 1 {
		t.Fatalf("duplicate checkpoint asset ref = %d, %v", retained, err)
	}
	if _, err := f.db.Exec(`DELETE FROM items WHERE id=?`, source.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`DELETE FROM item_versions WHERE item_id=?`, copy.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`DELETE FROM assets WHERE id=?`, assetID); err == nil {
		t.Fatal("shared attachment was deleted after source purge and checkpoint cleanup")
	}
	var itemID *string
	if err := f.db.QueryRow(`SELECT item_id FROM assets WHERE id=?`, assetID).Scan(&itemID); err != nil || itemID != nil {
		t.Fatalf("source purge should detach but preserve shared attachment, item_id=%v err=%v", itemID, err)
	}
	state, err := f.core.Markdown(f.ctx, f.owner.ID, copy.ID)
	if err != nil || state.Markdown != copyMarkdown {
		t.Fatalf("duplicate content lost its stable asset URL: %#v, %v", state, err)
	}
}

func TestDuplicatePermissionsSceneAndRollback(t *testing.T) {
	f := newFixture(t)
	board := trashItem(t, f, "whiteboard", "Board", nil)
	scene := `{"elements":[{"id":"shape","version":2}],"appState":{},"files":{"image":{"dataURL":"data:image/png;base64,YQ=="}}}`
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, scene); err != nil {
		t.Fatal(err)
	}
	viewer := f.addUser("copy-viewer@example.test", "viewer")
	outsider := f.addUser("copy-outsider@example.test", "")
	for _, user := range []string{viewer.ID, outsider.ID} {
		if _, err := f.core.DuplicateItem(f.ctx, user, board.ID, "No"); !errors.Is(err, ErrForbidden) {
			t.Fatalf("access: %v", err)
		}
	}
	folder := trashItem(t, f, "folder", "Folder", nil)
	if _, err := f.core.DuplicateItem(f.ctx, f.owner.ID, folder.ID, "No"); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	if _, err := f.core.DuplicateItem(f.ctx, f.owner.ID, board.ID, " "); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	editor := f.addUser("copy-editor@example.test", "editor")
	copy, err := f.core.DuplicateItem(f.ctx, editor.ID, board.ID, "Copy")
	if err != nil {
		t.Fatal(err)
	}
	got, err := f.core.Whiteboard(f.ctx, editor.ID, copy.ID)
	if err != nil || got.Scene != scene || got.Revision != 0 || copy.CreatedBy != editor.ID {
		t.Fatalf("scene: %+v %v", got, err)
	}
	if _, err := f.db.Exec(`CREATE TRIGGER fail_copy BEFORE INSERT ON whiteboard_states BEGIN SELECT RAISE(ABORT,'fail'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.DuplicateItem(f.ctx, f.owner.ID, board.ID, "Rolled back"); err == nil {
		t.Fatal("expected rollback")
	}
	var count int
	f.db.QueryRow(`SELECT COUNT(*) FROM items WHERE title='Rolled back'`).Scan(&count)
	if count != 0 {
		t.Fatal("partial item")
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, board.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.DuplicateItem(f.ctx, f.owner.ID, board.ID, "Deleted"); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
}
