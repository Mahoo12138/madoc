package graphql

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"madoc/internal/auth"
	"madoc/internal/db"

	"github.com/google/uuid"
)

type Handler struct {
	repo *db.Repo
}

func NewHandler(repo *db.Repo) *Handler {
	return &Handler{repo: repo}
}

type graphQLRequest struct {
	Query     string                 `json:"query"`
	Variables map[string]interface{} `json:"variables"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req graphQLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body")
		return
	}

	op := extractOperation(req.Query)
	if op == "" {
		writeError(w, "unknown operation")
		return
	}

	ctx := r.Context()
	var data interface{}
	var err error

	switch op {
	case "appConfig":
		data, err = h.appConfig(ctx)
	case "currentUser":
		data, err = h.currentUser(ctx)
	case "workspaces":
		data, err = h.workspaces(ctx)
	case "workspace":
		data, err = h.workspaceByID(ctx, req.Variables)
	case "serverConfig":
		data = h.serverConfig(ctx)
	case "createWorkspace":
		data, err = h.createWorkspace(ctx, req.Variables)
	case "deleteWorkspace":
		data, err = h.deleteWorkspace(ctx, req.Variables)
	}

	if err != nil {
		writeError(w, err.Error())
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			op: data,
		},
	})
}

func extractOperation(query string) string {
	q := strings.ToLower(query)
	switch {
	case strings.Contains(q, "serverconfig"):
		return "serverConfig"
	case strings.Contains(q, "currentuser"):
		return "currentUser"
	case strings.Contains(q, "createworkspace"):
		return "createWorkspace"
	case strings.Contains(q, "deleteworkspace"):
		return "deleteWorkspace"
	case strings.Contains(q, "workspace("):
		return "workspace"
	case strings.Contains(q, "workspaces"):
		return "workspaces"
	case strings.Contains(q, "appconfig"):
		return "appConfig"
	}
	return ""
}

func (h *Handler) appConfig(ctx context.Context) (interface{}, error) {
	ok, err := h.repo.IsInitialized(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"initialized": ok}, nil
}

func (h *Handler) currentUser(ctx context.Context) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, nil
	}
	return map[string]interface{}{
		"id":        user.ID,
		"name":      user.Name,
		"email":     user.Email,
		"avatarUrl": user.AvatarURL,
	}, nil
}

func (h *Handler) workspaces(ctx context.Context) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	list, err := h.repo.ListWorkspacesByUser(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]interface{}, 0, len(list))
	for _, w := range list {
		out = append(out, workspaceResponse(w, db.PermOwner))
	}
	return out, nil
}

func (h *Handler) workspaceByID(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	id, _ := vars["id"].(string)
	if id == "" {
		return nil, errors.New("id is required")
	}
	w, err := h.repo.GetWorkspace(ctx, id)
	if err != nil {
		return nil, err
	}
	return workspaceResponse(*w, 0), nil
}

func (h *Handler) serverConfig(ctx context.Context) interface{} {
	initialized, _ := h.repo.IsInitialized(ctx)
	return map[string]interface{}{
		"version":                "0.26.2",
		"name":                   "madoc",
		"baseUrl":                "",
		"initialized":            initialized,
		"type":                   "Selfhosted",
		"features":               []interface{}{},
		"availableUserFeatures":  []interface{}{},
		"credentialsRequirement": map[string]interface{}{"email": true, "password": true},
		"oauthProviders":         []interface{}{},
	}
}

func (h *Handler) createWorkspace(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	id := uuid.New().String()
	permID := uuid.New().String()
	if err := h.repo.CreateWorkspace(ctx, id, false, nil); err != nil {
		return nil, err
	}
	if err := h.repo.AddWorkspacePermission(ctx, permID, id, user.ID, db.PermOwner); err != nil {
		return nil, err
	}
	w, err := h.repo.GetWorkspace(ctx, id)
	if err != nil {
		return nil, err
	}
	return workspaceResponse(*w, db.PermOwner), nil
}

func (h *Handler) deleteWorkspace(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	id, _ := vars["id"].(string)
	if id == "" {
		return nil, errors.New("id is required")
	}
	if err := h.repo.DeleteWorkspace(ctx, id); err != nil {
		return nil, err
	}
	return true, nil
}

func workspaceResponse(w db.Workspace, permission int) map[string]interface{} {
	return map[string]interface{}{
		"id":          w.ID,
		"name":        w.Name,
		"public":      w.Public,
		"avatarKey":   w.AvatarKey,
		"createdAt":   w.CreatedAt.Format(time.RFC3339),
		"memberCount": 1,
		"permission":  permission,
	}
}

func writeError(w http.ResponseWriter, msg string) {
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"errors": []map[string]interface{}{{"message": msg}},
	})
}
