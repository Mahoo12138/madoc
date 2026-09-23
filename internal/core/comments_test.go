package core

import (
	"errors"
	"strings"
	"testing"
)

func TestItemCommentsFollowWorkspaceReadAndWriteRoles(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	if err != nil {
		t.Fatal(err)
	}
	editor := f.addUser("comment-editor@example.com", "editor")
	viewer := f.addUser("comment-viewer@example.com", "viewer")
	outsider := f.addUser("comment-outsider@example.com", "")
	first, err := f.core.CreateItemComment(f.ctx, editor.ID, doc.ID, "  First note\nwith detail  ")
	if err != nil || first.Body != "First note\nwith detail" || first.AuthorName != editor.Name || !first.CanDelete {
		t.Fatalf("first comment = %#v, %v", first, err)
	}
	second, err := f.core.CreateItemComment(f.ctx, f.owner.ID, doc.ID, "Second note")
	if err != nil {
		t.Fatal(err)
	}
	viewerComments, cursor, err := f.core.ListItemComments(f.ctx, viewer.ID, doc.ID, "", 1)
	if err != nil || len(viewerComments) != 1 || viewerComments[0].Body != second.Body || viewerComments[0].CanDelete || cursor != second.ID {
		t.Fatalf("viewer first page = %#v cursor=%q err=%v", viewerComments, cursor, err)
	}
	older, next, err := f.core.ListItemComments(f.ctx, viewer.ID, doc.ID, cursor, 1)
	if err != nil || len(older) != 1 || older[0].ID != first.ID || older[0].CanDelete || next != "" {
		t.Fatalf("viewer older page = %#v cursor=%q err=%v", older, next, err)
	}
	if _, _, err := f.core.ListItemComments(f.ctx, outsider.ID, doc.ID, "", 0); !errors.Is(err, ErrForbidden) {
		t.Fatalf("outsider list error = %v", err)
	}
	if _, err := f.core.CreateItemComment(f.ctx, viewer.ID, doc.ID, "viewer cannot write"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer create error = %v", err)
	}
	if err := f.core.DeleteItemComment(f.ctx, editor.ID, doc.ID, second.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor removed another user's comment: %v", err)
	}
	if err := f.core.DeleteItemComment(f.ctx, viewer.ID, doc.ID, first.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer delete error = %v", err)
	}
	if err := f.core.DeleteItemComment(f.ctx, editor.ID, doc.ID, first.ID); err != nil {
		t.Fatalf("author delete = %v", err)
	}
	if err := f.core.DeleteItemComment(f.ctx, f.owner.ID, doc.ID, second.ID); err != nil {
		t.Fatalf("owner moderation delete = %v", err)
	}
	if err := f.core.DeleteItemComment(f.ctx, f.owner.ID, doc.ID, second.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("repeat delete = %v", err)
	}
}

func TestItemCommentValidationIsolationAndDeletion(t *testing.T) {
	f := newFixture(t)
	doc, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	if err != nil {
		t.Fatal(err)
	}
	folder, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "folder", "Folder", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{"", "   ", strings.Repeat("注", MaxCommentRunes+1)} {
		if _, err := f.core.CreateItemComment(f.ctx, f.owner.ID, doc.ID, body); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid comment length %d error=%v", len(body), err)
		}
	}
	if _, _, err := f.core.ListItemComments(f.ctx, f.owner.ID, folder.ID, "", 0); !errors.Is(err, ErrInvalid) {
		t.Fatalf("folder comment list error = %v", err)
	}
	if _, err := f.core.CreateItemComment(f.ctx, f.owner.ID, folder.ID, "not supported"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("folder comment create error = %v", err)
	}
	comment, err := f.core.CreateItemComment(f.ctx, f.owner.ID, doc.ID, "kept with its original author name")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`UPDATE users SET name='Renamed author' WHERE id=?`, f.owner.ID); err != nil {
		t.Fatal(err)
	}
	listed, _, err := f.core.ListItemComments(f.ctx, f.owner.ID, doc.ID, "", 0)
	if err != nil || len(listed) != 1 || listed[0].AuthorName != "Owner" || listed[0].ID != comment.ID {
		t.Fatalf("comment author snapshot = %#v err=%v", listed, err)
	}
	if err := f.core.DeleteItem(f.ctx, f.owner.ID, doc.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.core.ListItemComments(f.ctx, f.owner.ID, doc.ID, "", 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted Item comments remained visible: %v", err)
	}
}
