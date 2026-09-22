package api

import (
	"github.com/go-chi/chi/v5"
	"madoc/internal/core"
	"net/http"
)

func (a *API) listTrash(w http.ResponseWriter, r *http.Request) {
	batches, err := a.core.ListTrash(r.Context(), userID(r), chi.URLParam(r, "workspaceId"))
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, batches)
}

func (a *API) restoreTrash(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Destination *core.TrashDestination `json:"destination"`
	}
	if decode(r, &body) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	if err := a.core.RestoreTrash(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), chi.URLParam(r, "batchId"), body.Destination); err != nil {
		domainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
