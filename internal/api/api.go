package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"madoc/internal/account"
	"madoc/internal/asset"
	"madoc/internal/auth"
	"madoc/internal/core"
)

type RoomInspector interface{ Active(itemID string) bool }

type API struct {
	auth          *auth.Service
	csrf          *auth.CSRF
	core          *core.Service
	assets        *asset.Service
	accounts      *account.Service
	rooms         RoomInspector
	secureCookies bool
}

func New(authService *auth.Service, csrf *auth.CSRF, domain *core.Service, assets *asset.Service, accounts *account.Service, rooms RoomInspector, secureCookies bool) *API {
	return &API{auth: authService, csrf: csrf, core: domain, assets: assets, accounts: accounts, rooms: rooms, secureCookies: secureCookies}
}

func (a *API) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/setup/status", a.setupStatus)
	r.Post("/setup/admin", a.setupAdmin)
	r.Post("/auth/sign-in", a.signIn)
	r.With(a.auth.Require).Post("/auth/sign-out", a.csrfRequired(a.signOut))
	r.With(a.auth.Optional).Get("/auth/session", a.session)
	r.Get("/public/shares/{token}", a.getPublicShare)
	r.Get("/public/shares/{token}/assets/{assetId}", a.getPublicShareAsset)
	r.With(a.auth.Require).Get("/me", a.me)
	r.Get("/invites/{token}", a.inspectInvite)
	r.With(a.auth.Optional).Post("/invites/{token}/accept", a.acceptInvite)
	r.Group(func(r chi.Router) {
		r.Use(a.auth.Require)
		a.accountRoutes(r)
		r.Get("/workspaces", a.listWorkspaces)
		r.Post("/workspaces", a.csrfRequired(a.createWorkspace))
		r.Get("/workspaces/{workspaceId}", a.getWorkspace)
		r.Patch("/workspaces/{workspaceId}", a.csrfRequired(a.renameWorkspace))
		r.Delete("/workspaces/{workspaceId}", a.csrfRequired(a.deleteWorkspace))
		r.Get("/workspaces/{workspaceId}/members", a.listMembers)
		r.Patch("/workspaces/{workspaceId}/members/{userId}", a.csrfRequired(a.updateMember))
		r.Delete("/workspaces/{workspaceId}/members/{userId}", a.csrfRequired(a.removeMember))
		r.Get("/workspaces/{workspaceId}/invites", a.listInvites)
		r.Post("/workspaces/{workspaceId}/invites", a.csrfRequired(a.createInvite))
		r.Delete("/workspaces/{workspaceId}/invites/{inviteId}", a.csrfRequired(a.revokeInvite))
		r.Get("/workspaces/{workspaceId}/items", a.listItems)
		r.Get("/workspaces/{workspaceId}/personal-items", a.personalItems)
		r.Get("/workspaces/{workspaceId}/search", a.search)
		r.Get("/workspaces/{workspaceId}/trash", a.listTrash)
		r.Get("/workspaces/{workspaceId}/trash/{batchId}/items", a.trashItems)
		r.Delete("/workspaces/{workspaceId}/trash/{batchId}", a.csrfRequired(a.purgeTrash))
		r.Post("/workspaces/{workspaceId}/trash/{batchId}/restore", a.csrfRequired(a.restoreTrash))
		r.Post("/workspaces/{workspaceId}/items", a.csrfRequired(a.createItem))
		r.Post("/workspaces/{workspaceId}/imports", a.csrfRequired(a.importContent))
		r.Get("/items/{itemId}", a.getItem)
		r.Put("/items/{itemId}/favorite", a.csrfRequired(a.setFavorite))
		r.Delete("/items/{itemId}/favorite", a.csrfRequired(a.setFavorite))
		r.Post("/items/{itemId}/visit", a.csrfRequired(a.visitItem))
		r.Patch("/items/{itemId}", a.csrfRequired(a.renameItem))
		r.Delete("/items/{itemId}", a.csrfRequired(a.deleteItem))
		r.Post("/items/{itemId}/move", a.csrfRequired(a.moveItem))
		r.Post("/items/{itemId}/duplicate", a.csrfRequired(a.duplicateItem))
		r.Get("/items/{itemId}/capture", a.captureItem)
		r.Get("/workspaces/{workspaceId}/version-storage", a.workspaceVersionStorage)
		r.Get("/items/{itemId}/versions", a.listItemVersions)
		r.Post("/items/{itemId}/versions", a.csrfRequired(a.createItemVersion))
		r.Get("/items/{itemId}/versions/{versionId}", a.getItemVersion)
		r.Post("/items/{itemId}/versions/{versionId}/restore-copy", a.csrfRequired(a.restoreItemVersionCopy))
		r.Get("/items/{itemId}/shares", a.listItemShares)
		r.Post("/items/{itemId}/shares", a.csrfRequired(a.createItemShare))
		r.Post("/items/{itemId}/shares/{shareId}/publish", a.csrfRequired(a.publishItemShare))
		r.Delete("/items/{itemId}/shares/{shareId}", a.csrfRequired(a.revokeItemShare))
		r.Get("/items/{itemId}/markdown", a.getMarkdown)
		r.Put("/items/{itemId}/markdown", a.csrfRequired(a.resetMarkdown))
		r.Get("/items/{itemId}/export.md", a.exportMarkdown)
		r.Get("/items/{itemId}/whiteboard", a.getWhiteboard)
		r.Put("/items/{itemId}/whiteboard", a.csrfRequired(a.updateWhiteboard))
		r.Post("/workspaces/{workspaceId}/assets", a.csrfRequired(a.uploadAsset))
		r.Get("/assets/{assetId}", a.downloadAsset)
		r.Delete("/assets/{assetId}", a.csrfRequired(a.deleteAsset))
	})
	return r
}

func (a *API) csrfRequired(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.csrf.Validate(r) {
			writeError(w, http.StatusForbidden, "CSRF_INVALID", "invalid CSRF token")
			return
		}
		next(w, r)
	}
}

func decode(r *http.Request, target any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, 2<<20))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func domainError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, core.ErrNotFound):
		writeError(w, 404, "NOT_FOUND", "resource not found")
	case errors.Is(err, core.ErrForbidden):
		writeError(w, 403, "FORBIDDEN", "operation is not allowed")
	case errors.Is(err, core.ErrRestoreDestination):
		writeError(w, 409, "RESTORE_DESTINATION_REQUIRED", "原目录不可用，请选择恢复位置")
	case errors.Is(err, core.ErrAssetVersionProtected):
		writeError(w, 409, "ASSET_VERSION_PROTECTED", "该附件仍被内容或历史版本引用，暂时不能删除")
	case errors.Is(err, core.ErrMarkdownExportPending):
		writeError(w, 409, "EXPORT_NOT_READY", "Markdown 尚未保存到历史版本水位，请稍后重试")
	case errors.Is(err, core.ErrConflict):
		writeError(w, 409, "CONFLICT", "resource changed or invariant would be violated")
	case errors.Is(err, core.ErrInvalid):
		writeError(w, 400, "INVALID_REQUEST", "invalid request")
	default:
		writeError(w, 500, "INTERNAL", "internal server error")
	}
}

func setSessionCookie(w http.ResponseWriter, value string, secure bool) {
	http.SetCookie(w, &http.Cookie{Name: auth.SessionCookie, Value: value, Path: "/", Expires: time.Now().Add(30 * 24 * time.Hour), HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode})
}

func (a *API) setupStatus(w http.ResponseWriter, r *http.Request) {
	initialized, err := a.auth.SetupStatus(r.Context())
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"initialized": initialized})
}

func (a *API) setupAdmin(w http.ResponseWriter, r *http.Request) {
	var body struct{ Name, Email, Password string }
	if decode(r, &body) != nil || !strings.Contains(body.Email, "@") || len(body.Password) < 8 {
		writeError(w, 400, "INVALID_REQUEST", "valid email and an 8 character password are required")
		return
	}
	user, session, err := a.auth.SetupAdmin(r.Context(), body.Name, body.Email, body.Password)
	if errors.Is(err, auth.ErrAlreadyInitialized) {
		writeError(w, 409, "ALREADY_INITIALIZED", "server is already initialized")
		return
	}
	if err != nil {
		domainError(w, err)
		return
	}
	setSessionCookie(w, session, a.secureCookies)
	token, err := a.csrf.Issue(w, a.secureCookies)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, 201, map[string]any{"user": user, "csrfToken": token})
}

func (a *API) signIn(w http.ResponseWriter, r *http.Request) {
	var body struct{ Email, Password string }
	if decode(r, &body) != nil {
		writeError(w, 400, "INVALID_REQUEST", "invalid request")
		return
	}
	user, session, err := a.auth.SignIn(r.Context(), body.Email, body.Password)
	if err != nil {
		writeError(w, 401, "INVALID_CREDENTIALS", "email or password is incorrect")
		return
	}
	setSessionCookie(w, session, a.secureCookies)
	token, err := a.csrf.Issue(w, a.secureCookies)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"user": user, "csrfToken": token})
}

func (a *API) signOut(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.SessionCookie); err == nil {
		if err := a.auth.SignOut(r.Context(), c.Value); err != nil {
			domainError(w, err)
			return
		}
		if rooms, ok := a.rooms.(AccountRooms); ok {
			rooms.RevokeSession(c.Value)
		}
	}
	http.SetCookie(w, &http.Cookie{Name: auth.SessionCookie, Path: "/", MaxAge: -1, HttpOnly: true, Secure: a.secureCookies, SameSite: http.SameSiteLaxMode})
	http.SetCookie(w, &http.Cookie{Name: auth.CSRFCookie, Path: "/", MaxAge: -1, HttpOnly: true, Secure: a.secureCookies, SameSite: http.SameSiteLaxMode})
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (a *API) session(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSON(w, 200, map[string]any{"user": nil})
		return
	}
	token, err := a.csrf.Token(w, r, a.secureCookies)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"user": user, "csrfToken": token})
}
func (a *API) me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, auth.UserFromContext(r.Context()))
}

func userID(r *http.Request) string { return auth.UserFromContext(r.Context()).ID }
func (a *API) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	v, e := a.core.ListWorkspaces(r.Context(), userID(r))
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 200, v)
}
func (a *API) getWorkspace(w http.ResponseWriter, r *http.Request) {
	v, e := a.core.GetWorkspace(r.Context(), userID(r), chi.URLParam(r, "workspaceId"))
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 200, v)
}
func (a *API) createWorkspace(w http.ResponseWriter, r *http.Request) {
	var b struct{ Name string }
	if decode(r, &b) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	v, e := a.core.CreateWorkspace(r.Context(), userID(r), b.Name)
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 201, v)
}
func (a *API) renameWorkspace(w http.ResponseWriter, r *http.Request) {
	var b struct{ Name string }
	if decode(r, &b) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	e := a.core.RenameWorkspace(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), b.Name)
	if e != nil {
		domainError(w, e)
		return
	}
	a.notifyWorkspace(chi.URLParam(r, "workspaceId"))
	w.WriteHeader(204)
}
func (a *API) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	e := a.core.DeleteWorkspace(r.Context(), userID(r), chi.URLParam(r, "workspaceId"))
	if e != nil {
		domainError(w, e)
		return
	}
	a.notifyWorkspace(chi.URLParam(r, "workspaceId"))
	w.WriteHeader(204)
}
func (a *API) listMembers(w http.ResponseWriter, r *http.Request) {
	v, e := a.core.ListMembers(r.Context(), userID(r), chi.URLParam(r, "workspaceId"))
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 200, v)
}
func (a *API) updateMember(w http.ResponseWriter, r *http.Request) {
	var b struct{ Role string }
	if decode(r, &b) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	e := a.core.UpdateMember(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), chi.URLParam(r, "userId"), b.Role)
	if e != nil {
		domainError(w, e)
		return
	}
	a.notifyWorkspace(chi.URLParam(r, "workspaceId"))
	w.WriteHeader(204)
}
func (a *API) removeMember(w http.ResponseWriter, r *http.Request) {
	e := a.core.RemoveMember(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), chi.URLParam(r, "userId"))
	if e != nil {
		domainError(w, e)
		return
	}
	a.notifyWorkspace(chi.URLParam(r, "workspaceId"))
	w.WriteHeader(204)
}
func (a *API) listInvites(w http.ResponseWriter, r *http.Request) {
	v, e := a.core.ListInvites(r.Context(), userID(r), chi.URLParam(r, "workspaceId"))
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 200, v)
}
func (a *API) createInvite(w http.ResponseWriter, r *http.Request) {
	var b struct{ Email, Role string }
	if decode(r, &b) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	v, token, e := a.core.CreateInvite(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), b.Email, b.Role)
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 201, map[string]any{"invite": v, "token": token, "url": "/invite/" + token})
}
func (a *API) revokeInvite(w http.ResponseWriter, r *http.Request) {
	e := a.core.RevokeInvite(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), chi.URLParam(r, "inviteId"))
	if e != nil {
		domainError(w, e)
		return
	}
	w.WriteHeader(204)
}
func (a *API) inspectInvite(w http.ResponseWriter, r *http.Request) {
	v, name, e := a.core.InspectInvite(r.Context(), chi.URLParam(r, "token"))
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"invite": v, "workspaceName": name})
}
func (a *API) acceptInvite(w http.ResponseWriter, r *http.Request) {
	var b struct{ Name, Password string }
	if decode(r, &b) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	u, workspace, e := a.core.AcceptInvite(r.Context(), chi.URLParam(r, "token"), b.Name, b.Password, auth.UserFromContext(r.Context()))
	if e != nil {
		domainError(w, e)
		return
	}
	a.notifyWorkspace(workspace.ID)
	session, e := a.auth.CreateSession(r.Context(), u.ID)
	if e != nil {
		domainError(w, e)
		return
	}
	setSessionCookie(w, session, a.secureCookies)
	token, e := a.csrf.Issue(w, a.secureCookies)
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"user": u, "workspace": workspace, "csrfToken": token})
}

func (a *API) listItems(w http.ResponseWriter, r *http.Request) {
	v, e := a.core.ListItems(r.Context(), userID(r), chi.URLParam(r, "workspaceId"))
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 200, v)
}
func (a *API) getItem(w http.ResponseWriter, r *http.Request) {
	v, e := a.core.ItemAccess(r.Context(), userID(r), chi.URLParam(r, "itemId"), false)
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 200, v)
}
func (a *API) createItem(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Type, Title       string
		ParentID          *string               `json:"parentId"`
		InitialMarkdown   *core.InitialMarkdown `json:"initialMarkdown"`
		InitialWhiteboard json.RawMessage       `json:"initialWhiteboard"`
	}
	if decode(r, &b) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	var v core.Item
	var e error
	if len(b.InitialWhiteboard) > 0 {
		if b.Type != "whiteboard" || b.InitialMarkdown != nil {
			domainError(w, core.ErrInvalid)
			return
		}
		v, e = a.core.CreateWhiteboardWithScene(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), b.Title, b.ParentID, string(b.InitialWhiteboard))
	} else {
		v, e = a.core.CreateItemWithMarkdown(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), b.Type, b.Title, b.ParentID, b.InitialMarkdown)
	}
	if e != nil {
		domainError(w, e)
		return
	}
	a.notifyWorkspace(v.WorkspaceID)
	writeJSON(w, 201, v)
}
func (a *API) renameItem(w http.ResponseWriter, r *http.Request) {
	var b struct{ Title string }
	if decode(r, &b) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	item, err := a.core.ItemAccess(r.Context(), userID(r), chi.URLParam(r, "itemId"), true)
	if err != nil {
		domainError(w, err)
		return
	}

	e := a.core.RenameItem(r.Context(), userID(r), chi.URLParam(r, "itemId"), b.Title)
	if e != nil {
		domainError(w, e)
		return
	}
	a.notifyWorkspace(item.WorkspaceID)
	w.WriteHeader(204)
}
func (a *API) deleteItem(w http.ResponseWriter, r *http.Request) {
	item, err := a.core.ItemAccess(r.Context(), userID(r), chi.URLParam(r, "itemId"), true)
	if err != nil {
		domainError(w, err)
		return
	}

	e := a.core.DeleteItem(r.Context(), userID(r), chi.URLParam(r, "itemId"))
	if e != nil {
		domainError(w, e)
		return
	}
	a.notifyWorkspace(item.WorkspaceID)
	w.WriteHeader(204)
}
func (a *API) moveItem(w http.ResponseWriter, r *http.Request) {
	var b struct {
		ParentID *string `json:"parentId"`
		Index    int
	}
	if decode(r, &b) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	item, err := a.core.ItemAccess(r.Context(), userID(r), chi.URLParam(r, "itemId"), true)
	if err != nil {
		domainError(w, err)
		return
	}

	e := a.core.MoveItem(r.Context(), userID(r), chi.URLParam(r, "itemId"), b.ParentID, b.Index)
	if e != nil {
		domainError(w, e)
		return
	}
	a.notifyWorkspace(item.WorkspaceID)
	w.WriteHeader(204)
}

func (a *API) getMarkdown(w http.ResponseWriter, r *http.Request) {
	v, e := a.core.Markdown(r.Context(), userID(r), chi.URLParam(r, "itemId"))
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"markdown": v.Markdown, "cacheSeq": v.CacheSeq, "generation": v.Generation})
}
func (a *API) captureItem(w http.ResponseWriter, r *http.Request) {
	v, e := a.core.CaptureItem(r.Context(), userID(r), chi.URLParam(r, "itemId"))
	if e != nil {
		domainError(w, e)
		return
	}
	type whiteboardCapture struct {
		Revision int64 `json:"revision"`
		Scene    any   `json:"scene"`
	}
	var whiteboard *whiteboardCapture
	if v.Whiteboard != nil {
		var scene any
		if json.Unmarshal([]byte(v.Whiteboard.Scene), &scene) != nil {
			domainError(w, core.ErrInvalid)
			return
		}
		whiteboard = &whiteboardCapture{Revision: v.Whiteboard.Revision, Scene: scene}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, struct {
		Item       core.Item           `json:"item"`
		CapturedAt time.Time           `json:"capturedAt"`
		Markdown   *core.MarkdownState `json:"markdown,omitempty"`
		Whiteboard *whiteboardCapture  `json:"whiteboard,omitempty"`
	}{Item: v.Item, CapturedAt: v.CapturedAt, Markdown: v.Markdown, Whiteboard: whiteboard})
}

func (a *API) listItemVersions(w http.ResponseWriter, r *http.Request) {
	limit := core.DefaultVersionPageSize
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			domainError(w, core.ErrInvalid)
			return
		}
		limit = parsed
	}
	versions, err := a.core.ListContentVersions(r.Context(), userID(r), chi.URLParam(r, "itemId"), r.URL.Query().Get("before"), limit)
	if err != nil {
		domainError(w, err)
		return
	}
	var nextBefore string
	if len(versions) == limit && len(versions) > 0 {
		nextBefore = versions[len(versions)-1].ID
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": versions, "nextBefore": nextBefore})
}

func (a *API) createItemVersion(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Label    string   `json:"label"`
		AssetIDs []string `json:"assetIds"`
	}
	if err := decode(r, &body); err != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	version, err := a.core.CreateManualVersion(r.Context(), userID(r), chi.URLParam(r, "itemId"), body.Label, body.AssetIDs)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"version": version})
}

func (a *API) getItemVersion(w http.ResponseWriter, r *http.Request) {
	version, err := a.core.GetContentVersion(r.Context(), userID(r), chi.URLParam(r, "itemId"), chi.URLParam(r, "versionId"))
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, version)
}

func (a *API) restoreItemVersionCopy(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if err := decode(r, &body); err != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	item, err := a.core.RestoreContentVersionAsCopy(r.Context(), userID(r), chi.URLParam(r, "itemId"), chi.URLParam(r, "versionId"), body.Title)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"item": item})
}

func (a *API) workspaceVersionStorage(w http.ResponseWriter, r *http.Request) {
	usage, err := a.core.ContentVersionUsage(r.Context(), userID(r), chi.URLParam(r, "workspaceId"))
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, usage)
}
func (a *API) resetMarkdown(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	if a.rooms != nil && a.rooms.Active(id) {
		domainError(w, core.ErrConflict)
		return
	}
	var b struct{ Snapshot, Markdown string }
	if decode(r, &b) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	snapshot, e := base64.StdEncoding.DecodeString(b.Snapshot)
	if e != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	e = a.core.ResetMarkdown(r.Context(), userID(r), id, snapshot, b.Markdown)
	if e != nil {
		domainError(w, e)
		return
	}
	w.WriteHeader(204)
}
func (a *API) exportMarkdown(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var target *core.MarkdownExportTarget
	query := r.URL.Query()
	if query.Has("generation") || query.Has("minSeq") {
		generation, genErr := strconv.ParseInt(query.Get("generation"), 10, 64)
		minSeq, seqErr := strconv.ParseInt(query.Get("minSeq"), 10, 64)
		if genErr != nil || seqErr != nil || generation < 0 || minSeq < 0 || len(query["generation"]) != 1 || len(query["minSeq"]) != 1 {
			domainError(w, core.ErrInvalid)
			return
		}
		target = &core.MarkdownExportTarget{Generation: generation, MinSeq: minSeq}
	}
	v, e := a.core.ExportMarkdown(r.Context(), userID(r), chi.URLParam(r, "itemId"), target)
	if errors.Is(e, core.ErrMarkdownExportPending) {
		writeError(w, http.StatusConflict, "EXPORT_NOT_READY", "Markdown 导出内容尚未追上已确认修改，请稍后重试")
		return
	}
	if errors.Is(e, core.ErrGeneration) {
		writeError(w, http.StatusConflict, "GENERATION_CHANGED", "文档已被替换，请重新打开后导出")
		return
	}
	if e != nil {
		domainError(w, e)
		return
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="document.md"`)
	w.Header().Set("X-Madoc-Content-Generation", strconv.FormatInt(v.Generation, 10))
	w.Header().Set("X-Madoc-Content-Seq", strconv.FormatInt(v.CacheSeq, 10))
	_, _ = io.WriteString(w, v.Markdown)
}
func (a *API) getWhiteboard(w http.ResponseWriter, r *http.Request) {
	v, e := a.core.Whiteboard(r.Context(), userID(r), chi.URLParam(r, "itemId"))
	if e != nil {
		domainError(w, e)
		return
	}
	var scene any
	_ = json.Unmarshal([]byte(v.Scene), &scene)
	writeJSON(w, 200, map[string]any{"revision": v.Revision, "scene": scene})
}
func (a *API) updateWhiteboard(w http.ResponseWriter, r *http.Request) {
	var b struct {
		BaseRevision int64           `json:"baseRevision"`
		Scene        json.RawMessage `json:"scene"`
	}
	if decode(r, &b) != nil || !json.Valid(b.Scene) {
		domainError(w, core.ErrInvalid)
		return
	}
	v, e := a.core.UpdateWhiteboard(r.Context(), userID(r), chi.URLParam(r, "itemId"), b.BaseRevision, string(b.Scene))
	if e != nil {
		domainError(w, e)
		return
	}
	var scene any
	_ = json.Unmarshal([]byte(v.Scene), &scene)
	writeJSON(w, 200, map[string]any{"revision": v.Revision, "scene": scene})
}

func (a *API) uploadAsset(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 25<<20)
	if err := r.ParseMultipartForm(25 << 20); err != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	file.Close()
	var itemID *string
	if value := r.FormValue("itemId"); value != "" {
		itemID = &value
	}
	v, e := a.assets.Save(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), itemID, header)
	if e != nil {
		domainError(w, e)
		return
	}
	writeJSON(w, 201, map[string]any{"asset": v, "url": "/api/assets/" + v.ID})
}
func (a *API) downloadAsset(w http.ResponseWriter, r *http.Request) {
	v, file, e := a.assets.Open(r.Context(), userID(r), chi.URLParam(r, "assetId"))
	if e != nil {
		domainError(w, e)
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", v.MIME)
	w.Header().Set("Content-Length", strconv.FormatInt(v.Size, 10))
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename=%q`, v.FileName))
	_, _ = io.Copy(w, file)
}
func (a *API) deleteAsset(w http.ResponseWriter, r *http.Request) {
	e := a.assets.Delete(r.Context(), userID(r), chi.URLParam(r, "assetId"))
	if e != nil {
		domainError(w, e)
		return
	}
	w.WriteHeader(204)
}
