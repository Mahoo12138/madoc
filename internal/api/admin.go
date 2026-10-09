package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"madoc/internal/auth"
	"madoc/internal/site"
)

type updateSiteSettingsRequest struct {
	ExpectedRevision *int                       `json:"expectedRevision"`
	Changes          map[string]json.RawMessage `json:"changes"`
}

func (a *API) adminRequired(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil || user.Disabled || !user.IsAdmin {
			writeError(w, http.StatusForbidden, "ADMIN_REQUIRED", "site administrator access is required")
			return
		}
		next(w, r)
	}
}

func (a *API) getSiteSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	settings, err := a.site.Ensure(r.Context())
	if err != nil {
		writeSiteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (a *API) patchSiteSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var body updateSiteSettingsRequest
	if err := decode(r, &body); err != nil || body.ExpectedRevision == nil || len(body.Changes) == 0 {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	}
	user := auth.UserFromContext(r.Context())
	settings, err := a.site.Update(r.Context(), site.Actor{
		ID:                 user.ID,
		IsAdmin:            user.IsAdmin,
		Disabled:           user.Disabled,
		CanCreateWorkspace: user.CanCreateWorkspace,
	}, *body.ExpectedRevision, body.Changes)
	if err != nil {
		writeSiteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func writeSiteError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, site.ErrAdminRequired):
		writeError(w, http.StatusForbidden, "ADMIN_REQUIRED", "site administrator access is required")
	case errors.Is(err, site.ErrRegistrationNotReady):
		writeError(w, http.StatusUnprocessableEntity, "REGISTRATION_NOT_READY", "public registration is not ready")
	default:
		domainError(w, err)
	}
}
