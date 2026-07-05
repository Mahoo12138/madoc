package sync

import (
	"context"
	"encoding/base64"
	"log"
	"net/http"
	"time"

	"madoc/internal/auth"
	"madoc/internal/db"

	"github.com/google/uuid"
	"github.com/zishang520/socket.io/v2/socket"
)

type Server struct {
	io      *socket.Server
	rooms   *RoomManager
	repo    *db.Repo
	sm      *auth.SessionManager
	userIDs map[string]string
}

func NewServer(repo *db.Repo, sm *auth.SessionManager) *Server {
	io := socket.NewServer(nil, nil)

	s := &Server{
		io:      io,
		rooms:   NewRoomManager(),
		repo:    repo,
		sm:      sm,
		userIDs: make(map[string]string),
	}

	io.On("connection", func(clients ...any) {
		client := clients[0].(*socket.Socket)
		s.handleConnection(client)
	})

	return s
}

func (s *Server) Router() http.Handler {
	return s.io.ServeHandler(nil)
}

func (s *Server) getUserID(sock *socket.Socket) string {
	hs := sock.Handshake()
	if hs == nil {
		return ""
	}
	headers := hs.Headers
	cookies, ok := headers["Cookie"]
	if !ok {
		cookies, ok = headers["cookie"]
	}
	if !ok || len(cookies) == 0 {
		return ""
	}
	sid := ""
	for _, part := range splitCookie(cookies[0]) {
		if part[0] == "sid" {
			sid = part[1]
			break
		}
	}
	if sid == "" {
		return ""
	}
	uid, err := s.sm.GetUserID(context.Background(), sid)
	if err != nil {
		return ""
	}
	return uid
}

func ackSocket(args []any, payload any) bool {
	if len(args) == 0 {
		return false
	}
	ack, ok := args[len(args)-1].(socket.Ack)
	if !ok {
		return false
	}
	ack([]any{payload}, nil)
	return true
}

func splitCookie(header string) [][2]string {
	var result [][2]string
	parts := []string{}
	start := 0
	for i := 0; i < len(header); i++ {
		if header[i] == ';' {
			parts = append(parts, header[start:i])
			start = i + 1
		}
	}
	parts = append(parts, header[start:])
	for _, part := range parts {
		part = trimSpace(part)
		if part == "" {
			continue
		}
		eq := -1
		for j := 0; j < len(part); j++ {
			if part[j] == '=' {
				eq = j
				break
			}
		}
		if eq < 0 {
			result = append(result, [2]string{part, ""})
		} else {
			result = append(result, [2]string{part[:eq], part[eq+1:]})
		}
	}
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}

func (s *Server) handleConnection(client *socket.Socket) {
	userID := s.getUserID(client)
	clientID := string(client.Id())

	s.userIDs[clientID] = userID

	client.On("space:join", func(args ...any) {
		if len(args) < 1 {
			return
		}
		data, ok := args[0].(map[string]any)
		if !ok {
			return
		}
		spaceType, _ := data["spaceType"].(string)
		spaceID, _ := data["spaceId"].(string)

		peer := &Peer{
			SID:       clientID,
			ClientID:  uuid.New().String(),
			UserID:    userID,
			SpaceType: spaceType,
			SpaceID:   spaceID,
		}
		s.rooms.Join(spaceType, spaceID, peer)
		client.Join(socket.Room(spaceType + ":" + spaceID))

		ackSocket(args, map[string]string{
			"clientId": peer.ClientID,
		})
	})

	client.On("space:leave", func(args ...any) {
		if len(args) < 1 {
			return
		}
		data, ok := args[0].(map[string]any)
		if !ok {
			return
		}
		spaceType, _ := data["spaceType"].(string)
		spaceID, _ := data["spaceId"].(string)

		s.rooms.Leave(spaceType, spaceID, clientID)
		client.Leave(socket.Room(spaceType + ":" + spaceID))
	})

	client.On("space:push-doc-update", func(args ...any) {
		if len(args) < 1 {
			return
		}
		data, ok := args[0].(map[string]any)
		if !ok {
			return
		}
		spaceType, _ := data["spaceType"].(string)
		spaceID, _ := data["spaceId"].(string)
		docID, _ := data["docId"].(string)
		updateStr, _ := data["update"].(string)

		ctx := context.Background()
		ts := time.Now().UTC()

		updateBytes, err := base64.StdEncoding.DecodeString(updateStr)
		if err != nil {
			log.Printf("sync: base64 decode error: %v", err)
			return
		}

		editorP := &userID
		if userID == "" {
			editorP = nil
		}

		_, err = s.repo.AppendUpdate(ctx, spaceID, docID, updateBytes, editorP)
		if err != nil {
			log.Printf("sync: append update error: %v", err)
			return
		}

		// Broadcast to other clients in the room (exclude sender)
		client.Broadcast().To(socket.Room(spaceType+":"+spaceID)).Emit("space:broadcast-doc-update", map[string]any{
			"spaceType": spaceType,
			"spaceId":   spaceID,
			"docId":     docID,
			"update":    updateStr,
			"timestamp": ts.UnixMilli(),
			"editor":    userID,
		})

		ackSocket(args, map[string]int64{"timestamp": ts.UnixMilli()})

		go s.tryCompactDoc(context.Background(), spaceID, docID)
	})

	client.On("space:load-doc", func(args ...any) {
		if len(args) < 1 {
			return
		}
		data, ok := args[0].(map[string]any)
		if !ok {
			return
		}
		spaceID, _ := data["spaceId"].(string)
		docID, _ := data["docId"].(string)

		ctx := context.Background()
		updates, err := s.repo.ListUpdates(ctx, spaceID, docID)
		if err != nil {
			log.Printf("sync: list updates error: %v", err)
			return
		}

		var missing []byte
		for _, u := range updates {
			missing = append(missing, u.Blob...)
		}

		snap, _ := s.repo.GetSnapshot(ctx, spaceID, docID)
		if snap != nil && len(updates) == 0 {
			missing = snap.Blob
		}

		var ts int64
		if snap != nil {
			ts = snap.UpdatedAt.UnixMilli()
		} else if len(updates) > 0 {
			ts = updates[len(updates)-1].CreatedAt.UnixMilli()
		}

		// TODO: implement state vector diff for incremental sync
		ackSocket(args, map[string]any{
			"missing":   base64.StdEncoding.EncodeToString(missing),
			"state":     "",
			"timestamp": ts,
		})
	})

	client.On("space:load-doc-timestamps", func(args ...any) {
		if len(args) < 1 {
			return
		}
		data, ok := args[0].(map[string]any)
		if !ok {
			return
		}
		spaceID, _ := data["spaceId"].(string)

		ctx := context.Background()
		docIDs, err := s.repo.ListDocIDsByWorkspace(ctx, spaceID)
		if err != nil {
			log.Printf("sync: list doc ids error: %v", err)
			return
		}

		result := make(map[string]int64)
		for _, docID := range docIDs {
			snap, _ := s.repo.GetSnapshot(ctx, spaceID, docID)
			if snap != nil {
				result[docID] = snap.UpdatedAt.UnixMilli()
			} else {
				updates, err := s.repo.ListUpdates(ctx, spaceID, docID)
				if err == nil && len(updates) > 0 {
					result[docID] = updates[len(updates)-1].CreatedAt.UnixMilli()
				}
			}
		}

		ackSocket(args, result)
	})

	client.On("space:delete-doc", func(args ...any) {
		if len(args) < 1 {
			return
		}
		data, ok := args[0].(map[string]any)
		if !ok {
			return
		}
		spaceID, _ := data["spaceId"].(string)
		docID, _ := data["docId"].(string)

		ctx := context.Background()
		s.repo.DeleteUpdates(ctx, spaceID, docID)

		ackSocket(args, map[string]bool{"success": true})
	})

	// Realtime events
	client.On("realtime:request", func(args ...any) {
		if len(args) < 1 {
			return
		}
		data, ok := args[0].(map[string]any)
		if !ok {
			return
		}
		op, _ := data["op"].(string)

		switch op {
		case "user.profile.get":
			s.realtimeUserProfileGet(client, userID, args)
		case "workspace.access.get":
			s.realtimeWorkspaceAccessGet(client, userID, data, args)
		case "workspace.config.get":
			s.realtimeWorkspaceConfigGet(client, args)
		case "notification.count.get":
			s.realtimeNotificationCountGet(client, args)
		}
	})

	client.On("realtime:subscribe", func(args ...any) {
		if len(args) < 1 {
			return
		}
		data, ok := args[0].(map[string]any)
		if !ok {
			return
		}
		topic, _ := data["topic"].(string)
		log.Printf("sync: subscribe client=%s topic=%s", clientID, topic)

		ackSocket(args, map[string]string{"subscriptionId": clientID + ":" + topic})
	})

	client.On("realtime:unsubscribe", func(args ...any) {
		if len(args) < 1 {
			return
		}
		data, ok := args[0].(map[string]any)
		if !ok {
			return
		}
		topic, _ := data["topic"].(string)
		log.Printf("sync: unsubscribe client=%s topic=%s", clientID, topic)
	})

	client.On("disconnect", func(...any) {
		delete(s.userIDs, clientID)
		s.rooms.LeaveAll(clientID)
	})
}

func (s *Server) realtimeUserProfileGet(client *socket.Socket, userID string, args []any) {
	if userID == "" {
		ackSocket(args, map[string]any{"error": map[string]any{"message": "unauthenticated"}})
		return
	}

	ctx := context.Background()
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		ackSocket(args, map[string]any{"error": map[string]any{"message": "user not found"}})
		return
	}

	ackSocket(args, map[string]any{
		"user": map[string]any{
			"id":        user.ID,
			"name":      user.Name,
			"email":     user.Email,
			"avatarUrl": user.AvatarURL,
			"features":  []string{},
		},
	})
}

func (s *Server) realtimeWorkspaceAccessGet(client *socket.Socket, userID string, data map[string]any, args []any) {
	input, _ := data["input"].(map[string]any)
	workspaceID, _ := input["workspaceId"].(string)

	if workspaceID == "" {
		ackSocket(args, map[string]any{"error": map[string]any{"message": "workspaceId required"}})
		return
	}

	ctx := context.Background()
	var permType int
	if userID != "" {
		p, err := s.repo.GetWorkspacePermission(ctx, workspaceID, userID)
		if err == nil && p != nil {
			permType = p.Type
		}
	}

	ackSocket(args, map[string]any{
		"access": map[string]any{
			"type":   permType,
			"accept": true,
		},
	})
}

func (s *Server) realtimeWorkspaceConfigGet(client *socket.Socket, args []any) {
	ackSocket(args, map[string]any{
		"config": map[string]any{
			"enableAi":               false,
			"enableSharing":          true,
			"enableUrlPreview":       true,
			"enableDocEmbedding":     false,
			"enableCopilot":          false,
			"searchEngineConfig":     map[string]any{},
			"credentialsRequirement": map[string]any{"email": true, "password": true},
		},
	})
}

func (s *Server) realtimeNotificationCountGet(client *socket.Socket, args []any) {
	ackSocket(args, map[string]int{"count": 0})
}

// ---------------------------------------------------------------------------
// Snapshot compaction
// ---------------------------------------------------------------------------

const compactUpdateThreshold = 100
const compactInterval = 1 * time.Hour

func (s *Server) StartCompactionLoop() {
	go func() {
		ticker := time.NewTicker(compactInterval)
		defer ticker.Stop()
		s.compactAllDocs(context.Background())
		for range ticker.C {
			s.compactAllDocs(context.Background())
		}
	}()
}

func (s *Server) tryCompactDoc(ctx context.Context, spaceID, docID string) {
	updates, err := s.repo.ListUpdates(ctx, spaceID, docID)
	if err != nil {
		return
	}
	if len(updates) < compactUpdateThreshold {
		return
	}
	s.compactDoc(ctx, spaceID, docID, updates)
}

func (s *Server) compactDoc(ctx context.Context, spaceID, docID string, updates []db.DocUpdate) {
	var merged []byte
	for _, u := range updates {
		merged = append(merged, u.Blob...)
	}
	if len(merged) == 0 {
		return
	}
	if err := s.repo.UpsertSnapshot(ctx, &db.Snapshot{
		WorkspaceID: spaceID,
		GUID:        docID,
		Blob:        merged,
		Size:        int64(len(merged)),
	}); err != nil {
		log.Printf("compact: upsert snapshot error: %v", err)
		return
	}
	lastTime := updates[len(updates)-1].CreatedAt
	if err := s.repo.DeleteUpdatesBefore(ctx, spaceID, docID, lastTime); err != nil {
		log.Printf("compact: delete updates error: %v", err)
	}
	log.Printf("compact: %s/%s merged %d updates (%d bytes)", spaceID, docID, len(updates), len(merged))
}

func (s *Server) compactAllDocs(ctx context.Context) {
	log.Printf("compact: scanning all docs...")
	rows, err := s.repo.ListAllDocPairs(ctx)
	if err != nil {
		log.Printf("compact: list all doc pairs error: %v", err)
		return
	}
	for _, pair := range rows {
		updates, err := s.repo.ListUpdates(ctx, pair.WorkspaceID, pair.DocID)
		if err != nil {
			continue
		}
		if len(updates) >= compactUpdateThreshold {
			s.compactDoc(ctx, pair.WorkspaceID, pair.DocID, updates)
		}
	}
}
