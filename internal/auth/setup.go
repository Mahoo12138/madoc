package auth

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"madoc/internal/db"
)

type SetupHandler struct {
	repo *db.Repo
	sm   *SessionManager
	csrf *CSRFProtector
}

type setupReq struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func NewSetupHandler(repo *db.Repo, sm *SessionManager, csrf *CSRFProtector) *SetupHandler {
	return &SetupHandler{repo: repo, sm: sm, csrf: csrf}
}

func (h *SetupHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	initialized, err := h.repo.IsInitialized(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "server error"})
		return
	}
	if initialized {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "already initialized"})
		return
	}

	var req setupReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.Name == "" {
		req.Name = req.Email
	}
	if !strings.Contains(req.Email, "@") || req.Email == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid email"})
		return
	}
	if req.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password is required"})
		return
	}

	hash, err := HashPassword(req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to hash password"})
		return
	}

	userID := uuid.New().String()
	if err := h.repo.CreateUser(r.Context(), userID, req.Name, req.Email, hash); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
		return
	}

	sessionID, err := h.sm.CreateSession(r.Context(), userID)
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

	writeJSON(w, http.StatusOK, map[string]any{
		"id":    userID,
		"name":  req.Name,
		"email": req.Email,
	})
}
