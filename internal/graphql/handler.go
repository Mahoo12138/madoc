package graphql

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"mime/multipart"
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
	ct := r.Header.Get("Content-Type")
	var req graphQLRequest
	if strings.HasPrefix(ct, "multipart/form-data") {
		parsed, err := parseMultipartGraphQL(r)
		if err != nil {
			writeError(w, err.Error())
			return
		}
		req = *parsed
	} else {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, "invalid request body")
			return
		}
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
	case "createBlobUpload":
		data, err = h.createBlobUpload(ctx, req.Variables)
	case "setBlob":
		data, err = h.setBlob(ctx, req.Variables)
	case "completeBlobUpload":
		data, err = h.completeBlobUpload(ctx, req.Variables)
	case "deleteBlob":
		data, err = h.deleteBlob(ctx, req.Variables)
	case "listBlobs":
		data, err = h.listBlobs(ctx, req.Variables)
	case "workspaceBlobQuota":
		data, err = h.workspaceBlobQuota(ctx, req.Variables)
	case "releaseDeletedBlobs":
		data, err = h.releaseDeletedBlobs(ctx, req.Variables)
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
	case strings.Contains(q, "createblobupload"):
		return "createBlobUpload"
	case strings.Contains(q, "setblob"):
		return "setBlob"
	case strings.Contains(q, "completeblobupload"):
		return "completeBlobUpload"
	case strings.Contains(q, "deleteblob"):
		return "deleteBlob"
	case strings.Contains(q, "listblobs"):
		return "listBlobs"
	case strings.Contains(q, "workspaceblobquota"):
		return "workspaceBlobQuota"
	case strings.Contains(q, "releasedeletedblobs"):
		return "releaseDeletedBlobs"
	}
	return ""
}

type uploadedFile struct {
	Data     []byte
	Filename string
}

func parseMultipartGraphQL(r *http.Request) (*graphQLRequest, error) {
	_, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil {
		return nil, err
	}
	mr := multipart.NewReader(r.Body, params["boundary"])
	var operations json.RawMessage
	var fileMap map[string][]string
	files := make(map[string]uploadedFile)
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		name := part.FormName()
		switch name {
		case "operations":
			b, _ := io.ReadAll(part)
			operations = b
		case "map":
			b, _ := io.ReadAll(part)
			json.Unmarshal(b, &fileMap)
		default:
			b, _ := io.ReadAll(part)
			files[name] = uploadedFile{
				Data:     b,
				Filename: part.FileName(),
			}
		}
	}
	req := graphQLRequest{
		Variables: make(map[string]interface{}),
	}
	if err := json.Unmarshal(operations, &req); err != nil {
		return nil, err
	}
	if fileMap != nil {
		for fieldName, refs := range fileMap {
			f, ok := files[fieldName]
			if !ok {
				continue
			}
			for _, ref := range refs {
				path := strings.TrimPrefix(ref, "variables.")
				setNested(req.Variables, path, string(f.Data), f.Filename)
			}
		}
	}
	return &req, nil
}

func setNested(m map[string]interface{}, path string, data string, filename string) {
	parts := strings.Split(path, ".")
	current := m
	for i, p := range parts {
		if i == len(parts)-1 {
			current[p] = map[string]interface{}{
				"data":     data,
				"filename": filename,
			}
		} else {
			if next, ok := current[p].(map[string]interface{}); ok {
				current = next
			} else {
				next = make(map[string]interface{})
				current[p] = next
				current = next
			}
		}
	}
}

// Resolvers

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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"errors": []map[string]interface{}{{"message": msg}},
	})
}

// Blob resolvers

func (h *Handler) createBlobUpload(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID, _ := vars["workspaceId"].(string)
	key, _ := vars["key"].(string)
	if workspaceID == "" || key == "" {
		return nil, errors.New("workspaceId and key are required")
	}
	existing, _ := h.repo.GetBlob(ctx, workspaceID, key)
	if existing != nil {
		return map[string]interface{}{
			"method":         "GRAPHQL",
			"blobKey":        key,
			"alreadyUploaded": true,
		}, nil
	}
	return map[string]interface{}{
		"method":         "GRAPHQL",
		"blobKey":        key,
		"alreadyUploaded": false,
	}, nil
}

func (h *Handler) setBlob(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID, _ := vars["workspaceId"].(string)
	blobRaw, _ := vars["blob"].(map[string]interface{})
	if workspaceID == "" || blobRaw == nil {
		return nil, errors.New("workspaceId and blob are required")
	}
	blobData, _ := blobRaw["data"].(string)
	filename, _ := blobRaw["filename"].(string)
	if filename == "" {
		filename = uuid.New().String()
	}
	if blobData == "" {
		return nil, errors.New("blob data is empty")
	}
	mimeType := "application/octet-stream"
	if err := h.repo.CreateBlob(ctx, workspaceID, filename, int64(len(blobData)), mimeType, []byte(blobData)); err != nil {
		return nil, err
	}
	return map[string]interface{}{"key": filename, "size": len(blobData)}, nil
}

func (h *Handler) completeBlobUpload(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return map[string]interface{}{"success": true}, nil
}

func (h *Handler) deleteBlob(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID, _ := vars["workspaceId"].(string)
	key, _ := vars["key"].(string)
	if workspaceID == "" || key == "" {
		return nil, errors.New("workspaceId and key are required")
	}
	if err := h.repo.DeleteBlob(ctx, workspaceID, key); err != nil {
		return nil, err
	}
	return true, nil
}

func (h *Handler) listBlobs(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID, _ := vars["workspaceId"].(string)
	if workspaceID == "" {
		return nil, errors.New("workspaceId is required")
	}
	blobs, err := h.repo.ListBlobs(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]interface{}, 0, len(blobs))
	for _, b := range blobs {
		out = append(out, map[string]interface{}{
			"key":       b.Key,
			"size":      b.Size,
			"mime":      b.Mime,
			"createdAt": b.CreatedAt.Format(time.RFC3339),
			"status":    b.Status,
		})
	}
	return out, nil
}

func (h *Handler) workspaceBlobQuota(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return map[string]interface{}{
		"blobLimit": 104857600,
		"blobUsage": 0,
		"humanReadable": map[string]interface{}{
			"blobLimit": "100 MB",
			"blobUsage": "0 B",
		},
	}, nil
}

func (h *Handler) releaseDeletedBlobs(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("releaseDeletedBlobs called with vars: %v", vars)
	return true, nil
}
