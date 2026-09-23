package core

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestWorkspaceActivityIsMemberScopedPagedAndContentSafe(t *testing.T) {
	f := newFixture(t)
	item, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Activity doc", nil)
	if err != nil {
		t.Fatal(err)
	}
	comment, err := f.core.CreateItemComment(f.ctx, f.owner.ID, item.ID, "private comment body must not be echoed")
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.DeleteItemComment(f.ctx, f.owner.ID, item.ID, comment.ID); err != nil {
		t.Fatal(err)
	}
	viewer := f.addUser("activity-viewer@example.com", "viewer")
	outsider := f.addUser("activity-outsider@example.com", "")
	events, cursor, err := f.core.ListWorkspaceActivity(f.ctx, viewer.ID, f.space.ID, "", 2)
	if err != nil || len(events) != 2 || cursor == "" {
		t.Fatalf("first page = %#v cursor=%q err=%v", events, cursor, err)
	}
	for _, event := range events {
		if event.ItemID == nil || *event.ItemID != item.ID || event.ItemTitle != item.Title || event.ActorName != f.owner.Name {
			t.Fatalf("event metadata = %#v", event)
		}
		if strings.Contains(event.Summary, "private comment body") {
			t.Fatalf("activity exposed comment body: %#v", event)
		}
	}
	older, next, err := f.core.ListWorkspaceActivity(f.ctx, viewer.ID, f.space.ID, cursor, 2)
	if err != nil || len(older) != 1 || older[0].Type != "item_created" || next != "" {
		t.Fatalf("older page = %#v cursor=%q err=%v", older, next, err)
	}
	if _, _, err := f.core.ListWorkspaceActivity(f.ctx, outsider.ID, f.space.ID, "", 0); !errors.Is(err, ErrForbidden) {
		t.Fatalf("outsider list error = %v", err)
	}
	if _, _, err := f.core.ListWorkspaceActivity(f.ctx, viewer.ID, f.space.ID, "invalid", 0); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid cursor error = %v", err)
	}
}

func TestActivityWriteFailureRollsBackDescribedAction(t *testing.T) {
	f := newFixture(t)
	if _, err := f.db.Exec(`CREATE TRIGGER reject_activity BEFORE INSERT ON workspace_activity BEGIN SELECT RAISE(ABORT,'activity unavailable'); END`); err != nil {
		t.Fatal(err)
	}
	_, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Must roll back", nil)
	if err == nil {
		t.Fatal("item creation succeeded without its activity record")
	}
	var count int
	if err := f.db.QueryRowContext(context.Background(), `SELECT count(*) FROM items WHERE workspace_id=? AND title='Must roll back'`, f.space.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("partially committed item count=%d err=%v", count, err)
	}
}

func TestAutomaticCheckpointActivityCoalescesWithinFifteenMinutes(t *testing.T) {
	f := newFixture(t)
	item, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Coalesced", nil)
	if err != nil {
		t.Fatal(err)
	}
	first := time.Now().UTC().Add(-20 * time.Minute)
	for _, at := range []time.Time{first, first.Add(14 * time.Minute), first.Add(31 * time.Minute)} {
		tx, err := f.db.BeginTx(f.ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		if err := recordCoalescedActivityTx(f.ctx, tx, f.space.ID, &item.ID, item.Title, f.owner.ID, "content_checkpoint", "保存了内容检查点", at, AutomaticVersionMergeWindow); err != nil {
			tx.Rollback()
			t.Fatal(err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM workspace_activity WHERE workspace_id=? AND event_type='content_checkpoint'`, f.space.ID).Scan(&count); err != nil || count != 2 {
		t.Fatalf("coalesced checkpoint events=%d err=%v", count, err)
	}
}
