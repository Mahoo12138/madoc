package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"madoc/internal/account"
	"madoc/internal/asset"
	"madoc/internal/auth"
	"madoc/internal/core"
	"madoc/internal/db"
	"madoc/internal/site"
)

func TestWorkspacePatchFieldsAndCommittedNotifications(t *testing.T) {
	ctx := context.Background()
	conn, err := db.Open(filepath.Join(t.TempDir(), "madoc.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	identity := auth.New(conn)
	owner, _, err := identity.SetupAdmin(ctx, "Owner", "owner@example.test", "password123")
	if err != nil {
		t.Fatal(err)
	}
	siteStore := site.New(conn)
	domain := core.New(conn, siteStore)
	workspace, err := domain.CreateWorkspace(ctx, owner.ID, "Original")
	if err != nil {
		t.Fatal(err)
	}
	rooms := &workspaceEventRecorder{}
	assetRoot := t.TempDir()
	csrf := auth.NewCSRF([]byte("test-secret"))
	handler := New(identity, csrf, domain, siteStore, asset.New(conn, domain, assetRoot, 25), account.New(conn, assetRoot), rooms, false).Routes()
	session, err := identity.CreateSession(ctx, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	csrfToken, err := csrf.Issue(recorder, false)
	if err != nil {
		t.Fatal(err)
	}
	patch := func(body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodPatch, "/workspaces/"+workspace.ID, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: session})
		req.AddCookie(recorder.Result().Cookies()[0])
		req.Header.Set(auth.CSRFHeader, csrfToken)
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		return response
	}
	for _, body := range []string{`{}`, `{"description":null}`, `{"description":42}`, `{"name":" ","description":"must not save"}`, `{"name":"must not save","description":"` + strings.Repeat("x", 501) + `"}`} {
		if response := patch(body); response.Code != http.StatusBadRequest {
			t.Fatalf("invalid PATCH %s: %d %s", body, response.Code, response.Body.String())
		}
	}
	if len(rooms.workspaces) != 0 {
		t.Fatalf("invalid update notified workspace: %v", rooms.workspaces)
	}
	for _, body := range []string{`{"description":"  intro\nsecond line 🌱  "}`, `{"name":"Renamed"}`} {
		if response := patch(body); response.Code != http.StatusNoContent {
			t.Fatalf("valid PATCH %s: %d %s", body, response.Code, response.Body.String())
		}
	}
	got, err := domain.GetWorkspace(ctx, owner.ID, workspace.ID)
	if err != nil || got.Name != "Renamed" || got.Description != "intro\nsecond line 🌱" {
		t.Fatalf("partial update: %#v %v", got, err)
	}
	if response := patch(`{"description":""}`); response.Code != http.StatusNoContent {
		t.Fatalf("clear: %d %s", response.Code, response.Body.String())
	}
	if len(rooms.workspaces) != 3 {
		t.Fatalf("committed updates notified %d times", len(rooms.workspaces))
	}
}
