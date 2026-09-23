package asset

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
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

func TestVersionReferencePreventsAssetDeletion(t *testing.T) {
	ctx := context.Background()
	conn, err := db.Open(filepath.Join(t.TempDir(), "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	authService := auth.New(conn)
	owner, _, err := authService.SetupAdmin(ctx, "Owner", "owner@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	domain := core.New(conn)
	space, err := domain.CreateWorkspace(ctx, owner.ID, "Assets")
	if err != nil {
		t.Fatal(err)
	}
	doc, err := domain.CreateItem(ctx, owner.ID, space.ID, "markdown", "Doc", nil)
	if err != nil {
		t.Fatal(err)
	}
	service := New(conn, domain, t.TempDir(), 20)
	png := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, bytes.Repeat([]byte{0}, 520)...)
	itemAsset, err := service.Save(ctx, owner.ID, space.ID, &doc.ID, uploadHeader(t, "kept.png", "image/png", png))
	if err != nil {
		t.Fatal(err)
	}
	seq, err := domain.AppendMarkdownUpdate(ctx, owner.ID, doc.ID, "client-1", []byte{1}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := domain.UpdateMarkdownCache(ctx, owner.ID, doc.ID, "body", seq, 0); err != nil {
		t.Fatal(err)
	}
	version, err := domain.CreateManualVersion(ctx, owner.ID, doc.ID, "Has image", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Delete(ctx, owner.ID, itemAsset.ID); !errors.Is(err, core.ErrAssetVersionProtected) {
		t.Fatalf("referenced asset delete error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(service.root, itemAsset.StorageKey)); err != nil {
		t.Fatalf("referenced asset file was removed: %v", err)
	}
	var refs int
	if err := conn.QueryRow(`SELECT count(*) FROM item_version_assets WHERE version_id=? AND asset_id=?`, version.ID, itemAsset.ID).Scan(&refs); err != nil || refs != 1 {
		t.Fatalf("version reference count = %d, %v", refs, err)
	}
	freeAsset, err := service.Save(ctx, owner.ID, space.ID, nil, uploadHeader(t, "free.png", "image/png", png))
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Delete(ctx, owner.ID, freeAsset.ID); err != nil {
		t.Fatalf("unreferenced asset delete: %v", err)
	}
	if _, err := os.Stat(filepath.Join(service.root, freeAsset.StorageKey)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("unreferenced asset file still exists: %v", err)
	}
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
