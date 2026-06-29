package sync

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"madoc/internal/auth"
	"madoc/internal/db"
	"madoc/internal/socketio"

	"github.com/google/uuid"
)

type Server struct {
	handler *socketio.Handler
	rooms   *RoomManager
	repo    *db.Repo
	sm      *auth.SessionManager
}

func NewServer(repo *db.Repo, sm *auth.SessionManager) *Server {
	s := &Server{
		rooms: NewRoomManager(),
		repo:  repo,
		sm:    sm,
	}
	s.handler = socketio.NewHandler()
	s.handler.AuthFunc = s.authFunc
	s.handler.OnPacket = s.onPacket
	s.handler.OnClose = s.onClose
	return s
}

func (s *Server) authFunc(r *http.Request) string {
	c, err := r.Cookie("sid")
	if err != nil {
		return ""
	}
	uid, err := s.sm.GetUserID(r.Context(), c.Value)
	if err != nil {
		return ""
	}
	return uid
}

func (s *Server) Router() http.Handler {
	return socketio.Router(s.handler)
}

func (s *Server) onPacket(sid string, pkt socketio.EnginePacket) {
	if pkt.Type != socketio.EngineMessage {
		return
	}
	sio := socketio.DecodeSioPacket(pkt.Data)
	switch sio.Type {
	case socketio.SioConnect:
		s.handleConnect(sid, sio.Namespace)
	case socketio.SioEvent:
		s.handleEvent(sid, sio)
	case socketio.SioDisconnect:
		s.onClose(sid)
	}
}

func (s *Server) onClose(sid string) {
	s.rooms.LeaveAll(sid)
}

func (s *Server) handleConnect(sid string, namespace string) {
	if namespace == "" {
		namespace = "/"
	}
	s.ioSend(sid, socketio.FormatConnect(namespace))
}

func (s *Server) handleEvent(sid string, pkt socketio.SioPacket) {
	var args []json.RawMessage
	if err := json.Unmarshal([]byte(pkt.Data), &args); err != nil || len(args) < 1 {
		return
	}
	var evName string
	if err := json.Unmarshal(args[0], &evName); err != nil || evName == "" {
		return
	}
	var payload json.RawMessage
	if len(args) > 1 {
		payload = args[1]
	}
	switch evName {
	case "space:join":
		s.handleJoin(sid, payload, pkt.ID)
	case "space:leave":
		s.handleLeave(sid, payload)
	case "space:push-doc-update":
		s.handlePushDocUpdate(sid, payload, pkt.ID)
	case "space:load-doc":
		s.handleLoadDoc(sid, payload, pkt.ID)
	case "space:load-doc-timestamps":
		s.handleLoadDocTimestamps(sid, payload, pkt.ID)
	case "space:delete-doc":
		s.handleDeleteDoc(sid, payload, pkt.ID)
	case "space:join-awareness":
		s.handleJoinAwareness(sid, payload, pkt.ID)
	case "space:leave-awareness":
		s.handleLeaveAwareness(sid, payload)
	case "space:update-awareness":
		s.handleUpdateAwareness(sid, payload)
	case "space:load-awarenesses":
		s.handleLoadAwarenesses(sid, payload)
	case "realtime:request":
		s.handleRealtimeRequest(sid, payload, pkt.ID)
	case "realtime:subscribe":
		s.handleRealtimeSubscribe(sid, payload, pkt.ID)
	case "realtime:unsubscribe":
		s.handleRealtimeUnsubscribe(sid, payload)
	default:
		log.Printf("sync: unknown event %q", evName)
	}
}

func (s *Server) handleJoin(sid string, raw json.RawMessage, ackID int) {
	var req struct {
		SpaceType     string `json:"spaceType"`
		SpaceID       string `json:"spaceId"`
		ClientVersion string `json:"clientVersion"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	peer := &Peer{
		SID:       sid,
		ClientID:  uuid.New().String(),
		UserID:    s.handler.GetUserID(sid),
		Awareness: make(map[string]bool),
	}
	s.rooms.Join(req.SpaceType, req.SpaceID, peer)
	resp, _ := json.Marshal(map[string]string{"clientId": peer.ClientID})
	s.ioAck(sid, ackID, string(resp))
}

func (s *Server) handleLeave(sid string, raw json.RawMessage) {
	var req struct {
		SpaceType string `json:"spaceType"`
		SpaceID   string `json:"spaceId"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	s.rooms.Leave(req.SpaceType, req.SpaceID, sid)
}

func (s *Server) handlePushDocUpdate(sid string, raw json.RawMessage, ackID int) {
	var req struct {
		SpaceType string `json:"spaceType"`
		SpaceID   string `json:"spaceId"`
		DocID     string `json:"docId"`
		Update    string `json:"update"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	ctx := context.Background()
	ts := time.Now().UTC()
	editor := s.handler.GetUserID(sid)
	var editorP *string
	if editor != "" {
		editorP = &editor
	}
	_, err := s.repo.AppendUpdate(ctx, req.SpaceID, req.DocID, []byte(req.Update), editorP)
	if err != nil {
		log.Printf("sync: append update error: %v", err)
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"spaceType": req.SpaceType,
		"spaceId":   req.SpaceID,
		"docId":     req.DocID,
		"update":    req.Update,
		"timestamp": ts.UnixMilli(),
		"editor":    editor,
	})
	broadcastPayload := `["space:broadcast-doc-update",` + string(payload) + `]`
	s.broadcastExcept(sid, req.SpaceType, req.SpaceID, broadcastPayload)
	resp, _ := json.Marshal(map[string]int64{"timestamp": ts.UnixMilli()})
	s.ioAck(sid, ackID, string(resp))
	// count-based compaction trigger
	go s.tryCompactDoc(context.Background(), req.SpaceID, req.DocID)
}

func (s *Server) handleLoadDoc(sid string, raw json.RawMessage, ackID int) {
	var req struct {
		SpaceType   string `json:"spaceType"`
		SpaceID     string `json:"spaceId"`
		DocID       string `json:"docId"`
		StateVector string `json:"stateVector,omitempty"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	ctx := context.Background()
	updates, err := s.repo.ListUpdates(ctx, req.SpaceID, req.DocID)
	if err != nil {
		log.Printf("sync: list updates error: %v", err)
		return
	}
	missing := ""
	for _, u := range updates {
		missing += string(u.Blob)
	}
	snap, _ := s.repo.GetSnapshot(ctx, req.SpaceID, req.DocID)
	if snap != nil && len(updates) == 0 {
		missing = string(snap.Blob)
	}
	var ts int64
	if snap != nil {
		ts = snap.UpdatedAt.UnixMilli()
	} else if len(updates) > 0 {
		ts = updates[len(updates)-1].CreatedAt.UnixMilli()
	}
	resp, _ := json.Marshal(map[string]interface{}{
		"missing":   missing,
		"state":     "",
		"timestamp": ts,
	})
	s.ioAck(sid, ackID, string(resp))
}

func (s *Server) handleLoadDocTimestamps(sid string, raw json.RawMessage, ackID int) {
	var req struct {
		SpaceType string `json:"spaceType"`
		SpaceID   string `json:"spaceId"`
		Timestamp int64  `json:"timestamp,omitempty"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	ctx := context.Background()
	docIDs, err := s.repo.ListDocIDsByWorkspace(ctx, req.SpaceID)
	if err != nil {
		log.Printf("sync: list doc ids error: %v", err)
		return
	}
	result := make(map[string]int64)
	for _, docID := range docIDs {
		snap, _ := s.repo.GetSnapshot(ctx, req.SpaceID, docID)
		if snap != nil {
			result[docID] = snap.UpdatedAt.UnixMilli()
		} else {
			updates, err := s.repo.ListUpdates(ctx, req.SpaceID, docID)
			if err == nil && len(updates) > 0 {
				result[docID] = updates[len(updates)-1].CreatedAt.UnixMilli()
			}
		}
	}
	resp, _ := json.Marshal(result)
	s.ioAck(sid, ackID, string(resp))
}

func (s *Server) handleDeleteDoc(sid string, raw json.RawMessage, ackID int) {
	var req struct {
		SpaceType string `json:"spaceType"`
		SpaceID   string `json:"spaceId"`
		DocID     string `json:"docId"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	ctx := context.Background()
	s.repo.DeleteUpdates(ctx, req.SpaceID, req.DocID)
	resp, _ := json.Marshal(map[string]bool{"success": true})
	s.ioAck(sid, ackID, string(resp))
}

func (s *Server) handleJoinAwareness(sid string, raw json.RawMessage, ackID int) {
	var req struct {
		SpaceType     string `json:"spaceType"`
		SpaceID       string `json:"spaceId"`
		DocID         string `json:"docId"`
		ClientVersion string `json:"clientVersion"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	p := s.findPeer(sid, req.SpaceType, req.SpaceID)
	if p != nil {
		p.Awareness[req.DocID] = true
	}
	resp, _ := json.Marshal(map[string]string{"clientId": uuid.New().String()})
	s.ioAck(sid, ackID, string(resp))
}

func (s *Server) handleLeaveAwareness(sid string, raw json.RawMessage) {
	var req struct {
		SpaceType string `json:"spaceType"`
		SpaceID   string `json:"spaceId"`
		DocID     string `json:"docId"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	p := s.findPeer(sid, req.SpaceType, req.SpaceID)
	if p != nil {
		delete(p.Awareness, req.DocID)
	}
}

func (s *Server) handleUpdateAwareness(sid string, raw json.RawMessage) {
	var req struct {
		SpaceType       string `json:"spaceType"`
		SpaceID         string `json:"spaceId"`
		DocID           string `json:"docId"`
		AwarenessUpdate string `json:"awarenessUpdate"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	payload, _ := json.Marshal(req)
	broadcastPayload := `["space:broadcast-awareness-update",` + string(payload) + `]`
	s.broadcastExcept(sid, req.SpaceType, req.SpaceID, broadcastPayload)
}

func (s *Server) handleLoadAwarenesses(sid string, raw json.RawMessage) {
	var req struct {
		SpaceType string `json:"spaceType"`
		SpaceID   string `json:"spaceId"`
		DocID     string `json:"docId"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	payload, _ := json.Marshal(req)
	collectPayload := `["space:collect-awareness",` + string(payload) + `]`
	s.broadcastExcept(sid, req.SpaceType, req.SpaceID, collectPayload)
}

// ---------------------------------------------------------------------------
// realtime:request
// ---------------------------------------------------------------------------

type realtimeRequest struct {
	Op    string          `json:"op"`
	Input json.RawMessage `json:"input"`
}

func (s *Server) handleRealtimeRequest(sid string, raw json.RawMessage, ackID int) {
	var req realtimeRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		s.ioAckError(sid, ackID, 0, "invalid request")
		return
	}
	uid := s.handler.GetUserID(sid)
	switch req.Op {
	case "user.profile.get":
		s.realtimeUserProfileGet(sid, ackID, uid)
	case "workspace.access.get":
		s.realtimeWorkspaceAccessGet(sid, ackID, uid, req.Input)
	case "workspace.config.get":
		s.realtimeWorkspaceConfigGet(sid, ackID, uid, req.Input)
	case "notification.count.get":
		s.realtimeNotificationCountGet(sid, ackID, uid)
	default:
		s.ioAckError(sid, ackID, 0, "unknown op: "+req.Op)
	}
}

func (s *Server) realtimeUserProfileGet(sid string, ackID int, uid string) {
	if uid == "" {
		s.ioAckError(sid, ackID, 0, "unauthenticated")
		return
	}
	ctx := context.Background()
	user, err := s.repo.GetUserByID(ctx, uid)
	if err != nil {
		s.ioAckError(sid, ackID, 0, "user not found")
		return
	}
	// fetch features from app_config
	features := []string{}
	resp, _ := json.Marshal(map[string]interface{}{
		"user": map[string]interface{}{
			"id":        user.ID,
			"name":      user.Name,
			"email":     user.Email,
			"avatarUrl": user.AvatarURL,
			"features":  features,
		},
	})
	s.ioAck(sid, ackID, string(resp))
}

func (s *Server) realtimeWorkspaceAccessGet(sid string, ackID int, uid string, input json.RawMessage) {
	var in struct {
		WorkspaceID string `json:"workspaceId"`
	}
	json.Unmarshal(input, &in)
	if in.WorkspaceID == "" {
		s.ioAckError(sid, ackID, 0, "workspaceId required")
		return
	}
	ctx := context.Background()
	var permType int
	if uid != "" {
		p, err := s.repo.GetWorkspacePermission(ctx, in.WorkspaceID, uid)
		if err == nil && p != nil {
			permType = p.Type
		}
	}
	resp, _ := json.Marshal(map[string]interface{}{
		"access": map[string]interface{}{
			"type":   permType,
			"accept": true,
		},
	})
	s.ioAck(sid, ackID, string(resp))
}

func (s *Server) realtimeWorkspaceConfigGet(sid string, ackID int, uid string, input json.RawMessage) {
	resp, _ := json.Marshal(map[string]interface{}{
		"config": map[string]interface{}{
			"enableAi":               false,
			"enableSharing":          true,
			"enableUrlPreview":       true,
			"enableDocEmbedding":     false,
			"enableCopilot":          false,
			"searchEngineConfig":     map[string]interface{}{},
			"credentialsRequirement": map[string]interface{}{"email": true, "password": true},
		},
	})
	s.ioAck(sid, ackID, string(resp))
}

func (s *Server) realtimeNotificationCountGet(sid string, ackID int, uid string) {
	resp, _ := json.Marshal(map[string]int{"count": 0})
	s.ioAck(sid, ackID, string(resp))
}

// ---------------------------------------------------------------------------
// realtime:subscribe / unsubscribe
// ---------------------------------------------------------------------------

func (s *Server) handleRealtimeSubscribe(sid string, raw json.RawMessage, ackID int) {
	var req struct {
		Topic string          `json:"topic"`
		Input json.RawMessage `json:"input"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		s.ioAckError(sid, ackID, 0, "invalid subscribe")
		return
	}
	log.Printf("sync: subscribe sid=%s topic=%s", sid, req.Topic)
	resp, _ := json.Marshal(map[string]string{"subscriptionId": sid + ":" + req.Topic})
	s.ioAck(sid, ackID, string(resp))
}

func (s *Server) handleRealtimeUnsubscribe(sid string, raw json.RawMessage) {
	var req struct {
		Topic string          `json:"topic"`
		Input json.RawMessage `json:"input"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return
	}
	log.Printf("sync: unsubscribe sid=%s topic=%s", sid, req.Topic)
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func (s *Server) findPeer(sid, spaceType, spaceID string) *Peer {
	for _, p := range s.rooms.PeersIn(spaceType, spaceID) {
		if p.SID == sid {
			return p
		}
	}
	return nil
}

func (s *Server) broadcastExcept(sid, spaceType, spaceID, payload string) {
	for _, p := range s.rooms.PeersIn(spaceType, spaceID) {
		if p.SID != sid {
			s.ioSend(p.SID, payload)
		}
	}
}

func (s *Server) ioSend(sid string, payload string) {
	s.handler.Send(sid, payload)
}

func (s *Server) ioAck(sid string, ackID int, data string) {
	pkt := socketio.FormatAck(ackID, data)
	s.handler.Send(sid, pkt)
}

func (s *Server) ioAckError(sid string, ackID int, code int, msg string) {
	errData, _ := json.Marshal(map[string]interface{}{
		"error": map[string]interface{}{
			"name":    "ERROR",
			"message": msg,
		},
	})
	s.ioAck(sid, ackID, string(errData))
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
		// check on startup too
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
	// concatenate all update blobs
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
	// delete all updates that were merged
	lastTime := updates[len(updates)-1].CreatedAt
	if err := s.repo.DeleteUpdatesBefore(ctx, spaceID, docID, lastTime); err != nil {
		log.Printf("compact: delete updates error: %v", err)
	}
	log.Printf("compact: %s/%s merged %d updates (%d bytes)", spaceID, docID, len(updates), len(merged))
}

func (s *Server) compactAllDocs(ctx context.Context) {
	log.Printf("compact: scanning all docs...")
	// collect unique (spaceID, docID) pairs
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
