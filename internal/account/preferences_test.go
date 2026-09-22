package account

import (
	"context"
	"errors"
	"madoc/internal/auth"
	"madoc/internal/core"
	"madoc/internal/db"
	"path/filepath"
	"testing"
)

func ptr[T any](value T) *T { return &value }
func TestPreferencesPatchIsolationAndMigration(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	ctx := context.Background()
	a := auth.New(conn)
	u, _, _ := a.SetupAdmin(ctx, "Owner", "owner@test", "password123")
	s := New(conn, t.TempDir())
	initial, err := s.Preferences(ctx, u.ID)
	if err != nil || initial.Initialized || initial.Preferences != DefaultPreferences() {
		t.Fatalf("defaults: %#v %v", initial, err)
	}
	state, err := s.PatchPreferences(ctx, u.ID, PreferencesPatch{FontSize: ptr(20), FocusMode: ptr(true)}, true)
	if err != nil || state.Revision != 1 {
		t.Fatal(err)
	}
	state, err = s.PatchPreferences(ctx, u.ID, PreferencesPatch{AutoPair: ptr(false)}, false)
	if err != nil || state.Preferences.FontSize != 20 || state.Preferences.AutoPair || !state.Preferences.FocusMode {
		t.Fatalf("partial patch %#v %v", state, err)
	}
	if _, err = s.PatchPreferences(ctx, u.ID, PreferencesPatch{FocusMode: ptr(false)}, true); !errors.Is(err, core.ErrConflict) {
		t.Fatal("legacy overwrote server")
	}
	for _, patch := range []PreferencesPatch{{FontSize: ptr(13)}, {ContentWidth: ptr(1000)}, {LineHeight: ptr(1.8)}} {
		if _, err = s.PatchPreferences(ctx, u.ID, patch, false); !errors.Is(err, core.ErrInvalid) {
			t.Fatal("accepted invalid preference")
		}
	}
	outsider, err := s.Preferences(ctx, "another-account")
	if err != nil || outsider.Preferences != DefaultPreferences() {
		t.Fatal("preferences leaked")
	}
	persisted, err := s.Preferences(ctx, u.ID)
	if err != nil || persisted.Revision != 2 || persisted.Preferences.FontSize != 20 {
		t.Fatal("failed mutation changed state")
	}
}
