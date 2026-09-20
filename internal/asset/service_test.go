package asset

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"path/filepath"
	"testing"

	"madoc/internal/auth"
	"madoc/internal/core"
	"madoc/internal/db"
)

func uploadHeader(t *testing.T, name, mime string, content []byte) *multipart.FileHeader {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="file"; filename="`+name+`"`)
	header.Set("Content-Type", mime)
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(content)
	_ = writer.Close()
	request, _ := http.NewRequest(http.MethodPost, "/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(25 << 20); err != nil {
		t.Fatal(err)
	}
	return request.MultipartForm.File["file"][0]
}

func TestAssetUploadInspectionAndPrivateDownload(t *testing.T) {
	ctx := context.Background()
	conn, err := db.Open(filepath.Join(t.TempDir(), "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	authService := auth.New(conn)
	owner, _, _ := authService.SetupAdmin(ctx, "Owner", "owner@example.com", "password123")
	domain := core.New(conn)
	space, _ := domain.CreateWorkspace(ctx, owner.ID, "Assets")
	service := New(conn, domain, t.TempDir(), 20)
	png := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, bytes.Repeat([]byte{0}, 520)...)
	asset, err := service.Save(ctx, owner.ID, space.ID, nil, uploadHeader(t, "image.png", "image/png", png))
	if err != nil {
		t.Fatal(err)
	}
	if asset.FileName != "image.png" || asset.Size != int64(len(png)) {
		t.Fatalf("asset = %#v", asset)
	}
	if _, _, err := service.Open(ctx, "outside-user", asset.ID); !errors.Is(err, core.ErrForbidden) {
		t.Fatalf("private download error = %v", err)
	}
	traversal, err := service.Save(ctx, owner.ID, space.ID, nil, uploadHeader(t, "../../secret.png", "image/png", png))
	if err != nil || traversal.FileName != "secret.png" {
		t.Fatalf("filename was not sanitized: %#v, %v", traversal, err)
	}
	spoofed := uploadHeader(t, "fake.png", "image/png", []byte("not an image"))
	if _, err := service.Save(ctx, owner.ID, space.ID, nil, spoofed); !errors.Is(err, core.ErrInvalid) {
		t.Fatalf("spoofed MIME error = %v", err)
	}
	oversized := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, bytes.Repeat([]byte{0}, (1<<20)+1)...)
	if _, err := New(conn, domain, t.TempDir(), 1).Save(ctx, owner.ID, space.ID, nil, uploadHeader(t, "large.png", "image/png", oversized)); !errors.Is(err, core.ErrInvalid) {
		t.Fatalf("oversized upload error = %v", err)
	}
	if _, err := conn.Exec(`UPDATE assets SET storage_key='../server.secret' WHERE id=?`, asset.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.Open(ctx, owner.ID, asset.ID); err == nil {
		t.Fatal("expected a path traversal storage key to be rejected")
	}
}
