package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"madoc/internal/account"
	"madoc/internal/asset"
	"madoc/internal/auth"
	"madoc/internal/core"
	"madoc/internal/db"
)

type workspaceEventRecorder struct{ workspaces []string }

func (*workspaceEventRecorder) Active(string) bool { return false }
func (r *workspaceEventRecorder) NotifyWorkspace(id string) {
	r.workspaces = append(r.workspaces, id)
}

func TestRestoreVersionCopyNotifiesWorkspaceOnlyAfterCommit(t *testing.T) {
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
	domain := core.New(conn)
	workspace, err := domain.CreateWorkspace(ctx, owner.ID, "Restore event")
	if err != nil {
		t.Fatal(err)
	}
	item, err := domain.CreateItem(ctx, owner.ID, workspace.ID, "markdown", "Source", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := domain.ResetMarkdown(ctx, owner.ID, item.ID, nil, "checkpoint"); err != nil {
		t.Fatal(err)
	}
	version, err := domain.CreateManualVersion(ctx, owner.ID, item.ID, "Saved", nil)
	if err != nil {
		t.Fatal(err)
	}
	rooms := &workspaceEventRecorder{}
	assetRoot := t.TempDir()
	csrf := auth.NewCSRF([]byte("test-secret"))
	handler := New(identity, csrf, domain, asset.New(conn, domain, assetRoot, 25), account.New(conn, assetRoot), rooms, false).Routes()
	session, err := identity.CreateSession(ctx, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	cookieRecorder := httptest.NewRecorder()
	csrfToken, err := csrf.Issue(cookieRecorder, false)
	if err != nil {
		t.Fatal(err)
	}
	cookies := cookieRecorder.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("CSRF cookie missing")
	}
	requestCopy := func(versionID string) *httptest.ResponseRecorder {
		t.Helper()
		body, _ := json.Marshal(map[string]string{"title": "Recovered"})
		req := httptest.NewRequest(http.MethodPost, "/items/"+item.ID+"/versions/"+versionID+"/restore-copy", bytes.NewReader(body))
		req.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: session})
		req.AddCookie(cookies[0])
		req.Header.Set(auth.CSRFHeader, csrfToken)
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		return response
	}
	failed := requestCopy("00000000-0000-0000-0000-000000000001")
	if failed.Code != http.StatusNotFound || len(rooms.workspaces) != 0 {
		t.Fatalf("failed restore status=%d events=%v body=%s", failed.Code, rooms.workspaces, failed.Body.String())
	}
	succeeded := requestCopy(version.ID)
	if succeeded.Code != http.StatusCreated {
		t.Fatalf("successful restore status=%d body=%s", succeeded.Code, succeeded.Body.String())
	}
	if len(rooms.workspaces) != 1 || rooms.workspaces[0] != workspace.ID {
		t.Fatalf("successful restore workspace events = %v", rooms.workspaces)
	}
}
