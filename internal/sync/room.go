package sync

import "sync"

type Peer struct {
	SID        string
	ClientID   string
	UserID     string
	Awareness  map[string]bool
}

type Room struct {
	mu    sync.RWMutex
	Peers map[string]*Peer
}

type RoomManager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

func NewRoomManager() *RoomManager {
	return &RoomManager{rooms: make(map[string]*Room)}
}

func (rm *RoomManager) Join(spaceType, spaceID string, p *Peer) {
	key := spaceType + ":" + spaceID
	rm.mu.Lock()
	r, ok := rm.rooms[key]
	if !ok {
		r = &Room{Peers: make(map[string]*Peer)}
		rm.rooms[key] = r
	}
	rm.mu.Unlock()
	r.mu.Lock()
	r.Peers[p.SID] = p
	r.mu.Unlock()
}

func (rm *RoomManager) Leave(spaceType, spaceID string, sid string) {
	key := spaceType + ":" + spaceID
	rm.mu.RLock()
	r, ok := rm.rooms[key]
	rm.mu.RUnlock()
	if !ok {
		return
	}
	r.mu.Lock()
	delete(r.Peers, sid)
	empty := len(r.Peers) == 0
	r.mu.Unlock()
	if empty {
		rm.mu.Lock()
		delete(rm.rooms, key)
		rm.mu.Unlock()
	}
}

func (rm *RoomManager) LeaveAll(sid string) {
	rm.mu.RLock()
	keys := make([]string, 0, len(rm.rooms))
	for k := range rm.rooms {
		keys = append(keys, k)
	}
	rm.mu.RUnlock()
	for _, key := range keys {
		rm.mu.RLock()
		r, ok := rm.rooms[key]
		rm.mu.RUnlock()
		if !ok {
			continue
		}
		r.mu.Lock()
		delete(r.Peers, sid)
		empty := len(r.Peers) == 0
		r.mu.Unlock()
		if empty {
			rm.mu.Lock()
			delete(rm.rooms, key)
			rm.mu.Unlock()
		}
	}
}

func (rm *RoomManager) PeersIn(spaceType, spaceID string) []*Peer {
	key := spaceType + ":" + spaceID
	rm.mu.RLock()
	r, ok := rm.rooms[key]
	rm.mu.RUnlock()
	if !ok {
		return nil
	}
	r.mu.RLock()
	out := make([]*Peer, 0, len(r.Peers))
	for _, p := range r.Peers {
		out = append(out, p)
	}
	r.mu.RUnlock()
	return out
}
