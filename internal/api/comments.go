package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"madoc/internal/core"
)

func (a *API) listItemComments(w http.ResponseWriter, r *http.Request) {
	limit := 0
	if value := r.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			domainError(w, core.ErrInvalid)
			return
		}
		limit = parsed
	}
	comments, nextBefore, err := a.core.ListItemComments(r.Context(), userID(r), chi.URLParam(r, "itemId"), r.URL.Query().Get("before"), limit)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"comments": comments, "nextBefore": nextBefore})
}

func (a *API) createItemComment(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Body string `json:"body"`
	}
	if decode(r, &body) != nil || strings.TrimSpace(body.Body) == "" {
		domainError(w, core.ErrInvalid)
		return
	}
	comment, err := a.core.CreateItemComment(r.Context(), userID(r), chi.URLParam(r, "itemId"), body.Body)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"comment": comment})
}

func (a *API) deleteItemComment(w http.ResponseWriter, r *http.Request) {
	if err := a.core.DeleteItemComment(r.Context(), userID(r), chi.URLParam(r, "itemId"), chi.URLParam(r, "commentId")); err != nil {
		domainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
