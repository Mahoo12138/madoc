package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"madoc/internal/account"
	"madoc/internal/asset"
	"madoc/internal/auth"
	"madoc/internal/core"
	"madoc/internal/db"
)

func TestPublicShareHTTPUsesOpaqueTokenAndScopedAssets(t *testing.T) {
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
	workspace, err := domain.CreateWorkspace(ctx, owner.ID, "Private workspace")
	if err != nil {
		t.Fatal(err)
	}
	doc, err := domain.CreateItem(ctx, owner.ID, workspace.ID, "markdown", "Private title", nil)
	if err != nil {
		t.Fatal(err)
	}
	other, err := domain.CreateItem(ctx, owner.ID, workspace.ID, "markdown", "Private other", nil)
	if err != nil {
		t.Fatal(err)
	}
	assetRoot := filepath.Join(t.TempDir(), "assets")
	if err := os.MkdirAll(filepath.Join(assetRoot, workspace.ID), 0o750); err != nil {
		t.Fatal(err)
	}
	assetID := "published-image"
	otherAssetID := "unpublished-image"
	for _, entry := range []struct{ id, itemID, body string }{
		{assetID, doc.ID, "public image"},
		{otherAssetID, other.ID, "private image"},
	} {
		path := filepath.Join(assetRoot, workspace.ID, entry.id)
		if err := os.WriteFile(path, []byte(entry.body), 0o640); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(`INSERT INTO assets(id,workspace_id,item_id,file_name,mime,size,sha256,storage_key,created_by,created_at) VALUES(?,?,?,'image.png','image/png',?,'hash',?,?,?)`, entry.id, workspace.ID, entry.itemID, len(entry.body), filepath.Join(workspace.ID, entry.id), owner.ID, time.Now().UTC()); err != nil {
			t.Fatal(err)
		}
	}
	markdown := "Published body ![image](/api/assets/" + assetID + ")"
	if err := domain.ResetMarkdown(ctx, owner.ID, doc.ID, nil, markdown); err != nil {
		t.Fatal(err)
	}
	version, err := domain.CreateManualVersion(ctx, owner.ID, doc.ID, "release", nil)
	if err != nil {
		t.Fatal(err)
	}
	csrf := auth.NewCSRF([]byte("test-secret"))
	assets := asset.New(conn, domain, assetRoot, 25)
	handler := New(authService, csrf, domain, assets, account.New(conn, assetRoot), nil, false).Routes()
	ownerSession, err := authService.CreateSession(ctx, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	csrfRecorder := httptest.NewRecorder()
	csrfToken, err := csrf.Issue(csrfRecorder, false)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]string{"versionId": version.ID, "expiresAt": time.Now().UTC().Add(time.Hour).Format(time.RFC3339)})
	request := httptest.NewRequest(http.MethodPost, "/items/"+doc.ID+"/shares", bytes.NewReader(body))
	request.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: ownerSession})
	request.AddCookie(csrfRecorder.Result().Cookies()[0])
	request.Header.Set(auth.CSRFHeader, csrfToken)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("create share status=%d body=%s", response.Code, response.Body.String())
	}
	var created struct {
		Token string         `json:"token"`
		URL   string         `json:"url"`
		Share core.ItemShare `json:"share"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if len(created.Token) != 64 || created.URL != "/s/"+created.Token {
		t.Fatalf("share capability response = %#v", created)
	}
	hash := sha256.Sum256(mustDecodeHex(t, created.Token))
	var stored string
	if err := conn.QueryRow(`SELECT token_hash FROM item_shares WHERE id=?`, created.Share.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != hex.EncodeToString(hash[:]) || stored == created.Token {
		t.Fatal("share token was not stored only as a one-way digest")
	}
	publicRequest := httptest.NewRequest(http.MethodGet, "/public/shares/"+created.Token, nil)
	publicResponse := httptest.NewRecorder()
	handler.ServeHTTP(publicResponse, publicRequest)
	if publicResponse.Code != http.StatusOK || !strings.Contains(publicResponse.Body.String(), "Published body") || !strings.Contains(publicResponse.Body.String(), "Private title") {
		t.Fatalf("anonymous content status=%d body=%s", publicResponse.Code, publicResponse.Body.String())
	}
	for _, secret := range []string{workspace.ID, doc.ID, owner.Email, "Private other", "private image"} {
		if strings.Contains(publicResponse.Body.String(), secret) {
			t.Fatalf("public response leaked %q: %s", secret, publicResponse.Body.String())
		}
	}
	if publicResponse.Header().Get("Cache-Control") != "no-store" || publicResponse.Header().Get("X-Robots-Tag") == "" {
		t.Fatalf("public response missing restrictive headers: %#v", publicResponse.Header())
	}
	imageRequest := httptest.NewRequest(http.MethodGet, "/public/shares/"+created.Token+"/assets/"+assetID, nil)
	imageResponse := httptest.NewRecorder()
	handler.ServeHTTP(imageResponse, imageRequest)
	if imageResponse.Code != http.StatusOK || imageResponse.Body.String() != "public image" {
		t.Fatalf("scoped image status=%d body=%q", imageResponse.Code, imageResponse.Body.String())
	}
	otherRequest := httptest.NewRequest(http.MethodGet, "/public/shares/"+created.Token+"/assets/"+otherAssetID, nil)
	otherResponse := httptest.NewRecorder()
	handler.ServeHTTP(otherResponse, otherRequest)
	if otherResponse.Code != http.StatusNotFound {
		t.Fatalf("unpublished asset status=%d body=%s", otherResponse.Code, otherResponse.Body.String())
	}
	if _, err := conn.Exec(`UPDATE item_shares SET expires_at=? WHERE id=?`, time.Now().UTC().Add(-time.Minute), created.Share.ID); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/public/shares/" + created.Token, "/public/shares/" + created.Token + "/assets/" + assetID} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound {
			t.Fatalf("expired capability path=%s status=%d body=%s", path, response.Code, response.Body.String())
		}
	}
	if _, err := conn.Exec(`UPDATE item_shares SET revoked_at=? WHERE id=?`, time.Now().UTC(), created.Share.ID); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/public/shares/" + created.Token, "/public/shares/" + created.Token + "/assets/" + assetID} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound {
			t.Fatalf("revoked capability path=%s status=%d body=%s", path, response.Code, response.Body.String())
		}
	}
}

func mustDecodeHex(t *testing.T, value string) []byte {
	t.Helper()
	decoded, err := hex.DecodeString(value)
	if err != nil {
		t.Fatal(err)
	}
	return decoded
}
