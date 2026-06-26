package sync

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"madoc/internal/db"
	"madoc/internal/socketio"

	"github.com/google/uuid"
)

type Server struct {
	handler *socketio.Handler
	rooms   *RoomManager
	repo    *db.Repo
}

func NewServer(repo *db.Repo) *Server {
	s := &Server{
		rooms: NewRoomManager(),
		repo:  repo,
	}
	s.handler = socketio.NewHandler()
	s.handler.OnPacket = s.onPacket
	s.handler.OnClose = s.onClose
	return s
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
	var ev struct {
		Name string          `json:"name"`
		Args json.RawMessage `json:"args"`
	}
	if err := json.Unmarshal([]byte(pkt.Data), &ev); err != nil {
		return
	}
	var args []json.RawMessage
	if err := json.Unmarshal([]byte(pkt.Data), &args); err == nil && len(args) >= 1 {
		json.Unmarshal(args[0], &ev.Name)
		ev.Args = nil
		if len(args) > 1 {
			ev.Args = args[1]
		}
	}
	if ev.Name == "" {
		return
	}
	switch ev.Name {
	case "space:join":
		s.handleJoin(sid, ev.Args, pkt.ID)
	case "space:leave":
		s.handleLeave(sid, ev.Args)
	case "space:push-doc-update":
		s.handlePushDocUpdate(sid, ev.Args, pkt.ID)
	case "space:load-doc":
		s.handleLoadDoc(sid, ev.Args, pkt.ID)
	case "space:load-doc-timestamps":
		s.handleLoadDocTimestamps(sid, ev.Args, pkt.ID)
	case "space:delete-doc":
		s.handleDeleteDoc(sid, ev.Args, pkt.ID)
	case "space:join-awareness":
		s.handleJoinAwareness(sid, ev.Args, pkt.ID)
	case "space:leave-awareness":
		s.handleLeaveAwareness(sid, ev.Args)
	case "space:update-awareness":
		s.handleUpdateAwareness(sid, ev.Args)
	case "space:load-awarenesses":
		s.handleLoadAwarenesses(sid, ev.Args)
	default:
		log.Printf("sync: unknown event %q", ev.Name)
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
		Awareness: make(map[string]bool),
	}
	user := s.authenticateBySID(sid)
	if user != nil {
		peer.UserID = user.ID
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
	_, err := s.repo.AppendUpdate(ctx, req.SpaceID, req.DocID, []byte(req.Update), nil)
	if err != nil {
		log.Printf("sync: append update error: %v", err)
		return
	}
	user := s.authenticateBySID(sid)
	editor := ""
	if user != nil {
		editor = user.ID
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

func (s *Server) authenticateBySID(sid string) *db.User {
	return nil
}

func (s *Server) ioSend(sid string, payload string) {
	s.handler.Send(sid, payload)
}

func (s *Server) ioAck(sid string, ackID int, data string) {
	pkt := socketio.FormatAck(ackID, data)
	s.handler.Send(sid, pkt)
}
