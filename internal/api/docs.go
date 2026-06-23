package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"madoc/internal/db"
)

type DocsHandler struct {
	Repo *db.Repo
}

func (h *DocsHandler) List(w http.ResponseWriter, r *http.Request) {
	docs, err := h.Repo.ListDocs(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if docs == nil {
		docs = []db.Doc{}
	}
	writeJSON(w, http.StatusOK, docs)
}

type createDocReq struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

func (h *DocsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createDocReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		req.Title = "Untitled"
	}
	if err := h.Repo.CreateDoc(r.Context(), req.ID, req.Title); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	d, err := h.Repo.GetDoc(r.Context(), req.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

func (h *DocsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	d, err := h.Repo.GetDoc(r.Context(), id)
	if errors.Is(err, db.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

type textUpsertReq struct {
	Content string `json:"content"`
}

func (h *DocsHandler) UpsertText(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req textUpsertReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.Repo.UpsertText(r.Context(), id, req.Content); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DocsHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		writeJSON(w, http.StatusOK, []db.SearchHit{})
		return
	}
	hits, err := h.Repo.SearchFTS(r.Context(), q)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if hits == nil {
		hits = []db.SearchHit{}
	}
	writeJSON(w, http.StatusOK, hits)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
