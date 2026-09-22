package core

import (
	"errors"
	"testing"
)

func TestPurgePreservesIndependentNestedBatchesAndAssets(t *testing.T) {
	f := newFixture(t)
	parent := trashItem(t, f, "folder", "Parent", nil)
	nested := trashItem(t, f, "folder", "Earlier folder", &parent.ID)
	survivor := trashItem(t, f, "markdown", "Earlier document", &nested.ID)
	removed := trashItem(t, f, "markdown", "Selected document", &parent.ID)
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, survivor.ID, []byte{1}, "retained"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, removed.ID, "pending", []byte{2}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,storage_key,created_at) VALUES('a',?,?,'image','image/png',1,'preserved-file',CURRENT_TIMESTAMP)`, f.space.ID, removed.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, nested.ID); err != nil {
		t.Fatal(err)
	}
	first, err := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(first) != 1 {
		t.Fatalf("first batch: %v %v", first, err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, parent.ID); err != nil {
		t.Fatal(err)
	}
	batches, _ := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	var target string
	for _, batch := range batches {
		if batch.Root.ID == parent.ID {
			target = batch.ID
		}
	}
	details, err := f.core.TrashItems(f.ctx, f.owner.ID, f.space.ID, target)
	if err != nil || len(details) != 2 {
		t.Fatalf("details: %v %v", details, err)
	}
	if err := f.core.PurgeTrash(f.ctx, f.owner.ID, f.space.ID, target, "Parent"); err != nil {
		t.Fatal(err)
	}
	var count int
	for _, table := range []string{"items", "markdown_states", "markdown_updates", "markdown_update_receipts"} {
		key := "item_id"
		if table == "items" {
			key = "id"
		}
		if err := f.db.QueryRow(`SELECT count(*) FROM `+table+` WHERE `+key+`=?`, removed.ID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("purged %s: %d %v", table, count, err)
		}
	}
	if err := f.db.QueryRow(`SELECT count(*) FROM assets WHERE id='a' AND item_id IS NULL AND storage_key='preserved-file'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("asset preservation: %d %v", count, err)
	}
	after, err := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(after) != 1 || after[0].ID != first[0].ID || after[0].ItemCount != 2 {
		t.Fatalf("independent batch: %v %v", after, err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, first[0].ID, nil); !errors.Is(err, ErrRestoreDestination) {
		t.Fatalf("lost original parent must require choice: %v", err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, first[0].ID, &TrashDestination{}); err != nil {
		t.Fatal(err)
	}
	state, err := f.core.Markdown(f.ctx, f.owner.ID, survivor.ID)
	if err != nil || state.Markdown != "retained" {
		t.Fatalf("survivor: %+v %v", state, err)
	}
	item, err := f.core.GetItem(f.ctx, survivor.ID)
	if err != nil || item.ParentID == nil || *item.ParentID != nested.ID {
		t.Fatalf("nested tree damaged: %+v %v", item, err)
	}
	if err := f.core.PurgeTrash(f.ctx, f.owner.ID, f.space.ID, target, "Parent"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("stale purge: %v", err)
	}
}

func TestPurgeRequiresOwnerExactConfirmationAndWorkspace(t *testing.T) {
	f := newFixture(t)
	item := trashItem(t, f, "markdown", " Exact title ", nil)
	editor := f.addUser("purge-editor@test", "editor")
	viewer := f.addUser("purge-viewer@test", "viewer")
	outsider := f.addUser("purge-outsider@test", "")
	if err := f.core.DeleteItem(f.ctx, editor.ID, item.ID); err != nil {
		t.Fatal(err)
	}
	batches, _ := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	batch := batches[0].ID
	for _, user := range []string{editor.ID, viewer.ID, outsider.ID} {
		if err := f.core.PurgeTrash(f.ctx, user, f.space.ID, batch, item.Title); !errors.Is(err, ErrForbidden) {
			t.Fatalf("purge permission: %v", err)
		}
	}
	for _, user := range []string{viewer.ID, outsider.ID} {
		if _, err := f.core.TrashItems(f.ctx, user, f.space.ID, batch); !errors.Is(err, ErrForbidden) {
			t.Fatalf("details permission: %v", err)
		}
	}
	if _, err := f.core.TrashItems(f.ctx, editor.ID, f.space.ID, batch); err != nil {
		t.Fatal(err)
	}
	for _, confirmation := range []string{"", "exact title", item.Title + " "} {
		if err := f.core.PurgeTrash(f.ctx, f.owner.ID, f.space.ID, batch, confirmation); !errors.Is(err, ErrInvalid) {
			t.Fatalf("confirmation %q: %v", confirmation, err)
		}
	}
	other, err := f.core.CreateWorkspace(f.ctx, f.owner.ID, "Other")
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.PurgeTrash(f.ctx, f.owner.ID, other.ID, batch, item.Title); !errors.Is(err, ErrNotFound) {
		t.Fatalf("workspace boundary: %v", err)
	}
	if _, err := f.core.TrashItems(f.ctx, f.owner.ID, other.ID, batch); !errors.Is(err, ErrNotFound) {
		t.Fatalf("details boundary: %v", err)
	}
	if err := f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batch, nil); err != nil {
		t.Fatal(err)
	}
	if err := f.core.PurgeTrash(f.ctx, f.owner.ID, f.space.ID, batch, item.Title); !errors.Is(err, ErrNotFound) {
		t.Fatalf("purged restored item: %v", err)
	}
	if _, err := f.core.GetItem(f.ctx, item.ID); err != nil {
		t.Fatal(err)
	}
}

func TestPurgeRollsBackDetachAndRejectsUnexpectedActiveChildren(t *testing.T) {
	f := newFixture(t)
	parent := trashItem(t, f, "folder", "Parent", nil)
	child := trashItem(t, f, "markdown", "Child", &parent.ID)
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, child.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, parent.ID); err != nil {
		t.Fatal(err)
	}
	batches, _ := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	var target string
	for _, batch := range batches {
		if batch.Root.ID == parent.ID {
			target = batch.ID
		}
	}
	if _, err := f.db.Exec(`CREATE TRIGGER fail_purge BEFORE DELETE ON item_deletion_batches BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err := f.core.PurgeTrash(f.ctx, f.owner.ID, f.space.ID, target, "Parent"); err == nil {
		t.Fatal("expected rollback")
	}
	var actualParent string
	if err := f.db.QueryRow(`SELECT parent_id FROM items WHERE id=?`, child.ID).Scan(&actualParent); err != nil || actualParent != parent.ID {
		t.Fatalf("detachment not rolled back: %s %v", actualParent, err)
	}
	if _, err := f.db.Exec(`DROP TRIGGER fail_purge`); err != nil {
		t.Fatal(err)
	}
	active := trashItem(t, f, "markdown", "Active", nil)
	if _, err := f.db.Exec(`UPDATE items SET parent_id=? WHERE id=?`, parent.ID, active.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.core.PurgeTrash(f.ctx, f.owner.ID, f.space.ID, target, "Parent"); !errors.Is(err, ErrConflict) {
		t.Fatalf("unexpected active child: %v", err)
	}
	if _, err := f.core.GetItem(f.ctx, active.ID); err != nil {
		t.Fatal(err)
	}
}
