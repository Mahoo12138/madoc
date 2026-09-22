package api

import (
	"github.com/go-chi/chi/v5"
	"madoc/internal/core"
	"net/http"
	"strconv"
)

func (a *API) search(w http.ResponseWriter, r *http.Request) {
	limit := 30
	if value := r.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			domainError(w, core.ErrInvalid)
			return
		}
		limit = parsed
	}
	result, err := a.core.Search(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), r.URL.Query().Get("q"), limit)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
