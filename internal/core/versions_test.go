package core

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
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

func TestAutomaticVersionsMergeAndKeepThirtyRecentEntries(t *testing.T) {
	f := newFixture(t)
	board, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "whiteboard", "Board", nil)
	if err != nil {
		t.Fatal(err)
	}
	manual, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, board.ID, "Permanent", nil)
	if err != nil {
		t.Fatal(err)
	}
	revision := int64(0)
	oldBase := time.Now().UTC().Add(-AutomaticVersionMergeWindow - time.Minute)
	for i := 1; i <= MaxAutomaticVersionsPerItem+2; i++ {
		state, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, revision, fmt.Sprintf(`{"elements":[{"id":"%d"}],"appState":{},"files":{}}`, i))
		if err != nil {
			t.Fatalf("update %d: %v", i, err)
		}
		revision = state.Revision
		if i == 1 {
			// A new edit inside the merge window replaces the rolling checkpoint.
			state, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, revision, `{"elements":[{"id":"merged"}],"appState":{},"files":{}}`)
			if err != nil {
				t.Fatal(err)
			}
			revision = state.Revision
		}
		var latestID string
		if err := f.db.QueryRow(`SELECT id FROM item_versions WHERE item_id=? AND kind='automatic' ORDER BY created_at DESC,id DESC LIMIT 1`, board.ID).Scan(&latestID); err != nil {
			t.Fatal(err)
		}
		if _, err := f.db.Exec(`UPDATE item_versions SET created_at=? WHERE id=?`, oldBase.Add(time.Duration(i)*time.Second), latestID); err != nil {
			t.Fatal(err)
		}
	}
	var automatic int
	if err := f.db.QueryRow(`SELECT count(*) FROM item_versions WHERE item_id=? AND kind='automatic'`, board.ID).Scan(&automatic); err != nil || automatic != MaxAutomaticVersionsPerItem {
		t.Fatalf("automatic version count = %d, %v", automatic, err)
	}
	var manualCount int
	if err := f.db.QueryRow(`SELECT count(*) FROM item_versions WHERE item_id=? AND kind='manual'`, board.ID).Scan(&manualCount); err != nil || manualCount != 1 {
		t.Fatalf("manual version count = %d, %v", manualCount, err)
	}
	var latestScene string
	if err := f.db.QueryRow(`SELECT whiteboard_scene FROM item_versions WHERE id=?`, manual.ID).Scan(&latestScene); err != nil || latestScene != `{"elements":[],"appState":{},"files":{}}` {
		t.Fatalf("manual checkpoint changed: %q, %v", latestScene, err)
	}
	if err := f.db.QueryRow(`SELECT whiteboard_scene FROM item_versions WHERE item_id=? AND kind='automatic' ORDER BY created_at DESC,id DESC LIMIT 1`, board.ID).Scan(&latestScene); err != nil || !strings.Contains(latestScene, `"id":"32"`) {
		t.Fatalf("latest automatic checkpoint = %q, %v", latestScene, err)
	}
}

func TestAutomaticVersionsExpireAndPauseAtWorkspaceBudget(t *testing.T) {
	f := newFixture(t)
	board, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "whiteboard", "Board", nil)
	if err != nil {
		t.Fatal(err)
	}
	first, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, `{"elements":[{"id":"one"}],"appState":{},"files":{}}`)
	if err != nil {
		t.Fatal(err)
	}
	var versionID string
	if err := f.db.QueryRow(`SELECT id FROM item_versions WHERE item_id=? AND kind='automatic'`, board.ID).Scan(&versionID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`UPDATE item_versions SET created_at=? WHERE id=?`, time.Now().UTC().Add(-AutomaticVersionRetention-time.Hour), versionID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.ListContentVersions(f.ctx, f.owner.ID, board.ID, "", 0); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM item_versions WHERE id=?`, versionID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("expired version remained visible during history read: count=%d err=%v", count, err)
	}
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, first.Revision, `{"elements":[{"id":"two"}],"appState":{},"files":{}}`); err != nil {
		t.Fatal(err)
	}
	if err := f.db.QueryRow(`SELECT count(*) FROM item_versions WHERE item_id=? AND kind='automatic'`, board.ID).Scan(&count); err != nil || count != 1 {
		var dates string
		_ = f.db.QueryRow(`SELECT group_concat(created_at) FROM item_versions WHERE item_id=? AND kind='automatic'`, board.ID).Scan(&dates)
		t.Fatalf("expired versions were retained: count=%d dates=%q err=%v", count, dates, err)
	}
	manual, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, board.ID, "Before full history", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`UPDATE item_versions SET payload_bytes=? WHERE id=?`, MaxWorkspaceVersionBytes, manual.ID); err != nil {
		t.Fatal(err)
	}
	state, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, first.Revision+1, `{"elements":[{"id":"three"}],"appState":{},"files":{}}`)
	if err != nil || state.Revision != first.Revision+2 {
		t.Fatalf("content save should continue when auto history is full: %#v %v", state, err)
	}
	if err := f.db.QueryRow(`SELECT count(*) FROM item_versions WHERE item_id=? AND kind='automatic'`, board.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("automatic checkpoint should pause at budget: count=%d err=%v", count, err)
	}
	var automaticRevision int64
	if err := f.db.QueryRow(`SELECT whiteboard_revision FROM item_versions WHERE item_id=? AND kind='automatic'`, board.ID).Scan(&automaticRevision); err != nil || automaticRevision != first.Revision+1 {
		t.Fatalf("budget should preserve prior automatic version at revision %d, got %d (%v)", first.Revision+1, automaticRevision, err)
	}
}

func TestAutomaticVersionBudgetIncludesNewlyReferencedAssetBytes(t *testing.T) {
	f := newFixture(t)
	board, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "whiteboard", "Board", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,storage_key,created_at) VALUES('large-asset',?,?, 'large.png','image/png',?,'large-asset',CURRENT_TIMESTAMP)`, f.space.ID, board.ID, MaxWorkspaceVersionBytes-1); err != nil {
		t.Fatal(err)
	}
	state, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, `{"elements":[{"id":"one"}],"appState":{},"files":{}}`)
	if err != nil || state.Revision != 1 {
		t.Fatalf("content write at history budget should succeed: %#v %v", state, err)
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM item_versions WHERE item_id=? AND kind='automatic'`, board.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("oversized referenced asset should pause automatic version: count=%d err=%v", count, err)
	}
	if _, err := f.db.Exec(`UPDATE assets SET size=1 WHERE id='large-asset'`); err != nil {
		t.Fatal(err)
	}
	state, err = f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, state.Revision, `{"elements":[{"id":"two"}],"appState":{},"files":{}}`)
	if err != nil {
		t.Fatal(err)
	}
	var versionID string
	if err := f.db.QueryRow(`SELECT id FROM item_versions WHERE item_id=? AND kind='automatic'`, board.ID).Scan(&versionID); err != nil {
		t.Fatal(err)
	}
	detail, err := f.core.GetContentVersion(f.ctx, f.owner.ID, board.ID, versionID)
	if err != nil || len(detail.AssetIDs) != 1 || detail.AssetIDs[0] != "large-asset" {
		t.Fatalf("automatic version asset references = %#v, %v", detail.AssetIDs, err)
	}
}

func TestRestoreVersionCreatesIndependentCopyWithoutChangingSource(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Design", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,storage_key,created_at) VALUES('shared-image',?,?,'image.png','image/png',12,'shared-image',CURRENT_TIMESTAMP)`, f.space.ID, doc.ID); err != nil {
		t.Fatal(err)
	}
	seq1, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "before", []byte{1, 2, 3}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "before", seq1, 0); err != nil {
		t.Fatal(err)
	}
	version, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, doc.ID, "Stable", nil)
	if err != nil {
		t.Fatal(err)
	}
	seq2, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "after", []byte{4, 5}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "after", seq2, 0); err != nil {
		t.Fatal(err)
	}
	copy, err := f.core.RestoreContentVersionAsCopy(f.ctx, f.owner.ID, doc.ID, version.ID, "Restored")
	if err != nil {
		t.Fatal(err)
	}
	if copy.ID == doc.ID || (copy.ParentID == nil) != (doc.ParentID == nil) || (copy.ParentID != nil && *copy.ParentID != *doc.ParentID) || copy.Title != "Restored" {
		t.Fatalf("restored Item = %#v", copy)
	}
	copyState, err := f.core.Markdown(f.ctx, f.owner.ID, copy.ID)
	if err != nil {
		t.Fatal(err)
	}
	if copyState.Markdown != "before" || len(copyState.Updates) != 1 || string(copyState.Updates[0].Update) != string([]byte{1, 2, 3}) || copyState.Updates[0].Seq != copyState.HeadSeq {
		t.Fatalf("restored Markdown differs from selected checkpoint: %#v", copyState)
	}
	var assetRefCount int
	if err := f.db.QueryRow(`SELECT count(*) FROM item_asset_refs WHERE item_id=? AND asset_id='shared-image'`, copy.ID).Scan(&assetRefCount); err != nil || assetRefCount != 1 {
		t.Fatalf("restored copy did not retain its live attachment reference: count=%d err=%v", assetRefCount, err)
	}
	source, err := f.core.Markdown(f.ctx, f.owner.ID, doc.ID)
	if err != nil || source.Markdown != "after" || source.HeadSeq != seq2 {
		t.Fatalf("source was changed by restore: %#v %v", source, err)
	}
	if _, err := f.core.CreateManualVersion(f.ctx, f.addUser("restore-viewer@example.com", "viewer").ID, doc.ID, "Denied", nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer restore precursor write = %v", err)
	}
	viewer := f.addUser("restore-copy-viewer@example.com", "viewer")
	if _, err := f.core.RestoreContentVersionAsCopy(f.ctx, viewer.ID, doc.ID, version.ID, "Denied copy"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer restore error = %v", err)
	}
}

func TestRestoreWhiteboardVersionAndAtomicFailure(t *testing.T) {
	f := newFixture(t)
	board, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "whiteboard", "Board", nil)
	if err != nil {
		t.Fatal(err)
	}
	oldScene := `{"elements":[{"id":"old"}],"appState":{},"files":{}}`
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, oldScene); err != nil {
		t.Fatal(err)
	}
	version, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, board.ID, "Old scene", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 1, `{"elements":[{"id":"new"}],"appState":{},"files":{}}`); err != nil {
		t.Fatal(err)
	}
	copy, err := f.core.RestoreContentVersionAsCopy(f.ctx, f.owner.ID, board.ID, version.ID, "Restored Board")
	if err != nil {
		t.Fatal(err)
	}
	state, err := f.core.Whiteboard(f.ctx, f.owner.ID, copy.ID)
	if err != nil || state.Revision != 0 || state.Scene != oldScene {
		t.Fatalf("restored scene = %#v %v", state, err)
	}
	if _, err := f.db.Exec(`CREATE TRIGGER fail_restored_whiteboard BEFORE INSERT ON whiteboard_states WHEN NEW.item_id IN (SELECT id FROM items WHERE title='Rollback') BEGIN SELECT RAISE(ABORT,'injected'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.RestoreContentVersionAsCopy(f.ctx, f.owner.ID, board.ID, version.ID, "Rollback"); err == nil {
		t.Fatal("expected injected restore failure")
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM items WHERE workspace_id=? AND title='Rollback' AND deletion_batch_id IS NULL`, f.space.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("failed restore left a partial Item: count=%d err=%v", count, err)
	}
}

func TestContentVersionUsageCountsUniqueAssetsAndEnforcesWorkspaceAccess(t *testing.T) {
	f := newFixture(t)
	board, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "whiteboard", "Board", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,storage_key,created_at) VALUES('usage-image',?,?,'image.png','image/png',100,'usage-image',CURRENT_TIMESTAMP)`, f.space.ID, board.ID); err != nil {
		t.Fatal(err)
	}
	manual, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, board.ID, "Initial", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.UpdateWhiteboard(f.ctx, f.owner.ID, board.ID, 0, `{"elements":[{"id":"next"}],"appState":{},"files":{}}`); err != nil {
		t.Fatal(err)
	}
	usage, err := f.core.ContentVersionUsage(f.ctx, f.owner.ID, f.space.ID)
	if err != nil {
		t.Fatal(err)
	}
	var payloadBytes int64
	if err := f.db.QueryRow(`SELECT SUM(payload_bytes) FROM item_versions WHERE workspace_id=?`, f.space.ID).Scan(&payloadBytes); err != nil {
		t.Fatal(err)
	}
	if usage.UsedBytes != payloadBytes+100 || usage.ManualVersions != 1 || usage.AutomaticVersions != 1 || usage.AutomaticPaused {
		t.Fatalf("unexpected usage: %#v payload=%d", usage, payloadBytes)
	}
	viewer := f.addUser("usage-viewer@example.com", "viewer")
	if _, err := f.core.ContentVersionUsage(f.ctx, viewer.ID, f.space.ID); err != nil {
		t.Fatalf("viewer usage read: %v", err)
	}
	outsider := f.addUser("usage-outsider@example.com", "")
	if _, err := f.core.ContentVersionUsage(f.ctx, outsider.ID, f.space.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("outsider usage read = %v", err)
	}
	if _, err := f.db.Exec(`UPDATE item_versions SET payload_bytes=? WHERE id=?`, MaxWorkspaceVersionBytes, manual.ID); err != nil {
		t.Fatal(err)
	}
	usage, err = f.core.ContentVersionUsage(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || !usage.AutomaticPaused || usage.UsedBytes < MaxWorkspaceVersionBytes {
		t.Fatalf("usage did not report automatic pause: %#v %v", usage, err)
	}
}
