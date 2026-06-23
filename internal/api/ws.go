package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"madoc/internal/ws"
)

type WSHandler struct {
	Hub *ws.Hub
}

func (h *WSHandler) Handle(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "id")
	if docID == "" {
		http.Error(w, "doc id required", http.StatusBadRequest)
		return
	}
	c, err := ws.NewClient(w, r)
	if err != nil {
		return
	}
	h.Hub.Join(r.Context(), docID, c)
}
