package account

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"madoc/internal/auth"
	"madoc/internal/core"
	"madoc/internal/db"
	"madoc/internal/maintenance"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProfileAvatarPasswordAndBackup(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	conn, err := db.Open(filepath.Join(root, "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	a := auth.New(conn)
	user, session, err := a.SetupAdmin(ctx, "Owner", "owner@test.local", "password123")
	if err != nil {
		t.Fatal(err)
	}
	s := New(conn, filepath.Join(root, "assets"))
	otherSession, _ := a.CreateSession(ctx, user.ID)
	for _, name := range []string{" ", strings.Repeat("名", 81)} {
		if !errors.Is(s.Rename(ctx, user.ID, name), core.ErrInvalid) {
			t.Fatal("accepted invalid name")
		}
	}
	if err = s.Rename(ctx, user.ID, "  New name  "); err != nil {
		t.Fatal(err)
	}
	got, _ := a.Resolve(ctx, session)
	if got.Name != "New name" {
		t.Fatal(got)
	}
	for _, data := range [][]byte{[]byte("<svg/>"), make([]byte, MaxAvatarBytes+1)} {
		if !errors.Is(s.SaveAvatar(ctx, user.ID, bytes.NewReader(data)), core.ErrInvalid) {
			t.Fatal("accepted invalid avatar")
		}
	}

	var tooWide bytes.Buffer
	_ = png.Encode(&tooWide, image.NewRGBA(image.Rect(0, 0, 4097, 1)))
	if !errors.Is(s.SaveAvatar(ctx, user.ID, &tooWide), core.ErrInvalid) {
		t.Fatal("accepted excessive image dimensions")
	}
	var jpegAvatar bytes.Buffer
	_ = jpeg.Encode(&jpegAvatar, image.NewRGBA(image.Rect(0, 0, 32, 64)), nil)
	if err = s.SaveAvatar(ctx, user.ID, &jpegAvatar); err != nil {
		t.Fatal("JPEG rejected", err)
	}
	var buffer bytes.Buffer
	_ = png.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, 320, 180)))
	if err = s.SaveAvatar(ctx, user.ID, &buffer); err != nil {
		t.Fatal(err)
	}
	got, _ = a.Resolve(ctx, session)
	if got.AvatarURL == nil {
		t.Fatal("missing avatar URL")
	}
	if _, err = s.OpenAvatar(ctx, "outsider", user.ID); !errors.Is(err, core.ErrNotFound) {
		t.Fatalf("avatar leaked: %v", err)
	}

	if _, err = conn.ExecContext(ctx, `INSERT INTO users(id,name,email,password_hash,created_at,updated_at) VALUES('peer','Peer','peer@test.local','unused',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err = conn.ExecContext(ctx, `INSERT INTO workspaces(id,name,created_by,created_at,updated_at) VALUES('shared','Shared',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, user.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = conn.ExecContext(ctx, `INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES('shared',?,'owner',CURRENT_TIMESTAMP),('shared','peer','viewer',CURRENT_TIMESTAMP)`, user.ID); err != nil {
		t.Fatal(err)
	}
	sharedAvatar, sharedErr := s.OpenAvatar(ctx, "peer", user.ID)
	if sharedErr != nil {
		t.Fatal("shared member cannot read avatar", sharedErr)
	}
	sharedAvatar.Close()
	if _, err = conn.ExecContext(ctx, `DELETE FROM workspace_members WHERE user_id='peer'`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.OpenAvatar(ctx, "peer", user.ID); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("removed member retained avatar access")
	}
	file, err := s.OpenAvatar(ctx, user.ID, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := image.DecodeConfig(file)
	file.Close()
	if err != nil || config.Width != 256 || config.Height != 256 {
		t.Fatalf("avatar config %#v %v", config, err)
	}
	if err = s.ChangePassword(ctx, user.ID, session, "wrong", "nextpassword"); !errors.Is(err, auth.ErrUnauthorized) {
		t.Fatal(err)
	}
	if _, err = a.Resolve(ctx, otherSession); err != nil {
		t.Fatal("wrong password revoked session")
	}
	if err = s.ChangePassword(ctx, user.ID, session, "password123", strings.Repeat("界", 25)); !errors.Is(err, core.ErrInvalid) {
		t.Fatal("accepted >72 bytes")
	}
	if err = s.ChangePassword(ctx, user.ID, session, "password123", "nextpassword"); err != nil {
		t.Fatal(err)
	}
	if _, err = a.Resolve(ctx, session); err != nil {
		t.Fatal("current session lost")
	}
	if _, err = a.Resolve(ctx, otherSession); err == nil {
		t.Fatal("other session survived")
	}
	if _, _, err = a.SignIn(ctx, user.Email, "password123"); err == nil {
		t.Fatal("old password worked")
	}
	if _, _, err = a.SignIn(ctx, user.Email, "nextpassword"); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(root, "server.secret"), []byte("test-secret"), 0600); err != nil {
		t.Fatal(err)
	}
	conn.Close()
	backup, err := maintenance.Backup(root, filepath.Join(root, "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = maintenance.Restore(root, filepath.Join(root, "madoc.db"), backup, true); err != nil {
		t.Fatal(err)
	}
	restored, err := db.Open(filepath.Join(root, "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	restoredAccount := New(restored, filepath.Join(root, "assets"))
	file, err = restoredAccount.OpenAvatar(ctx, user.ID, user.ID)
	if err != nil {
		t.Fatal("avatar missing after restore", err)
	}
	file.Close()
	if err = restoredAccount.RemoveAvatar(ctx, user.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = restoredAccount.OpenAvatar(ctx, user.ID, user.ID); !errors.Is(err, core.ErrNotFound) {
		t.Fatal(err)
	}
}
