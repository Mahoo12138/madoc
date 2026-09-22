package api

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"madoc/internal/core"
)

func (a *API) duplicateItem(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if decode(r, &body) != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	item, err := a.core.DuplicateItem(r.Context(), userID(r), chi.URLParam(r, "itemId"), body.Title)
	if errors.Is(err, core.ErrMarkdownExportPending) {
		writeError(w, http.StatusConflict, "COPY_NOT_READY", "正文尚未追上已保存修改，请稍后重试复制")
		return
	}
	if err != nil {
		domainError(w, err)
		return
	}
	a.notifyWorkspace(item.WorkspaceID)
	writeJSON(w, http.StatusCreated, item)
}
