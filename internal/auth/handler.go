package auth

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"madoc/internal/db"
)

type AuthHandler struct {
	sm   *SessionManager
	csrf *CSRFProtector
	repo *db.Repo
}

type preflightReq struct {
	Email string `json:"email"`
}

type preflightResp struct {
	Registered  bool `json:"registered"`
	HasPassword bool `json:"hasPassword"`
}

type signInReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type userResp struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	AvatarURL *string `json:"avatar_url"`
}

type signInResp struct {
	User userResp `json:"user"`
}

type sessionResp struct {
	User *userResp `json:"user"`
}

func NewAuthHandler(sm *SessionManager, csrf *CSRFProtector, repo *db.Repo) *AuthHandler {
	return &AuthHandler{sm: sm, csrf: csrf, repo: repo}
}

func (h *AuthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	router := chi.NewRouter()
	router.Post("/api/auth/preflight", h.Preflight)
	router.Post("/api/auth/sign-in", h.SignIn)
	router.Post("/api/auth/sign-out", h.SignOut)
	router.Get("/api/auth/session", h.Session)
	router.ServeHTTP(w, r)
}

func (h *AuthHandler) Preflight(w http.ResponseWriter, r *http.Request) {
	var req preflightReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	user, err := h.repo.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeJSON(w, http.StatusOK, preflightResp{Registered: false, HasPassword: false})
		return
	}

	writeJSON(w, http.StatusOK, preflightResp{
		Registered:  true,
		HasPassword: user.Password != nil,
	})
}

func (h *AuthHandler) SignIn(w http.ResponseWriter, r *http.Request) {
	var req signInReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	user, err := h.repo.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid email or password"})
		return
	}

	if user.Password == nil || !CheckPassword(*user.Password, req.Password) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid email or password"})
		return
	}

	sessionID, err := h.sm.CreateSession(r.Context(), user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create session"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "sid",
		Value:    sessionID,
		Path:     "/",
		Expires:  time.Now().Add(30 * 24 * time.Hour),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	if _, err := h.csrf.Generate(w); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate CSRF token"})
		return
	}

	writeJSON(w, http.StatusOK, signInResp{
		User: userResp{
			ID:        user.ID,
			Name:      user.Name,
			Email:     user.Email,
			AvatarURL: user.AvatarURL,
		},
	})
}

func (h *AuthHandler) SignOut(w http.ResponseWriter, r *http.Request) {
	if !h.csrf.Validate(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "invalid CSRF token"})
		return
	}

	cookie, err := r.Cookie("sid")
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
		return
	}

	if err := h.sm.DeleteSession(r.Context(), cookie.Value); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete session"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "sid",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

func (h *AuthHandler) Session(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("sid")
	if err != nil {
		writeJSON(w, http.StatusOK, sessionResp{User: nil})
		return
	}

	userID, err := h.sm.GetUserID(r.Context(), cookie.Value)
	if err != nil {
		writeJSON(w, http.StatusOK, sessionResp{User: nil})
		return
	}

	user, err := h.repo.GetUserByID(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusOK, sessionResp{User: nil})
		return
	}

	writeJSON(w, http.StatusOK, sessionResp{
		User: &userResp{
			ID:        user.ID,
			Name:      user.Name,
			Email:     user.Email,
			AvatarURL: user.AvatarURL,
		},
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
