package core

import (
	"errors"
	"testing"

	"madoc/internal/db"
)

func TestMarkdownRetryAfterCompactionAndRestart(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	if err != nil {
		t.Fatal(err)
	}
	seq, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "lost-ack", []byte{1})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, doc.ID, seq, []byte{9}, "snapshot"); err != nil {
		t.Fatal(err)
	}
	var index int
	var name, path string
	if err := f.db.QueryRow(`PRAGMA database_list`).Scan(&index, &name, &path); err != nil {
		t.Fatal(err)
	}
	if err := f.db.Close(); err != nil {
		t.Fatal(err)
	}
	conn, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	service := New(conn)
	retried, err := service.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "lost-ack", []byte{1})
	if err != nil || retried != seq {
		t.Fatalf("retry = %d, %v; want %d", retried, err, seq)
	}
	state, err := service.Markdown(f.ctx, f.owner.ID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Updates) != 0 || state.HeadSeq != seq || state.Markdown != "snapshot" {
		t.Fatalf("retry changed compacted state: %#v", state)
	}
	next, err := service.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "new-edit", []byte{2})
	if err != nil || next <= seq {
		t.Fatalf("new edit = %d, %v", next, err)
	}
}

func TestMarkdownReceiptsKeepPermissionAndItemBoundaries(t *testing.T) {
	f := newFixture(t)
	doc, _ := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	other, _ := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Other", nil)
	seq, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "same-id", []byte{1})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.CommitMarkdownSnapshot(f.ctx, f.owner.ID, doc.ID, seq, []byte{9}, "snapshot"); err != nil {
		t.Fatal(err)
	}
	viewer := f.addUser("viewer@test.example", "viewer")
	outsider := f.addUser("outsider@test.example", "")
	for _, user := range []string{viewer.ID, outsider.ID} {
		if _, err := f.core.AppendMarkdownUpdate(f.ctx, user, doc.ID, "same-id", []byte{1}); !errors.Is(err, ErrForbidden) {
			t.Fatalf("unauthorized retry: %v", err)
		}
	}
	otherSeq, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, other.ID, "same-id", []byte{2})
	if err != nil || otherSeq == seq {
		t.Fatalf("item isolation = %d, %v", otherSeq, err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, doc.ID); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM markdown_update_receipts WHERE item_id=?`, doc.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("deleted item retains %d receipts", count)
	}
}

func TestMarkdownReceiptFailureRollsBackUpdate(t *testing.T) {
	f := newFixture(t)
	doc, _ := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	if _, err := f.db.Exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON markdown_update_receipts BEGIN SELECT RAISE(ABORT, 'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "failed", []byte{1}); err == nil {
		t.Fatal("expected write failure")
	}
	count, _, err := f.core.MarkdownUpdateStats(f.ctx, doc.ID)
	if err != nil || count != 0 {
		t.Fatalf("partial update survived: %d, %v", count, err)
	}
}

func TestMarkdownResetClearsReceiptsAtomically(t *testing.T) {
	f := newFixture(t)
	doc, _ := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	if _, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "old", []byte{1}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`CREATE TRIGGER fail_reset BEFORE UPDATE ON markdown_states BEGIN SELECT RAISE(ABORT, 'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, []byte{9}, "reset"); err == nil {
		t.Fatal("expected reset failure")
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM markdown_update_receipts WHERE item_id=?`, doc.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("failed reset lost receipts: %d", count)
	}
	if _, err := f.db.Exec(`DROP TRIGGER fail_reset`); err != nil {
		t.Fatal(err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, []byte{9}, "reset"); err != nil {
		t.Fatal(err)
	}
	if err := f.db.QueryRow(`SELECT count(*) FROM markdown_update_receipts WHERE item_id=?`, doc.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("reset retained old receipts: %d", count)
	}
	state, err := f.core.Markdown(f.ctx, f.owner.ID, doc.ID)
	if err != nil || len(state.Updates) != 0 || state.Markdown != "reset" {
		t.Fatalf("reset state = %#v, %v", state, err)
	}
}
