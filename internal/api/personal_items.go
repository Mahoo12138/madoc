package api

import (
	"github.com/go-chi/chi/v5"
	"net/http"
)

func (a *API) personalItems(w http.ResponseWriter, r *http.Request) {
	result, err := a.core.PersonalItems(r.Context(), userID(r), chi.URLParam(r, "workspaceId"))
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
func (a *API) setFavorite(w http.ResponseWriter, r *http.Request) {
	if err := a.core.SetFavorite(r.Context(), userID(r), chi.URLParam(r, "itemId"), r.Method == http.MethodPut); err != nil {
		domainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (a *API) visitItem(w http.ResponseWriter, r *http.Request) {
	if err := a.core.VisitItem(r.Context(), userID(r), chi.URLParam(r, "itemId")); err != nil {
		domainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
