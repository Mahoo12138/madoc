package core

import (
	"errors"
	"fmt"
	"testing"
	"time"
)

func TestPersonalItemsArePrivateAndAllowViewers(t *testing.T) {
	f := newFixture(t)
	viewer := f.addUser("personal-viewer@test", "viewer")
	outsider := f.addUser("personal-outsider@test", "")
	item := trashItem(t, f, "markdown", "Private navigation", nil)
	if err := f.core.SetFavorite(f.ctx, viewer.ID, item.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := f.core.VisitItem(f.ctx, viewer.ID, item.ID); err != nil {
		t.Fatal(err)
	}
	got, err := f.core.PersonalItems(f.ctx, viewer.ID, f.space.ID)
	if err != nil || len(got.Favorites) != 1 || len(got.Recent) != 1 || got.Recent[0].Item.ID != item.ID {
		t.Fatalf("viewer: %+v %v", got, err)
	}
	owner, err := f.core.PersonalItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(owner.Favorites) != 0 || len(owner.Recent) != 0 {
		t.Fatalf("owner sees private state: %+v %v", owner, err)
	}
	unchanged, err := f.core.GetItem(f.ctx, item.ID)
	if err != nil || unchanged.SortKey != item.SortKey || !unchanged.UpdatedAt.Equal(item.UpdatedAt) {
		t.Fatalf("public metadata changed: %+v %v", unchanged, err)
	}
	for _, mutate := range []func() error{
		func() error { return f.core.SetFavorite(f.ctx, outsider.ID, item.ID, true) },
		func() error { return f.core.SetFavorite(f.ctx, outsider.ID, item.ID, false) },
		func() error { return f.core.VisitItem(f.ctx, outsider.ID, item.ID) },
	} {
		if err := mutate(); !errors.Is(err, ErrForbidden) {
			t.Fatalf("outsider: %v", err)
		}
	}
	if _, err = f.core.PersonalItems(f.ctx, outsider.ID, f.space.ID); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	other, err := f.core.CreateWorkspace(f.ctx, f.owner.ID, "Other")
	if err != nil {
		t.Fatal(err)
	}
	if got, err = f.core.PersonalItems(f.ctx, f.owner.ID, other.ID); err != nil || len(got.Favorites) != 0 || len(got.Recent) != 0 {
		t.Fatalf("other: %+v %v", got, err)
	}
	if _, err = f.core.PersonalItems(f.ctx, viewer.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	if err = f.core.RemoveMember(f.ctx, f.owner.ID, f.space.ID, viewer.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.core.PersonalItems(f.ctx, viewer.ID, f.space.ID); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	if err = f.core.VisitItem(f.ctx, viewer.ID, item.ID); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
}

func TestPersonalItemsHideTrashRestoreAndCascadePurge(t *testing.T) {
	f := newFixture(t)
	folder := trashItem(t, f, "folder", "Folder", nil)
	doc := trashItem(t, f, "markdown", "Original", &folder.ID)
	for _, id := range []string{folder.ID, doc.ID} {
		if err := f.core.SetFavorite(f.ctx, f.owner.ID, id, true); err != nil {
			t.Fatal(err)
		}
		if err := f.core.VisitItem(f.ctx, f.owner.ID, id); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.core.RenameItem(f.ctx, f.owner.ID, doc.ID, "Renamed"); err != nil {
		t.Fatal(err)
	}
	got, err := f.core.PersonalItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || got.Recent[0].Item.Title != "Renamed" {
		t.Fatalf("rename: %+v %v", got, err)
	}
	if err = f.core.DeleteItem(f.ctx, f.owner.ID, folder.ID); err != nil {
		t.Fatal(err)
	}
	got, err = f.core.PersonalItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(got.Favorites) != 0 || len(got.Recent) != 0 {
		t.Fatalf("trash: %+v %v", got, err)
	}
	if err = f.core.VisitItem(f.ctx, f.owner.ID, doc.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	if err = f.core.SetFavorite(f.ctx, f.owner.ID, doc.ID, true); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	batches, err := f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.core.RestoreTrash(f.ctx, f.owner.ID, f.space.ID, batches[0].ID, nil); err != nil {
		t.Fatal(err)
	}
	got, err = f.core.PersonalItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(got.Favorites) != 2 || len(got.Recent) != 2 {
		t.Fatalf("restore: %+v %v", got, err)
	}
	if err = f.core.SetFavorite(f.ctx, f.owner.ID, doc.ID, false); err != nil {
		t.Fatal(err)
	}
	if err = f.core.SetFavorite(f.ctx, f.owner.ID, doc.ID, false); err != nil {
		t.Fatal(err)
	}
	got, err = f.core.PersonalItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(got.Favorites) != 1 || len(got.Recent) != 2 {
		t.Fatalf("unfavorite: %+v %v", got, err)
	}
	if err = f.core.DeleteItem(f.ctx, f.owner.ID, folder.ID); err != nil {
		t.Fatal(err)
	}
	batches, err = f.core.ListTrash(f.ctx, f.owner.ID, f.space.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.core.PurgeTrash(f.ctx, f.owner.ID, f.space.ID, batches[0].ID, "Folder"); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"item_favorites", "item_visits"} {
		var count int
		if err = f.db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("cascade %s: %d %v", table, count, err)
		}
	}
}

func TestPersonalItemsOrderLimitIdempotencyAndRollback(t *testing.T) {
	f := newFixture(t)
	first := trashItem(t, f, "whiteboard", "First", nil)
	second := trashItem(t, f, "markdown", "Second", nil)
	for _, id := range []string{first.ID, second.ID} {
		if err := f.core.SetFavorite(f.ctx, f.owner.ID, id, true); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.core.SetFavorite(f.ctx, f.owner.ID, first.ID, true); err != nil {
		t.Fatal(err)
	}
	got, err := f.core.PersonalItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(got.Favorites) != 2 || got.Favorites[0].ID != second.ID {
		t.Fatalf("favorite order: %+v %v", got, err)
	}
	if _, err = f.db.Exec(`CREATE TRIGGER reject_visit BEFORE INSERT ON item_visits BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err = f.core.VisitItem(f.ctx, f.owner.ID, first.ID); err == nil {
		t.Fatal("expected failure")
	}
	if got, err = f.core.PersonalItems(f.ctx, f.owner.ID, f.space.ID); err != nil || len(got.Recent) != 0 {
		t.Fatalf("rollback: %+v %v", got, err)
	}
	if _, err = f.db.Exec(`DROP TRIGGER reject_visit`); err != nil {
		t.Fatal(err)
	}
	for n := 0; n < 52; n++ {
		item := trashItem(t, f, "markdown", fmt.Sprintf("Visit %d", n), nil)
		if err = f.core.VisitItem(f.ctx, f.owner.ID, item.ID); err != nil {
			t.Fatal(err)
		}
		// Pin order independently of clock resolution.
		if _, err = f.db.Exec(`UPDATE item_visits SET visited_at=? WHERE item_id=?`, time.Date(2020, 1, 1, 0, n, 0, 0, time.UTC), item.ID); err != nil {
			t.Fatal(err)
		}
	}
	got, err = f.core.PersonalItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(got.Recent) != 50 || got.Recent[0].Item.Title != "Visit 51" {
		t.Fatalf("recent limit: %+v %v", got, err)
	}
	if err = f.core.VisitItem(f.ctx, f.owner.ID, got.Recent[49].Item.ID); err != nil {
		t.Fatal(err)
	}
	latest, err := f.core.PersonalItems(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || len(latest.Recent) != 50 || latest.Recent[0].Item.ID != got.Recent[49].Item.ID {
		t.Fatalf("revisit: %+v %v", latest, err)
	}
}
