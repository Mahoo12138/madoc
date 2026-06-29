package graphql

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
	"golang.org/x/crypto/bcrypt"
)

type permStr string

const (
	roleOwner       permStr = "Owner"
	roleAdmin       permStr = "Admin"
	roleCollaborator permStr = "Collaborator"
	roleExternal    permStr = "External"
)

var allPermissions = []string{
	"Workspace_Administrators_Manage", "Workspace_Blobs_List", "Workspace_Blobs_Read",
	"Workspace_Blobs_Write", "Workspace_Copilot", "Workspace_CreateDoc", "Workspace_Delete",
	"Workspace_Organize_Read", "Workspace_Payment_Manage", "Workspace_Properties_Create",
	"Workspace_Properties_Delete", "Workspace_Properties_Read", "Workspace_Properties_Update",
	"Workspace_Read", "Workspace_Settings_Read", "Workspace_Settings_Update",
	"Workspace_Sync", "Workspace_TransferOwner", "Workspace_Users_Manage", "Workspace_Users_Read",
}

func roleForPerm(t int) permStr {
	switch t {
	case db.PermOwner:
		return roleOwner
	case db.PermAdmin:
		return roleAdmin
	case db.PermCollaborator:
		return roleCollaborator
	default:
		return roleExternal
	}
}

func permissionsForRole(role permStr) map[string]interface{} {
	m := make(map[string]interface{}, len(allPermissions))
	for _, p := range allPermissions {
		m[p] = true
	}
	// External has limited permissions
	if role == roleExternal {
		for _, p := range []string{"Workspace_Administrators_Manage", "Workspace_Copilot", "Workspace_Delete",
			"Workspace_Payment_Manage", "Workspace_Settings_Update", "Workspace_TransferOwner",
			"Workspace_Users_Manage", "Workspace_Blobs_Write"} {
			m[p] = false
		}
	}
	return m
}

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
		data, err = h.workspaceByID(ctx, req.Variables, req.Query)
	case "serverConfig":
		data = h.serverConfig(ctx)
	case "createWorkspace":
		data, err = h.createWorkspace(ctx)
	case "deleteWorkspace":
		data, err = h.deleteWorkspace(ctx, req.Variables)
	case "updateWorkspace":
		data, err = h.updateWorkspace(ctx, req.Variables)
	case "publishDoc":
		data, err = h.publishDoc(ctx, req.Variables)
	case "revokePublicDoc":
		data, err = h.revokePublicDoc(ctx, req.Variables)
	case "leaveWorkspace":
		data, err = h.leaveWorkspace(ctx, req.Variables)
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
	case "inviteMembers":
		data, err = h.inviteMembers(ctx, req.Variables)
	case "acceptInviteById":
		data, err = h.acceptInviteById(ctx, req.Variables)
	case "acceptInviteByInviteId":
		data, err = h.acceptInviteById(ctx, req.Variables)
	case "getInviteInfo":
		data, err = h.getInviteInfo(ctx, req.Variables)
	case "updateDocTree":
		data, err = h.updateDocTree(ctx, req.Variables)
	case "regeneratePubToken":
		data, err = h.regeneratePubToken(ctx, req.Variables)
	case "createWorktreeWorkspace":
		data, err = h.createWorktreeWorkspace(ctx, req.Variables)
	case "getGitStatus":
		data, err = h.getGitStatus(ctx, req.Variables)
	case "gitAdd":
		data, err = h.gitAdd(ctx, req.Variables)
	case "gitStageFiles":
		data, err = h.gitStageFiles(ctx, req.Variables)
	case "gitCommit":
		data, err = h.gitCommit(ctx, req.Variables)
	case "gitPush":
		data, err = h.gitPush(ctx, req.Variables)
	case "gitPull":
		data, err = h.gitPull(ctx, req.Variables)
	case "gitDiff":
		data, err = h.gitDiff(ctx, req.Variables)
	case "gitLog":
		data, err = h.gitLog(ctx, req.Variables)
	case "listUsers":
		data, err = h.listUsers(ctx, req.Variables)
	case "getUserByEmail":
		data, err = h.getUserByEmail(ctx, req.Variables)
	case "getUser":
		data, err = h.getUser(ctx, req.Variables)
	case "getPublicUserById":
		data, err = h.getPublicUserById(ctx, req.Variables)
	case "createUser":
		data, err = h.createUser(ctx, req.Variables)
	case "deleteUser":
		data, err = h.deleteUser(ctx, req.Variables)
	case "disableUser":
		data, err = h.disableUser(ctx, req.Variables)
	case "enableUser":
		data, err = h.enableUser(ctx, req.Variables)
	case "importUsers":
		data, err = h.importUsers(ctx, req.Variables)
	case "updateAccountFeatures":
		data, err = h.updateAccountFeatures(ctx, req.Variables)
	case "updateAccount":
		data, err = h.updateAccount(ctx, req.Variables)
	case "updateAppConfig":
		data, err = h.updateAppConfig(ctx, req.Variables)
	case "validateConfig":
		data, err = h.validateConfig(ctx, req.Variables)
	case "revokeMemberPermission":
		data, err = h.revokeMemberPermission(ctx, req.Variables)
	case "approveWorkspaceTeamMember":
		data, err = h.approveWorkspaceTeamMember(ctx, req.Variables)
	case "grantWorkspaceTeamMember":
		data, err = h.grantWorkspaceTeamMember(ctx, req.Variables)
	case "createInviteLink":
		data, err = h.createInviteLink(ctx, req.Variables)
	case "revokeInviteLink":
		data, err = h.revokeInviteLink(ctx, req.Variables)
	case "uploadAvatar":
		data, err = h.uploadAvatar(ctx, req.Variables)
	case "removeAvatar":
		data, err = h.removeAvatar(ctx, req.Variables)
	case "updateUserProfile":
		data, err = h.updateUserProfile(ctx, req.Variables)
	case "updateUserSettings":
		data, err = h.updateUserSettings(ctx, req.Variables)
	case "changeEmail":
		data, err = h.changeEmail(ctx, req.Variables)
	case "changePassword":
		data, err = h.changePassword(ctx, req.Variables)
	case "deleteAccount":
		data, err = h.deleteAccount(ctx, req.Variables)
	case "generateUserAccessToken":
		data, err = h.generateUserAccessToken(ctx, req.Variables)
	case "revokeUserAccessToken":
		data, err = h.revokeUserAccessToken(ctx, req.Variables)
	case "generateLicenseKey":
		data, err = h.generateLicenseKey(ctx, req.Variables)
	case "activateLicense":
		data, err = h.activateLicense(ctx, req.Variables)
	case "deactivateLicense":
		data, err = h.deactivateLicense(ctx, req.Variables)
	case "installLicense":
		data, err = h.installLicense(ctx, req.Variables)
	case "previewLicense":
		data, err = h.previewLicense(ctx, req.Variables)
	case "createLicenseKey":
		data, err = h.createLicenseKey(ctx, req.Variables)
	case "deleteLicenseKey":
		data, err = h.deleteLicenseKey(ctx, req.Variables)
	case "updateLicenseKey":
		data, err = h.updateLicenseKey(ctx, req.Variables)
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
	case strings.Contains(q, "updateworkspace"):
		return "updateWorkspace"
	case strings.Contains(q, "publishdoc"):
		return "publishDoc"
	case strings.Contains(q, "revokepublicdoc"):
		return "revokePublicDoc"
	case strings.Contains(q, "leaveworkspace"):
		return "leaveWorkspace"
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
	case strings.Contains(q, "invitemembers"):
		return "inviteMembers"
	case strings.Contains(q, "acceptinvitebyinviteid"):
		return "acceptInviteByInviteId"
	case strings.Contains(q, "acceptinvitebyid"):
		return "acceptInviteById"
	case strings.Contains(q, "getinviteinfo"):
		return "getInviteInfo"
	case strings.Contains(q, "updatedoctree"):
		return "updateDocTree"
	case strings.Contains(q, "regeneratepubtoken"):
		return "regeneratePubToken"
	case strings.Contains(q, "createworktreeworkspace"):
		return "createWorktreeWorkspace"
	case strings.Contains(q, "getgitstatus"):
		return "getGitStatus"
	case strings.Contains(q, "gitadd"):
		return "gitAdd"
	case strings.Contains(q, "gitstagefiles"):
		return "gitStageFiles"
	case strings.Contains(q, "gitcommit"):
		return "gitCommit"
	case strings.Contains(q, "gitpush"):
		return "gitPush"
	case strings.Contains(q, "gitpull"):
		return "gitPull"
	case strings.Contains(q, "gitdiff"):
		return "gitDiff"
	case strings.Contains(q, "gitlog"):
		return "gitLog"
	case strings.Contains(q, "listusers"):
		return "listUsers"
	case strings.Contains(q, "userscount"):
		return "listUsers"
	case strings.Contains(q, "users("):
		return "listUsers"
	case strings.Contains(q, "userbyemail"):
		return "getUserByEmail"
	case strings.Contains(q, "user("):
		return "getUser"
	case strings.Contains(q, "publicuserbyid"):
		return "getPublicUserById"
	case strings.Contains(q, "createuser"):
		return "createUser"
	case strings.Contains(q, "deleteuser"):
		return "deleteUser"
	case strings.Contains(q, "banuser"):
		return "disableUser"
	case strings.Contains(q, "enableuser"):
		return "enableUser"
	case strings.Contains(q, "importusers"):
		return "importUsers"
	case strings.Contains(q, "updateuserfeatures"):
		return "updateAccountFeatures"
	case strings.Contains(q, "updateuser("):
		return "updateAccount"
	case strings.Contains(q, "updateappconfig"):
		return "updateAppConfig"
	case strings.Contains(q, "validateappconfig"):
		return "validateConfig"
	case strings.Contains(q, "revokemember"):
		return "revokeMemberPermission"
	case strings.Contains(q, "approvemember"):
		return "approveWorkspaceTeamMember"
	case strings.Contains(q, "grantmember"):
		return "grantWorkspaceTeamMember"
	case strings.Contains(q, "createinvitelink"):
		return "createInviteLink"
	case strings.Contains(q, "revokeinvitelink"):
		return "revokeInviteLink"
	case strings.Contains(q, "uploadavatar"):
		return "uploadAvatar"
	case strings.Contains(q, "removeavatar"):
		return "removeAvatar"
	case strings.Contains(q, "updateprofile"):
		return "updateUserProfile"
	case strings.Contains(q, "updatesettings"):
		return "updateUserSettings"
	case strings.Contains(q, "changeemail"):
		return "changeEmail"
	case strings.Contains(q, "changepassword"):
		return "changePassword"
	case strings.Contains(q, "deleteaccount"):
		return "deleteAccount"
	case strings.Contains(q, "generateuseraccesstoken"):
		return "generateUserAccessToken"
	case strings.Contains(q, "revokeuseraccesstoken"):
		return "revokeUserAccessToken"
	case strings.Contains(q, "generatelicensekey"):
		return "generateLicenseKey"
	case strings.Contains(q, "activatelicense"):
		return "activateLicense"
	case strings.Contains(q, "deactivatelicense"):
		return "deactivateLicense"
	case strings.Contains(q, "installlicense"):
		return "installLicense"
	case strings.Contains(q, "previewlicense"):
		return "previewLicense"
	case strings.Contains(q, "createlicensekey"):
		return "createLicenseKey"
	case strings.Contains(q, "deletelicensekey"):
		return "deleteLicenseKey"
	case strings.Contains(q, "updatelicensekey"):
		return "updateLicenseKey"
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

func resolveVar(vars map[string]interface{}, query string, names ...string) string {
	for _, n := range names {
		if v, ok := vars[n].(string); ok && v != "" {
			return v
		}
	}
	if query != "" {
		q := strings.ToLower(query)
		for _, n := range names {
			// match patterns like: id: $someVar or workspaceId: $someVar
			for _, p := range []string{n + ":", n + " :"} {
				idx := strings.Index(q, p)
				if idx >= 0 {
					rest := q[idx+len(p):]
					rest = strings.TrimSpace(rest)
					if strings.HasPrefix(rest, "$") {
						end := strings.IndexAny(rest, " )}\n\r")
						if end > 0 {
							varName := strings.TrimSpace(rest[1:end])
							if v, ok := vars[varName].(string); ok && v != "" {
								return v
							}
						}
					}
				}
			}
		}
	}
	return ""
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

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
	sessionID := auth.GetSessionID(ctx)
	return map[string]interface{}{
		"id":            user.ID,
		"name":          user.Name,
		"email":         user.Email,
		"emailVerified": true,
		"avatarUrl":     user.AvatarURL,
		"token": map[string]interface{}{
			"sessionToken": sessionID,
		},
		"features": []interface{}{},
		"quota": map[string]interface{}{
			"name":         "Free Plan",
			"blobLimit":    104857600,
			"storageQuota": 1073741824,
			"historyPeriod": 90,
			"memberLimit":  10,
			"humanReadable": map[string]interface{}{
				"name":          "Free Plan",
				"blobLimit":     "100 MB",
				"storageQuota":  "1 GB",
				"historyPeriod": "90 days",
				"memberLimit":   "10",
			},
		},
		"quotaUsage": map[string]interface{}{
			"storageQuota": 0,
		},
		"settings": map[string]interface{}{
			"receiveInvitationEmail": true,
			"receiveMentionEmail":    true,
			"receiveCommentEmail":    true,
		},
		"invoiceCount":     0,
		"invoices":         []interface{}{},
		"notifications":    map[string]interface{}{"totalCount": 0, "edges": []interface{}{}, "pageInfo": map[string]interface{}{}},
		"subscriptions":    []interface{}{},
		"calendarAccounts": []interface{}{},
		"copilot":          map[string]interface{}{},
	}, nil
}

func (h *Handler) workspaceDetail(ctx context.Context, workspace *db.Workspace, userID string, query string, vars ...map[string]interface{}) map[string]interface{} {
	id := workspace.ID
	q := strings.ToLower(query)
	if userID == "" {
		userID = "unknown"
	}
	perm, err := h.repo.GetWorkspacePermission(ctx, id, userID)
	permType := db.PermExternal
	if err == nil && perm != nil {
		permType = perm.Type
	}
	role := roleForPerm(permType)

	resp := map[string]interface{}{
		"id":          id,
		"name":        workspace.Name,
		"public":      workspace.Public,
		"avatarKey":   workspace.AvatarKey,
		"createdAt":   workspace.CreatedAt.Format(time.RFC3339),
		"permission":  permType,
		"initialized": true,
	}
	if strings.Contains(q, "role") {
		resp["role"] = string(role)
	}
	if strings.Contains(q, "team") {
		resp["team"] = false
	}
	if strings.Contains(q, "membercount") || strings.Contains(q, "member_count") {
		mc, _ := h.repo.CountWorkspaceMembers(ctx, id)
		resp["memberCount"] = mc
	} else {
		resp["memberCount"] = 1
	}
	if strings.Contains(q, "owner") {
		owner, err := h.repo.GetWorkspaceOwner(ctx, id)
		if err == nil && owner != nil {
			resp["owner"] = map[string]interface{}{
				"id": owner.ID,
			}
		} else {
			resp["owner"] = nil
		}
	}
	if strings.Contains(q, "permissions") || strings.Contains(q, "workspace_read") || strings.Contains(q, "workspace_delete") {
		resp["permissions"] = permissionsForRole(role)
	}
	if strings.Contains(q, "enableai") || strings.Contains(q, "enablesharing") || strings.Contains(q, "enableurlpreview") || strings.Contains(q, "enabledocembedding") {
		cfgStr, _ := h.repo.GetAppConfig(ctx, "ws:"+id+":config")
		cfg := map[string]interface{}{}
		json.Unmarshal([]byte(cfgStr), &cfg)
		resp["enableAi"] = getBool(cfg, "enableAi", false)
		resp["enableSharing"] = getBool(cfg, "enableSharing", true)
		resp["enableUrlPreview"] = getBool(cfg, "enableUrlPreview", true)
		resp["enableDocEmbedding"] = getBool(cfg, "enableDocEmbedding", false)
	}
	// nested docs
	if strings.Contains(q, "publicdocs") {
		publicDocs, _ := h.repo.ListPublicDocsByWorkspace(ctx, id)
		docs := make([]map[string]interface{}, 0, len(publicDocs))
		for _, p := range publicDocs {
			docs = append(docs, map[string]interface{}{
				"id":   p.DocID,
				"mode": p.Mode,
			})
		}
		resp["publicDocs"] = docs
	}
	if strings.Contains(q, "quota") {
		resp["quota"] = map[string]interface{}{
			"blobLimit": 104857600,
			"humanReadable": map[string]interface{}{
				"blobLimit": "100 MB",
			},
		}
	}
	if strings.Contains(q, "subscription") {
		resp["subscription"] = nil
	}
	if strings.Contains(q, "calendars") {
		resp["calendars"] = []interface{}{}
	}
	if strings.Contains(q, "byoksettings") || strings.Contains(q, "byokusage") {
		resp["byokSettings"] = nil
		resp["byokUsage"] = []interface{}{}
	}
	if strings.Contains(q, "commentchanges") {
		resp["commentChanges"] = map[string]interface{}{
			"totalCount": 0,
			"edges":      []interface{}{},
			"pageInfo":   map[string]interface{}{},
		}
	}
	if strings.Contains(q, "license") {
		resp["license"] = nil
	}
	if strings.Contains(q, "doc(") || strings.Contains(q, "docid:") || strings.Contains(q, "pageid:") {
		var docID string
		if len(vars) > 0 && vars[0] != nil {
			docID = resolveVar(vars[0], "", "docId", "pageId", "doc_id", "page_id")
		}
		if docID == "" && len(vars) > 0 && vars[0] != nil {
			docID = resolveVar(vars[0], q, "docId", "pageId", "doc_id", "page_id")
		}
		if docID == "" {
			for _, prefix := range []string{"docid:", "pageid:"} {
				if pi := strings.Index(q, prefix); pi >= 0 {
					raw := q[pi+len(prefix):]
					end := strings.IndexAny(raw, " )}\n")
					if end > 0 {
						docID = strings.Trim(raw[:end], "\"' ")
					}
				}
			}
		}
		if docID != "" && len(docID) < 100 {
			page, err := h.repo.GetWorkspacePage(ctx, id, docID)
			if err == nil && page != nil {
				resp["doc"] = map[string]interface{}{
					"id":     page.DocID,
					"mode":   page.Mode,
					"public": page.Public,
					"title":  page.Title,
				}
			}
		}
	}
	return resp
}

func getBool(m map[string]interface{}, key string, def bool) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return def
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
	q := "owner team initialized membercount role"
	out := make([]map[string]interface{}, 0, len(list))
	for _, w := range list {
		out = append(out, h.workspaceDetail(ctx, &w, user.ID, q))
	}
	return out, nil
}

func (h *Handler) workspaceByID(ctx context.Context, vars map[string]interface{}, query string) (interface{}, error) {
	id := resolveVar(vars, query, "id", "workspaceId")
	if id == "" {
		return nil, errors.New("id is required")
	}
	w, err := h.repo.GetWorkspace(ctx, id)
	if err != nil {
		return nil, err
	}
	user := auth.GetUser(ctx)
	userID := ""
	if user != nil {
		userID = user.ID
	}
	return h.workspaceDetail(ctx, w, userID, query), nil
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

func (h *Handler) createWorkspace(ctx context.Context) (interface{}, error) {
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
	return h.workspaceDetail(ctx, w, user.ID, "owner team membercount role public createdAt"), nil
}

func (h *Handler) deleteWorkspace(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	id := resolveVar(vars, "", "id", "workspaceId")
	if id == "" {
		return nil, errors.New("id is required")
	}
	if err := h.repo.DeleteWorkspace(ctx, id); err != nil {
		return nil, err
	}
	return true, nil
}

func (h *Handler) updateWorkspace(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	input, hasInput := vars["input"].(map[string]interface{})
	if !hasInput {
		input = make(map[string]interface{})
		for _, k := range []string{"id", "public", "name", "avatarKey", "enableAi", "enableSharing",
			"enableUrlPreview", "enableDocEmbedding"} {
			if v, ok := vars[k]; ok {
				input[k] = v
			}
		}
	}
	id, _ := input["id"].(string)
	if id == "" {
		return nil, errors.New("input.id is required")
	}

	// handle core workspace fields
	if v, ok := input["public"]; ok {
		public, _ := v.(bool)
		name, _ := input["name"].(string)
		var nameP *string
		if name != "" {
			nameP = &name
		}
		if err := h.repo.UpdateWorkspace(ctx, id, public, nameP, nil); err != nil {
			return nil, err
		}
	} else if v, ok := input["name"]; ok {
		name, _ := v.(string)
		if name != "" {
			if err := h.repo.UpdateWorkspace(ctx, id, false, &name, nil); err != nil {
				return nil, err
			}
		}
	}

	// handle config fields
	cfgChanged := false
	cfgStr, _ := h.repo.GetAppConfig(ctx, "ws:"+id+":config")
	cfg := map[string]interface{}{}
	json.Unmarshal([]byte(cfgStr), &cfg)
	for _, k := range []string{"enableAi", "enableSharing", "enableUrlPreview", "enableDocEmbedding"} {
		if v, ok := input[k]; ok {
			cfg[k] = v
			cfgChanged = true
		}
	}
	if cfgChanged {
		b, _ := json.Marshal(cfg)
		h.repo.SetAppConfig(ctx, "ws:"+id+":config", string(b))
	}

	w, err := h.repo.GetWorkspace(ctx, id)
	if err != nil {
		return nil, err
	}
	user := auth.GetUser(ctx)
	userID := ""
	if user != nil {
		userID = user.ID
	}
	return h.workspaceDetail(ctx, w, userID, "owner team membercount role public createdAt updatedAt enableAi enableSharing enableUrlPreview enableDocEmbedding"), nil
}

func (h *Handler) publishDoc(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID := resolveVar(vars, "", "workspaceId", "id")
	docID := resolveVar(vars, "", "docId", "pageId", "doc_id", "page_id")
	modeFloat, _ := vars["mode"].(float64)
	mode := int(modeFloat)
	if mode == 0 {
		modeStr, ok := vars["mode"].(string)
		if ok {
			switch strings.ToLower(modeStr) {
			case "edgeless":
				mode = 1
			default:
				mode = 0
			}
		}
	}
	if workspaceID == "" || docID == "" {
		return nil, errors.New("workspaceId and docId are required")
	}
	if err := h.repo.UpsertWorkspacePage(ctx, &db.WorkspacePage{
		WorkspaceID: workspaceID,
		DocID:       docID,
		Public:      true,
		Mode:        mode,
	}); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id":   docID,
		"mode": mode,
	}, nil
}

func (h *Handler) revokePublicDoc(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID := resolveVar(vars, "", "workspaceId", "id")
	docID := resolveVar(vars, "", "docId", "pageId", "doc_id", "page_id")
	if workspaceID == "" || docID == "" {
		return nil, errors.New("workspaceId and docId are required")
	}
	if err := h.repo.UpsertWorkspacePage(ctx, &db.WorkspacePage{
		WorkspaceID: workspaceID,
		DocID:       docID,
		Public:      false,
		Mode:        0,
	}); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id":     docID,
		"mode":   0,
		"public": false,
	}, nil
}

func (h *Handler) leaveWorkspace(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID := resolveVar(vars, "", "workspaceId", "id")
	if workspaceID == "" {
		return nil, errors.New("workspaceId is required")
	}
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	if err := h.repo.RemoveWorkspacePermission(ctx, workspaceID, user.ID); err != nil {
		return nil, err
	}
	return true, nil
}

func writeError(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"errors": []map[string]interface{}{{"message": msg}},
	})
}

// ---------------------------------------------------------------------------
// Blob resolvers
// ---------------------------------------------------------------------------

func (h *Handler) createBlobUpload(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID, _ := vars["workspaceId"].(string)
	key, _ := vars["key"].(string)
	if workspaceID == "" || key == "" {
		return nil, errors.New("workspaceId and key are required")
	}
	existing, _ := h.repo.GetBlob(ctx, workspaceID, key)
	if existing != nil {
		return map[string]interface{}{
			"method":          "GRAPHQL",
			"blobKey":         key,
			"alreadyUploaded": true,
		}, nil
	}
	return map[string]interface{}{
		"method":          "GRAPHQL",
		"blobKey":         key,
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

// ---- Task 2: Member invitations ----

func (h *Handler) inviteMembers(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	workspaceID := resolveVar(vars, "", "workspaceId", "id")
	if workspaceID == "" {
		return nil, errors.New("workspaceId is required")
	}
	emailsRaw, _ := vars["emails"].([]interface{})
	if len(emailsRaw) == 0 {
		return nil, errors.New("emails is required")
	}
	var results []map[string]interface{}
	for _, e := range emailsRaw {
		email, _ := e.(string)
		if email == "" {
			continue
		}
		id := uuid.New().String()
		err := h.repo.CreateWorkspaceInvite(ctx, id, workspaceID, email, user.ID)
		inviteID := id
		if err != nil {
			inviteID = ""
		}
		results = append(results, map[string]interface{}{
			"email":    email,
			"inviteId": inviteID,
		})
	}
	return results, nil
}

func (h *Handler) acceptInviteById(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	inviteID := resolveVar(vars, "", "inviteId", "id")
	if inviteID == "" {
		return nil, errors.New("inviteId is required")
	}
	inv, err := h.repo.GetWorkspaceInvite(ctx, inviteID)
	if err != nil {
		return false, nil
	}
	if inv.Status != "Pending" {
		return false, nil
	}
	// Find user by email (the invited user must have the same email)
	if user.Email != inv.Email {
		return false, nil
	}
	// Add workspace permission
	permID := uuid.New().String()
	if err := h.repo.AddWorkspacePermission(ctx, permID, inv.WorkspaceID, user.ID, db.PermCollaborator); err != nil {
		return false, nil
	}
	// Mark invite as Accepted
	h.repo.UpdateWorkspaceInviteStatus(ctx, inviteID, "Accepted")
	return true, nil
}

func (h *Handler) getInviteInfo(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	inviteID := resolveVar(vars, "", "inviteId", "id")
	if inviteID == "" {
		return nil, errors.New("inviteId is required")
	}
	inv, err := h.repo.GetWorkspaceInvite(ctx, inviteID)
	if err != nil {
		return nil, errors.New("invite not found")
	}
	ws, err := h.repo.GetWorkspace(ctx, inv.WorkspaceID)
	if err != nil {
		return nil, errors.New("workspace not found")
	}
	inviter, err := h.repo.GetUserByID(ctx, inv.InviterID)
	if err != nil {
		return nil, errors.New("inviter not found")
	}
	inviteeUser, _ := h.repo.FindUserByEmail(ctx, inv.Email)
	status := inv.Status
	resp := map[string]interface{}{
		"workspace": map[string]interface{}{
			"id":     ws.ID,
			"name":   ws.Name,
			"avatar": ws.AvatarKey,
		},
		"user": map[string]interface{}{
			"id":        inviter.ID,
			"name":      inviter.Name,
			"avatarUrl": inviter.AvatarURL,
		},
		"status": status,
	}
	if inviteeUser != nil {
		resp["invitee"] = map[string]interface{}{
			"id":        inviteeUser.ID,
			"name":      inviteeUser.Name,
			"email":     inviteeUser.Email,
			"avatarUrl": inviteeUser.AvatarURL,
		}
	} else {
		resp["invitee"] = map[string]interface{}{
			"id":        "",
			"name":      "",
			"email":     inv.Email,
			"avatarUrl": "",
		}
	}
	return resp, nil
}

// ---- Phase 5: User & Admin APIs ----

func (h *Handler) listUsers(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	filter, _ := vars["filter"].(map[string]interface{})
	first := 20
	skip := 0
	keyword := ""
	if filter != nil {
		if f, ok := filter["first"].(float64); ok {
			first = int(f)
		}
		if s, ok := filter["skip"].(float64); ok {
			skip = int(s)
		}
		if k, ok := filter["keyword"].(string); ok {
			keyword = k
		}
	}
	users, err := h.repo.ListUsers(ctx, db.ListUsersFilter{First: first, Skip: skip, Keyword: keyword})
	if err != nil {
		return nil, err
	}
	total, _ := h.repo.CountUsersFiltered(ctx, keyword)
	out := make([]map[string]interface{}, 0, len(users))
	for _, u := range users {
		features, _ := h.repo.GetUserFeatures(ctx, u.ID)
		fNames := make([]string, 0, len(features))
		for _, f := range features {
			fNames = append(fNames, f.Name)
		}
		avatarURL := ""
		if u.AvatarURL != nil {
			avatarURL = *u.AvatarURL
		}
		hasPW := u.Password != nil && *u.Password != ""
		out = append(out, map[string]interface{}{
			"id":            u.ID,
			"name":          u.Name,
			"email":         u.Email,
			"disabled":      u.Disabled,
			"features":      fNames,
			"hasPassword":   hasPW,
			"emailVerified": true,
			"avatarUrl":     avatarURL,
		})
	}
	return map[string]interface{}{
		"users":       out,
		"usersCount":  total,
	}, nil
}

func (h *Handler) getUserByEmail(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	email, _ := vars["email"].(string)
	if email == "" {
		return nil, errors.New("email is required")
	}
	u, err := h.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, errors.New("user not found")
	}
	features, _ := h.repo.GetUserFeatures(ctx, u.ID)
	fNames := make([]string, 0, len(features))
	for _, f := range features {
		fNames = append(fNames, f.Name)
	}
	avatarURL := ""
	if u.AvatarURL != nil {
		avatarURL = *u.AvatarURL
	}
	hasPW := u.Password != nil && *u.Password != ""
	return map[string]interface{}{
		"id":            u.ID,
		"name":          u.Name,
		"email":         u.Email,
		"features":      fNames,
		"hasPassword":   hasPW,
		"emailVerified": true,
		"avatarUrl":     avatarURL,
		"disabled":      u.Disabled,
	}, nil
}

func (h *Handler) getUser(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	email, _ := vars["email"].(string)
	if email == "" {
		return nil, errors.New("email is required")
	}
	u, err := h.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return map[string]interface{}{
			"__typename": "LimitedUserType",
			"email":      email,
			"hasPassword": false,
		}, nil
	}
	avatarURL := ""
	if u.AvatarURL != nil {
		avatarURL = *u.AvatarURL
	}
	hasPW := u.Password != nil && *u.Password != ""
	return map[string]interface{}{
		"__typename":  "UserType",
		"id":          u.ID,
		"name":        u.Name,
		"avatarUrl":   avatarURL,
		"email":       u.Email,
		"hasPassword": hasPW,
	}, nil
}

func (h *Handler) getPublicUserById(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	id, _ := vars["id"].(string)
	if id == "" {
		return nil, errors.New("id is required")
	}
	u, err := h.repo.GetPublicUserByID(ctx, id)
	if err != nil {
		return nil, errors.New("user not found")
	}
	avatarURL := ""
	if u.AvatarURL != nil {
		avatarURL = *u.AvatarURL
	}
	return map[string]interface{}{
		"id":        u.ID,
		"avatarUrl": avatarURL,
		"name":      u.Name,
	}, nil
}

func (h *Handler) createUser(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	input, _ := vars["input"].(map[string]interface{})
	if input == nil {
		return nil, errors.New("input is required")
	}
	email, _ := input["email"].(string)
	name, _ := input["name"].(string)
	password, _ := input["password"].(string)
	if email == "" {
		return nil, errors.New("email is required")
	}
	id := uuid.New().String()
	if password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		err = h.repo.CreateUser(ctx, id, name, email, string(hash))
		if err != nil {
			return nil, err
		}
	} else {
		err := h.repo.CreateUser(ctx, id, name, email, "")
		if err != nil {
			return nil, err
		}
	}
	return map[string]interface{}{"id": id}, nil
}

func (h *Handler) deleteUser(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	id, _ := vars["id"].(string)
	if id == "" {
		return nil, errors.New("id is required")
	}
	err := h.repo.DeleteUser(ctx, id)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"success": true}, nil
}

func (h *Handler) disableUser(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	id, _ := vars["id"].(string)
	if id == "" {
		return nil, errors.New("id is required")
	}
	err := h.repo.ToggleUserDisabled(ctx, id, true)
	if err != nil {
		return nil, err
	}
	u, _ := h.repo.GetPublicUserByID(ctx, id)
	if u == nil {
		return map[string]interface{}{"email": "", "disabled": true}, nil
	}
	return map[string]interface{}{"email": u.Email, "disabled": true}, nil
}

func (h *Handler) enableUser(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	id, _ := vars["id"].(string)
	if id == "" {
		return nil, errors.New("id is required")
	}
	err := h.repo.ToggleUserDisabled(ctx, id, false)
	if err != nil {
		return nil, err
	}
	u, _ := h.repo.GetPublicUserByID(ctx, id)
	if u == nil {
		return map[string]interface{}{"email": "", "disabled": false}, nil
	}
	return map[string]interface{}{"email": u.Email, "disabled": false}, nil
}

func (h *Handler) importUsers(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	input, _ := vars["input"].(map[string]interface{})
	if input == nil {
		return nil, errors.New("input is required")
	}
	usersRaw, _ := input["users"].([]interface{})
	var results []map[string]interface{}
	for _, raw := range usersRaw {
		u, _ := raw.(map[string]interface{})
		if u == nil {
			continue
		}
		email, _ := u["email"].(string)
		name, _ := u["name"].(string)
		password, _ := u["password"].(string)
		if email == "" {
			results = append(results, map[string]interface{}{
				"__typename": "UserImportFailedType",
				"email":      email,
				"error":      "email is required",
			})
			continue
		}
		id := uuid.New().String()
		var hash string
		if password != "" {
			b, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
			hash = string(b)
		}
		err := h.repo.CreateUser(ctx, id, name, email, hash)
		if err != nil {
			results = append(results, map[string]interface{}{
				"__typename": "UserImportFailedType",
				"email":      email,
				"error":      err.Error(),
			})
		} else {
			results = append(results, map[string]interface{}{
				"__typename": "UserType",
				"id":         id,
				"name":       name,
				"email":      email,
			})
		}
	}
	return results, nil
}

func (h *Handler) updateAccountFeatures(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	userID, _ := vars["userId"].(string)
	featuresRaw, _ := vars["features"].([]interface{})
	if userID == "" {
		return nil, errors.New("userId is required")
	}
	var names []string
	for _, f := range featuresRaw {
		if s, ok := f.(string); ok {
			id := uuid.New().String()
			h.repo.SetUserFeature(ctx, id, userID, s, true)
			names = append(names, s)
		}
	}
	return names, nil
}

func (h *Handler) updateAccount(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	id, _ := vars["id"].(string)
	input, _ := vars["input"].(map[string]interface{})
	if id == "" {
		return nil, errors.New("id is required")
	}
	name, _ := input["name"].(string)
	email, _ := input["email"].(string)
	if name == "" && email == "" {
		return nil, errors.New("name or email is required")
	}
	existing, err := h.repo.GetPublicUserByID(ctx, id)
	if err != nil {
		return nil, errors.New("user not found")
	}
	if name == "" {
		name = existing.Name
	}
	if email == "" {
		email = existing.Email
	}
	err = h.repo.UpdateUser(ctx, id, name, email)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id":    id,
		"name":  name,
		"email": email,
	}, nil
}

func (h *Handler) updateAppConfig(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	updatesRaw, _ := vars["updates"].([]interface{})
	if len(updatesRaw) == 0 {
		return nil, errors.New("updates is required")
	}
	for _, raw := range updatesRaw {
		up, _ := raw.(map[string]interface{})
		if up == nil {
			continue
		}
		module, _ := up["module"].(string)
		key, _ := up["key"].(string)
		value := up["value"]
		if module == "" && key == "" {
			continue
		}
		cfgKey := module
		if key != "" {
			cfgKey = module + ":" + key
		}
		valStr := fmt.Sprintf("%v", value)
		if err := h.repo.SetAppConfig(ctx, cfgKey, valStr); err != nil {
			return nil, err
		}
	}
	return true, nil
}

func (h *Handler) validateConfig(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	updatesRaw, _ := vars["updates"].([]interface{})
	var results []map[string]interface{}
	for _, raw := range updatesRaw {
		up, _ := raw.(map[string]interface{})
		if up == nil {
			continue
		}
		module, _ := up["module"].(string)
		key, _ := up["key"].(string)
		value := up["value"]
		results = append(results, map[string]interface{}{
			"module": module,
			"key":    key,
			"value":  fmt.Sprintf("%v", value),
			"valid":  true,
			"error":  nil,
		})
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	return results, nil
}

func (h *Handler) revokeMemberPermission(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	workspaceID, _ := vars["workspaceId"].(string)
	userID, _ := vars["userId"].(string)
	if workspaceID == "" || userID == "" {
		return nil, errors.New("workspaceId and userId are required")
	}
	h.repo.RemoveWorkspacePermission(ctx, workspaceID, userID)
	return true, nil
}

func (h *Handler) approveWorkspaceTeamMember(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	workspaceID, _ := vars["workspaceId"].(string)
	userID, _ := vars["userId"].(string)
	if workspaceID == "" || userID == "" {
		return nil, errors.New("workspaceId and userId are required")
	}
	perm, err := h.repo.GetWorkspacePermission(ctx, workspaceID, userID)
	if err != nil {
		return nil, errors.New("permission not found")
	}
	permID := uuid.New().String()
	h.repo.AddWorkspacePermission(ctx, permID, workspaceID, userID, perm.Type)
	return true, nil
}

func (h *Handler) grantWorkspaceTeamMember(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	workspaceID, _ := vars["workspaceId"].(string)
	userID, _ := vars["userId"].(string)
	permStr, _ := vars["permission"].(string)
	if workspaceID == "" || userID == "" {
		return nil, errors.New("workspaceId and userId are required")
	}
	permType := db.PermCollaborator
	switch permStr {
	case "Admin":
		permType = db.PermAdmin
	case "Owner":
		permType = db.PermOwner
	case "External":
		permType = db.PermExternal
	}
	permID := uuid.New().String()
	h.repo.AddWorkspacePermission(ctx, permID, workspaceID, userID, permType)
	return true, nil
}

func (h *Handler) createInviteLink(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID, _ := vars["workspaceId"].(string)
	if workspaceID == "" {
		return nil, errors.New("workspaceId is required")
	}
	// store link in app_configs
	link := uuid.New().String()[:8]
	h.repo.SetAppConfig(ctx, "invite_link:"+workspaceID, link)
	h.repo.SetAppConfig(ctx, "invite_link_expire:"+workspaceID, "+7d")
	return map[string]interface{}{
		"link":       link,
		"expireTime": "+7d",
	}, nil
}

func (h *Handler) revokeInviteLink(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	workspaceID, _ := vars["workspaceId"].(string)
	if workspaceID == "" {
		return nil, errors.New("workspaceId is required")
	}
	h.repo.SetAppConfig(ctx, "invite_link:"+workspaceID, "")
	return true, nil
}

func (h *Handler) uploadAvatar(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	log.Printf("uploadAvatar with vars: %v", vars)
	// selfhosted: avatar uploaded but stored as reference
	avatarKey := uuid.New().String()[:12]
	h.repo.UpdateUser(ctx, user.ID, user.Name, user.Email)
	return map[string]interface{}{
		"id":        user.ID,
		"name":      user.Name,
		"avatarUrl": "/api/avatars/" + avatarKey,
		"email":     user.Email,
	}, nil
}

func (h *Handler) removeAvatar(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	return map[string]interface{}{"success": true}, nil
}

func (h *Handler) updateUserProfile(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	input, _ := vars["input"].(map[string]interface{})
	name, _ := input["name"].(string)
	if name == "" {
		return nil, errors.New("name is required")
	}
	err := h.repo.UpdateUser(ctx, user.ID, name, user.Email)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"id": user.ID, "name": name}, nil
}

func (h *Handler) updateUserSettings(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	input, _ := vars["input"].(map[string]interface{})
	settings := map[string]interface{}{
		"receiveInvitationEmail": true,
		"receiveMentionEmail":    true,
		"receiveCommentEmail":    true,
	}
	if v, ok := input["receiveInvitationEmail"].(bool); ok {
		settings["receiveInvitationEmail"] = v
	}
	if v, ok := input["receiveMentionEmail"].(bool); ok {
		settings["receiveMentionEmail"] = v
	}
	if v, ok := input["receiveCommentEmail"].(bool); ok {
		settings["receiveCommentEmail"] = v
	}
	b, _ := json.Marshal(settings)
	h.repo.SetAppConfig(ctx, "settings:"+user.ID, string(b))
	return true, nil
}

func (h *Handler) changeEmail(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	email, _ := vars["email"].(string)
	if email == "" {
		return nil, errors.New("email is required")
	}
	err := h.repo.UpdateUser(ctx, user.ID, user.Name, email)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"id": user.ID, "email": email}, nil
}

func (h *Handler) changePassword(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	userID, _ := vars["userId"].(string)
	newPassword, _ := vars["newPassword"].(string)
	if userID == "" || newPassword == "" {
		return nil, errors.New("userId and newPassword are required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	err = h.repo.UpdateUserPassword(ctx, userID, string(hash))
	if err != nil {
		return nil, err
	}
	return true, nil
}

func (h *Handler) deleteAccount(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	err := h.repo.DeleteUser(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"success": true}, nil
}

func (h *Handler) generateUserAccessToken(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	input, _ := vars["input"].(map[string]interface{})
	name, _ := input["name"].(string)
	if name == "" {
		return nil, errors.New("name is required")
	}
	id := uuid.New().String()
	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)
	var expiresAt *time.Time
	if exp, ok := input["expiresAt"].(string); ok && exp != "" {
		t, err := time.Parse(time.RFC3339, exp)
		if err == nil {
			expiresAt = &t
		}
	}
	h.repo.CreateAccessToken(ctx, id, user.ID, name, token, expiresAt)
	return map[string]interface{}{
		"id":        id,
		"name":      name,
		"token":     token,
		"createdAt": time.Now().Format(time.RFC3339),
		"expiresAt": expiresAt,
	}, nil
}

func (h *Handler) revokeUserAccessToken(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	user := auth.GetUser(ctx)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	id, _ := vars["id"].(string)
	if id == "" {
		return nil, errors.New("id is required")
	}
	h.repo.RevokeAccessToken(ctx, id, user.ID)
	return true, nil
}

// ---- Task 3: Doc tree / publishing ----

func (h *Handler) updateDocTree(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("updateDocTree called with vars: %v", vars)
	workspaceID := resolveVar(vars, "", "workspaceId", "id")
	return map[string]interface{}{"id": workspaceID}, nil
}

func (h *Handler) regeneratePubToken(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("regeneratePubToken called with vars: %v", vars)
	return map[string]interface{}{"pubToken": uuid.New().String()}, nil
}

// ---- Task 4: Git / workspace tree ----

func (h *Handler) createWorktreeWorkspace(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("createWorktreeWorkspace called with vars: %v", vars)
	id := uuid.New().String()
	return map[string]interface{}{"id": id, "worktreeId": uuid.New().String()}, nil
}

func (h *Handler) getGitStatus(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("getGitStatus called with vars: %v", vars)
	return []interface{}{}, nil
}

func (h *Handler) gitAdd(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("gitAdd called with vars: %v", vars)
	return true, nil
}

func (h *Handler) gitStageFiles(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("gitStageFiles called with vars: %v", vars)
	return true, nil
}

func (h *Handler) gitCommit(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("gitCommit called with vars: %v", vars)
	return map[string]interface{}{"oid": uuid.New().String()}, nil
}

func (h *Handler) gitPush(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("gitPush called with vars: %v", vars)
	return true, nil
}

func (h *Handler) gitPull(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("gitPull called with vars: %v", vars)
	return map[string]interface{}{"upToDate": true}, nil
}

func (h *Handler) gitDiff(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("gitDiff called with vars: %v", vars)
	return []interface{}{}, nil
}

func (h *Handler) gitLog(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	log.Printf("gitLog called with vars: %v", vars)
	return []interface{}{}, nil
}

// ---- License stubs (selfhosted — no-op) ----

func (h *Handler) generateLicenseKey(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return "", nil
}

func (h *Handler) activateLicense(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return nil, nil
}

func (h *Handler) deactivateLicense(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return true, nil
}

func (h *Handler) installLicense(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return nil, nil
}

func (h *Handler) previewLicense(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return nil, nil
}

func (h *Handler) createLicenseKey(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return map[string]interface{}{"id": uuid.New().String()}, nil
}

func (h *Handler) deleteLicenseKey(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return true, nil
}

func (h *Handler) updateLicenseKey(ctx context.Context, vars map[string]interface{}) (interface{}, error) {
	return map[string]interface{}{"success": true}, nil
}
