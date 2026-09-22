package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"madoc/internal/core"
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
	a.notifyWorkspace(chi.URLParam(r, "workspaceId"))
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) trashItems(w http.ResponseWriter, r *http.Request) {
	items, err := a.core.TrashItems(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), chi.URLParam(r, "batchId"))
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) purgeTrash(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Confirmation string `json:"confirmation"`
	}
	if decode(r, &body) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	if err := a.core.PurgeTrash(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), chi.URLParam(r, "batchId"), body.Confirmation); err != nil {
		domainError(w, err)
		return
	}
	a.notifyWorkspace(chi.URLParam(r, "workspaceId"))
	w.WriteHeader(http.StatusNoContent)
}
