package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"madoc/internal/core"
)

func (a *API) listWorkspaceActivity(w http.ResponseWriter, r *http.Request) {
	limit := 0
	if value := r.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			domainError(w, core.ErrInvalid)
			return
		}
		limit = parsed
	}
	events, nextBefore, err := a.core.ListWorkspaceActivity(r.Context(), userID(r), chi.URLParam(r, "workspaceId"), r.URL.Query().Get("before"), limit)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events, "nextBefore": nextBefore})
}
