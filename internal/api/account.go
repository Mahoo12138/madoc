package api

import (
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"madoc/internal/account"
	"madoc/internal/auth"
	"madoc/internal/core"
)

type AccountRooms interface {
	RefreshUser(auth.User)
	RevokeOtherSessions(userID, keepSession string)
	RevokeSession(sessionID string)
}

func (a *API) accountRoutes(r chi.Router) {
	r.Get("/me/preferences", a.getPreferences)
	r.Patch("/me/preferences", a.csrfRequired(a.patchPreferences))
	r.Patch("/me", a.csrfRequired(a.updateProfile))
	r.Put("/me/avatar", a.csrfRequired(a.uploadAvatar))
	r.Delete("/me/avatar", a.csrfRequired(a.removeAvatar))
	r.Get("/users/{userId}/avatar", a.downloadAvatar)
	r.Post("/me/password", a.csrfRequired(a.changePassword))
}
func (a *API) profileResponse(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(auth.SessionCookie)
	if err != nil {
		domainError(w, err)
		return
	}
	user, err := a.auth.Resolve(r.Context(), cookie.Value)
	if err != nil {
		domainError(w, err)
		return
	}
	if rooms, ok := a.rooms.(AccountRooms); ok {
		rooms.RefreshUser(*user)
	}
	writeJSON(w, 200, user)
}
func (a *API) updateProfile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if decode(r, &body) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	if err := a.accounts.Rename(r.Context(), userID(r), body.Name); err != nil {
		domainError(w, err)
		return
	}
	a.profileResponse(w, r)
}
func (a *API) uploadAvatar(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, account.MaxAvatarBytes+(64<<10))
	if err := r.ParseMultipartForm(account.MaxAvatarBytes); err != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	defer file.Close()
	if err = a.accounts.SaveAvatar(r.Context(), userID(r), file); err != nil {
		domainError(w, err)
		return
	}
	a.profileResponse(w, r)
}
func (a *API) removeAvatar(w http.ResponseWriter, r *http.Request) {
	if err := a.accounts.RemoveAvatar(r.Context(), userID(r)); err != nil {
		domainError(w, err)
		return
	}
	a.profileResponse(w, r)
}
func (a *API) downloadAvatar(w http.ResponseWriter, r *http.Request) {
	file, err := a.accounts.OpenAvatar(r.Context(), userID(r), chi.URLParam(r, "userId"))
	if err != nil {
		domainError(w, err)
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = io.Copy(w, file)
}
func (a *API) changePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if decode(r, &body) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	cookie, err := r.Cookie(auth.SessionCookie)
	if err != nil {
		domainError(w, err)
		return
	}
	err = a.accounts.ChangePassword(r.Context(), userID(r), cookie.Value, body.CurrentPassword, body.NewPassword)
	if errors.Is(err, auth.ErrUnauthorized) {
		writeError(w, 400, "INCORRECT_PASSWORD", "当前密码不正确")
		return
	}
	if err != nil {
		domainError(w, err)
		return
	}
	if rooms, ok := a.rooms.(AccountRooms); ok {
		rooms.RevokeOtherSessions(userID(r), cookie.Value)
	}
	w.WriteHeader(204)
}

func (a *API) getPreferences(w http.ResponseWriter, r *http.Request) {
	state, err := a.accounts.Preferences(r.Context(), userID(r))
	if err != nil {
		domainError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, 200, state)
}
func (a *API) patchPreferences(w http.ResponseWriter, r *http.Request) {
	var patch account.PreferencesPatch
	if decode(r, &patch) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	state, err := a.accounts.PatchPreferences(r.Context(), userID(r), patch, r.Header.Get("If-None-Match") == "*")
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, 200, state)
}
