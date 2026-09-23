package core

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestFixedItemSharePublishesOnlyExplicitManualVersionsAndRevokes(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Published title", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, nil, "first publication"); err != nil {
		t.Fatal(err)
	}
	first, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, doc.ID, "Release one", nil)
	if err != nil {
		t.Fatal(err)
	}
	viewer := f.addUser("share-viewer@example.com", "viewer")
	editor := f.addUser("share-editor@example.com", "editor")
	outsider := f.addUser("share-outsider@example.com", "")
	const hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	if _, err := f.core.CreateItemShare(f.ctx, viewer.ID, doc.ID, first.ID, hash, nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer create share error = %v", err)
	}
	if _, err := f.core.CreateItemShare(f.ctx, editor.ID, doc.ID, first.ID, hash, nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor create share error = %v", err)
	}
	if _, err := f.core.ListItemShares(f.ctx, viewer.ID, doc.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer list shares error = %v", err)
	}
	if _, err := f.core.GetSharedItem(f.ctx, strings.Repeat("z", 64)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("malformed capability error = %v", err)
	}
	share, err := f.core.CreateItemShare(f.ctx, f.owner.ID, doc.ID, first.ID, hash, nil)
	if err != nil {
		t.Fatal(err)
	}
	initial, err := f.core.GetSharedItem(f.ctx, hash)
	if err != nil || initial.Title != "Published title" || initial.Markdown == nil || *initial.Markdown != "first publication" || initial.VersionName != "Release one" {
		t.Fatalf("initial publication = %#v, %v", initial, err)
	}
	if err := f.core.RenameItem(f.ctx, f.owner.ID, doc.ID, "renamed source"); err != nil {
		t.Fatal(err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, nil, "later private edit"); err != nil {
		t.Fatal(err)
	}
	unchanged, err := f.core.GetSharedItem(f.ctx, hash)
	if err != nil || unchanged.Title != "Published title" || *unchanged.Markdown != "first publication" {
		t.Fatalf("source edit unexpectedly changed publication = %#v, %v", unchanged, err)
	}
	second, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, doc.ID, "Release two", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.PublishItemShare(f.ctx, editor.ID, doc.ID, share.ID, second.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor publish error = %v", err)
	}
	if err := f.core.PublishItemShare(f.ctx, f.owner.ID, doc.ID, share.ID, second.ID); err != nil {
		t.Fatal(err)
	}
	updated, err := f.core.GetSharedItem(f.ctx, hash)
	if err != nil || updated.Title != "renamed source" || updated.Markdown == nil || *updated.Markdown != "later private edit" || updated.VersionName != "Release two" {
		t.Fatalf("explicit publication update = %#v, %v", updated, err)
	}
	if err := f.core.RevokeItemShare(f.ctx, outsider.ID, doc.ID, share.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("outsider revoke error = %v", err)
	}
	if err := f.core.RevokeItemShare(f.ctx, f.owner.ID, doc.ID, share.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.GetSharedItem(f.ctx, hash); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoked share remained readable: %v", err)
	}
	if err := f.core.RevokeItemShare(f.ctx, f.owner.ID, doc.ID, share.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("repeat revoke = %v", err)
	}
	if _, err := f.core.GetSharedItem(f.ctx, hash); !errors.Is(err, ErrNotFound) {
		t.Fatalf("outsider leaked share data: %v", err)
	}
}

func TestShareAssetScopeAndExpiry(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, nil, "![safe](/api/assets/asset-one) ![private](/api/assets/asset-two)"); err != nil {
		t.Fatal(err)
	}
	other, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Other", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, asset := range []struct{ id, itemID string }{{"asset-one", doc.ID}, {"asset-two", other.ID}} {
		if _, err := f.db.Exec(`INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,sha256,storage_key,created_by,created_at) VALUES(?,?,?,'image.png','image/png',3,'hash',?,?,?)`, asset.id, f.space.ID, asset.itemID, asset.id, f.owner.ID, time.Now().UTC()); err != nil {
			t.Fatal(err)
		}
	}
	version, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, doc.ID, "Image release", nil)
	if err != nil {
		t.Fatal(err)
	}
	expires := time.Now().UTC().Add(time.Hour)
	const hash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	share, err := f.core.CreateItemShare(f.ctx, f.owner.ID, doc.ID, version.ID, hash, &expires)
	if err != nil {
		t.Fatal(err)
	}
	shared, err := f.core.GetSharedItem(f.ctx, hash)
	if err != nil || len(shared.Assets) != 1 || shared.Assets[0].ID != "asset-one" {
		t.Fatalf("published assets = %#v, %v", shared.Assets, err)
	}
	if _, err := f.db.Exec(`UPDATE item_shares SET expires_at=? WHERE id=?`, time.Now().UTC().Add(-time.Minute), share.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.GetSharedItem(f.ctx, hash); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired share remained readable: %v", err)
	}
	if err := f.core.PublishItemShare(f.ctx, f.owner.ID, doc.ID, share.ID, version.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("expired share update error = %v", err)
	}
	if _, err := f.core.CreateItemShare(f.ctx, f.owner.ID, doc.ID, version.ID, strings.Repeat("x", 64), nil); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid token hash error = %v", err)
	}
}

func TestItemHardDeleteCascadesShareAndVersion(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Delete me", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, nil, "saved"); err != nil {
		t.Fatal(err)
	}
	version, err := f.core.CreateManualVersion(f.ctx, f.owner.ID, doc.ID, "Release", nil)
	if err != nil {
		t.Fatal(err)
	}
	const hash = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	if _, err := f.core.CreateItemShare(f.ctx, f.owner.ID, doc.ID, version.ID, hash, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`DELETE FROM items WHERE id=?`, doc.ID); err != nil {
		t.Fatalf("hard delete with share = %v", err)
	}
	for _, table := range []string{"item_shares", "item_versions"} {
		var count int
		if err := f.db.QueryRow(`SELECT count(*) FROM `+table+` WHERE `+map[string]string{"item_shares": "item_id", "item_versions": "item_id"}[table]+`=?`, doc.ID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("cascade left %s rows=%d err=%v", table, count, err)
		}
	}
}
