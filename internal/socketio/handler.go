package socketio

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

const pingInterval = 25 * time.Second
const pingTimeout = 20 * time.Second

type Session struct {
	ID        string
	UserID    string
	Upgraded  bool
	mu        sync.Mutex
	pending   []string
	createdAt time.Time
	lastPing  time.Time
	onPacket  func(sid string, pkt EnginePacket)
	onClose   func(sid string)
	closeOnce sync.Once
	closed    bool
	wsConn    *websocket.Conn
	writeMu   sync.Mutex
}

type Handler struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	OnPacket func(sid string, pkt EnginePacket)
	OnClose  func(sid string)
	AuthFunc func(r *http.Request) string
}

func NewHandler() *Handler {
	return &Handler{
		sessions: make(map[string]*Session),
	}
}

func (h *Handler) createSession() *Session {
	sid := uuid.New().String()
	ses := &Session{
		ID:        sid,
		createdAt: time.Now(),
		lastPing:  time.Now(),
		onPacket:  h.OnPacket,
		onClose:   h.OnClose,
	}
	h.mu.Lock()
	h.sessions[sid] = ses
	h.mu.Unlock()
	return ses
}

func (h *Handler) getSession(sid string) *Session {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.sessions[sid]
}

func (h *Handler) removeSession(sid string) {
	h.mu.Lock()
	delete(h.sessions, sid)
	h.mu.Unlock()
}

func (h *Handler) GetUserID(sid string) string {
	ses := h.getSession(sid)
	if ses == nil {
		return ""
	}
	ses.mu.Lock()
	defer ses.mu.Unlock()
	return ses.UserID
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	transport := r.URL.Query().Get("transport")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method == "GET" && r.URL.Query().Get("sid") == "" {
		h.handleHandshake(w, r)
		return
	}
	switch transport {
	case "polling":
		h.handlePolling(w, r)
	case "websocket":
		h.handleWebSocket(w, r)
	default:
		http.Error(w, "Unknown transport", http.StatusBadRequest)
	}
}

func (h *Handler) resolveUser(r *http.Request) string {
	if h.AuthFunc == nil {
		return ""
	}
	return h.AuthFunc(r)
}

func (h *Handler) handleHandshake(w http.ResponseWriter, r *http.Request) {
	ses := h.createSession()
	ses.UserID = h.resolveUser(r)
	openData, _ := json.Marshal(map[string]interface{}{
		"sid":          ses.ID,
		"upgrades":     []string{"websocket"},
		"pingInterval": pingInterval.Milliseconds(),
		"pingTimeout":  pingTimeout.Milliseconds(),
		"maxPayload":   1000000,
	})
	resp := EnginePacket{Type: EngineOpen, Data: string(openData)}.Encode()
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(resp))
}

func (h *Handler) handlePolling(w http.ResponseWriter, r *http.Request) {
	sid := r.URL.Query().Get("sid")
	ses := h.getSession(sid)
	if ses == nil {
		http.Error(w, "Unknown session", http.StatusNotFound)
		return
	}
	if ses.Upgraded {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("6"))
		return
	}
	switch r.Method {
	case "GET":
		ses.mu.Lock()
		pending := ses.pending
		ses.pending = nil
		ses.mu.Unlock()
		if len(pending) == 0 {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("6"))
			return
		}
		out := ""
		for _, p := range pending {
			out += p
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(out))
	case "POST":
		buf := make([]byte, r.ContentLength)
		if r.ContentLength > 0 {
			r.Body.Read(buf)
		}
		raw := string(buf)
		if h.OnPacket != nil {
			go h.OnPacket(sid, DecodeEnginePacket(raw))
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	ses := h.createSession()
	ses.UserID = h.resolveUser(r)
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("socketio: upgrade error: %v", err)
		h.removeSession(ses.ID)
		return
	}
	ses.wsConn = conn
	ses.Upgraded = true
	go h.wsPinger(ses, conn)
	openData, _ := json.Marshal(map[string]interface{}{
		"sid":          ses.ID,
		"upgrades":     []string{},
		"pingInterval": pingInterval.Milliseconds(),
		"pingTimeout":  pingTimeout.Milliseconds(),
		"maxPayload":   1000000,
	})
	ses.writeMu.Lock()
	conn.WriteMessage(websocket.TextMessage, []byte(EnginePacket{Type: EngineOpen, Data: string(openData)}.Encode()))
	ses.writeMu.Unlock()
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			h.wsClose(ses)
			return
		}
		raw := string(msg)
		pkt := DecodeEnginePacket(raw)
		switch pkt.Type {
		case EnginePing:
			ses.writeMu.Lock()
			conn.WriteMessage(websocket.TextMessage, []byte(EnginePacket{Type: EnginePong}.Encode()))
			ses.writeMu.Unlock()
		case EnginePong:
			ses.lastPing = time.Now()
		case EngineMessage:
			if h.OnPacket != nil {
				h.OnPacket(ses.ID, pkt)
			}
		}
	}
}

func (h *Handler) wsPinger(ses *Session, conn *websocket.Conn) {
	ticker := time.NewTicker(pingInterval / 2)
	defer ticker.Stop()
	for range ticker.C {
		ses.mu.Lock()
		if ses.closed {
			ses.mu.Unlock()
			return
		}
		ses.mu.Unlock()
		ses.writeMu.Lock()
		err := conn.WriteMessage(websocket.TextMessage, []byte(EnginePacket{Type: EnginePing}.Encode()))
		ses.writeMu.Unlock()
		if err != nil {
			h.wsClose(ses)
			return
		}
	}
}

func (h *Handler) wsClose(ses *Session) {
	ses.closeOnce.Do(func() {
		ses.mu.Lock()
		ses.closed = true
		ses.mu.Unlock()
		if ses.wsConn != nil {
			ses.wsConn.Close()
		}
		if h.OnClose != nil {
			go h.OnClose(ses.ID)
		}
		h.removeSession(ses.ID)
	})
}

func (h *Handler) Send(sid string, payload string) {
	ses := h.getSession(sid)
	if ses == nil {
		return
	}
	ses.mu.Lock()
	if ses.closed {
		ses.mu.Unlock()
		return
	}
	ses.mu.Unlock()
	pkt := EnginePacket{Type: EngineMessage, Data: payload}.Encode()
	if ses.Upgraded && ses.wsConn != nil {
		ses.writeMu.Lock()
		err := ses.wsConn.WriteMessage(websocket.TextMessage, []byte(pkt))
		ses.writeMu.Unlock()
		if err != nil {
			h.wsClose(ses)
		}
		return
	}
	ses.mu.Lock()
	ses.pending = append(ses.pending, pkt)
	ses.mu.Unlock()
}

func (h *Handler) SendRaw(sid string, raw string) {
	ses := h.getSession(sid)
	if ses == nil {
		return
	}
	ses.mu.Lock()
	if ses.closed {
		ses.mu.Unlock()
		return
	}
	ses.mu.Unlock()
	if ses.Upgraded && ses.wsConn != nil {
		ses.writeMu.Lock()
		err := ses.wsConn.WriteMessage(websocket.TextMessage, []byte(raw))
		ses.writeMu.Unlock()
		if err != nil {
			h.wsClose(ses)
		}
		return
	}
	ses.mu.Lock()
	ses.pending = append(ses.pending, raw)
	ses.mu.Unlock()
}

func (h *Handler) CloseSession(sid string) {
	ses := h.getSession(sid)
	if ses == nil {
		return
	}
	h.wsClose(ses)
}

func Router(h *Handler) http.Handler {
	r := chi.NewRouter()
	r.Get("/", h.ServeHTTP)
	r.Post("/", h.ServeHTTP)
	r.Options("/", h.ServeHTTP)
	return r
}
