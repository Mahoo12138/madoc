package core

import (
	"errors"
	"testing"
)

func TestWorkspaceSettingsOwnerOnly(t *testing.T) {
	f := newFixture(t)
	for _, role := range []string{"editor", "viewer", ""} {
		user := f.addUser(role+"member@example.com", role)
		if err := f.core.RenameWorkspace(f.ctx, user.ID, f.space.ID, "Changed"); !errors.Is(err, ErrForbidden) {
			t.Fatalf("%q rename error = %v", role, err)
		}
		if err := f.core.DeleteWorkspace(f.ctx, user.ID, f.space.ID); !errors.Is(err, ErrForbidden) {
			t.Fatalf("%q delete error = %v", role, err)
		}
	}
	if err := f.core.RenameWorkspace(f.ctx, f.owner.ID, f.space.ID, "  \n "); !errors.Is(err, ErrInvalid) {
		t.Fatalf("empty name error = %v", err)
	}
	unchanged, err := f.core.GetWorkspace(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || unchanged.Name != f.space.Name {
		t.Fatalf("failed mutations changed workspace: %#v, %v", unchanged, err)
	}
	if err := f.core.RenameWorkspace(f.ctx, f.owner.ID, f.space.ID, "  Renamed  "); err != nil {
		t.Fatal(err)
	}
	renamed, err := f.core.GetWorkspace(f.ctx, f.owner.ID, f.space.ID)
	if err != nil || renamed.Name != "Renamed" || renamed.ID != f.space.ID {
		t.Fatalf("rename result = %#v, %v", renamed, err)
	}
}

func TestWorkspaceDeleteIsIsolated(t *testing.T) {
	f := newFixture(t)
	other, err := f.core.CreateWorkspace(f.ctx, f.owner.ID, "Keep")
	if err != nil {
		t.Fatal(err)
	}
	removed, err := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Remove", nil)
	if err != nil {
		t.Fatal(err)
	}
	kept, err := f.core.CreateItem(f.ctx, f.owner.ID, other.ID, "whiteboard", "Keep", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.core.DeleteWorkspace(f.ctx, f.owner.ID, f.space.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.GetWorkspace(f.ctx, f.owner.ID, f.space.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted workspace access error = %v", err)
	}
	if _, err := f.core.GetItem(f.ctx, removed.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted item access error = %v", err)
	}
	if _, err := f.core.GetItem(f.ctx, kept.ID); err != nil {
		t.Fatalf("other workspace item affected: %v", err)
	}
	spaces, err := f.core.ListWorkspaces(f.ctx, f.owner.ID)
	if err != nil || len(spaces) != 1 || spaces[0].ID != other.ID {
		t.Fatalf("remaining workspaces = %#v, %v", spaces, err)
	}
}
