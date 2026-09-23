package api

import (
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"madoc/internal/core"
)

// Native snapshots and JSON escaping add overhead beyond source ZIP bytes.
// Decoded content and assets are independently bounded by the import service.
const maxImportRequestBytes int64 = 1 << 30

func (a *API) importContent(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	role, err := a.core.Role(r.Context(), userID(r), workspaceID)
	if err != nil || (role != "owner" && role != "editor") {
		domainError(w, core.ErrForbidden)
		return
	}
	deadline := time.Now().Add(5 * time.Minute)
	controller := http.NewResponseController(w)
	_ = controller.SetReadDeadline(deadline)
	_ = controller.SetWriteDeadline(deadline)
	r.Body = http.MaxBytesReader(w, r.Body, maxImportRequestBytes)
	defer r.Body.Close()
	reader, err := r.MultipartReader()
	if err != nil {
		domainError(w, core.ErrInvalid)
		return
	}
	part, err := reader.NextPart()
	if err != nil {
		importRequestError(w, err, true)
		return
	}
	if part.FormName() != "plan" || part.FileName() != "" {
		domainError(w, core.ErrInvalid)
		return
	}
	var plan core.ContentImport
	decoder := json.NewDecoder(part)
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&plan); err != nil {
		importRequestError(w, err, true)
		return
	}
	var trailing any
	if err = decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		importRequestError(w, err, true)
		return
	}
	if err = part.Close(); err != nil {
		importRequestError(w, err, true)
		return
	}
	result, err := a.assets.ImportContent(r.Context(), userID(r), workspaceID, plan, reader)
	if err != nil {
		importRequestError(w, err, false)
		return
	}
	if !result.Replayed {
		a.notifyWorkspace(workspaceID)
	}
	w.Header().Set("Cache-Control", "no-store")
	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK
	}
	writeJSON(w, status, result)
}

func importRequestError(w http.ResponseWriter, err error, invalidJSON bool) {
	var limit *http.MaxBytesError
	if errors.As(err, &limit) || errors.Is(err, multipart.ErrMessageTooLarge) {
		writeError(w, http.StatusRequestEntityTooLarge, "IMPORT_TOO_LARGE", "导入请求超过传输大小上限")
		return
	}
	if invalidJSON || errors.Is(err, io.ErrUnexpectedEOF) {
		domainError(w, core.ErrInvalid)
		return
	}
	domainError(w, err)
}
