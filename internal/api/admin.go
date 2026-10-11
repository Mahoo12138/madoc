package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"madoc/internal/auth"
	"madoc/internal/site"
)

type updateSiteSettingsRequest struct {
	ExpectedRevision *int                       `json:"expectedRevision"`
	Changes          map[string]json.RawMessage `json:"changes"`
}

type patchAdminUserRequest struct {
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

// writeAdminUserError maps the user lifecycle verdicts. It exists separately
// from writeSiteError because REVISION_CONFLICT on an account needs its own
// wording; the settings message would claim the wrong resource changed.
func writeAdminUserError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, site.ErrSelfDisableForbidden):
		writeError(w, http.StatusForbidden, "SELF_DISABLE_FORBIDDEN", "administrators cannot disable their own account")
	case errors.Is(err, site.ErrRevisionConflict):
		writeError(w, http.StatusConflict, "REVISION_CONFLICT", "this account was changed by another administrator")
	default:
		writeSiteError(w, err)
	}
}

func (a *API) listAdminUsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, private")
	query, err := site.ParseUserListQuery(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	}
	result, err := a.site.ListUsers(r.Context(), query)
	if err != nil {
		writeAdminUserError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (a *API) getAdminUser(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, private")
	user, err := a.site.AdminUser(r.Context(), chi.URLParam(r, "userId"))
	if err != nil {
		writeAdminUserError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (a *API) patchAdminUser(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, private")
	var body patchAdminUserRequest
	if err := decode(r, &body); err != nil || body.ExpectedRevision == nil || len(body.Changes) == 0 {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	}
	operator := auth.UserFromContext(r.Context())
	result, err := a.site.UpdateUser(r.Context(), site.Actor{
		ID:                 operator.ID,
		IsAdmin:            operator.IsAdmin,
		Disabled:           operator.Disabled,
		CanCreateWorkspace: operator.CanCreateWorkspace,
	}, chi.URLParam(r, "userId"), *body.ExpectedRevision, body.Changes)
	if err != nil {
		writeAdminUserError(w, err)
		return
	}
	// The database change is already committed; the realtime step can only add
	// connection teardown. A failure here is logged as a diagnosable error and
	// never rolls back durable state: stale connections die with the process and
	// a restart reads the disabled flag from the database.
	if result.RevokeSessions {
		a.revokeAccountSessions(result.User.ID)
	}
	writeJSON(w, http.StatusOK, result.User)
}

func (a *API) revokeAdminUserSessions(w http.ResponseWriter, r *http.Request) {
	operator := auth.UserFromContext(r.Context())
	targetID := chi.URLParam(r, "userId")
	_, err := a.site.RevokeUserSessions(r.Context(), site.Actor{
		ID:                 operator.ID,
		IsAdmin:            operator.IsAdmin,
		Disabled:           operator.Disabled,
		CanCreateWorkspace: operator.CanCreateWorkspace,
	}, targetID)
	if err != nil {
		writeAdminUserError(w, err)
		return
	}
	a.revokeAccountSessions(targetID)
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) revokeAccountSessions(userID string) {
	if rooms, ok := a.rooms.(AccountRooms); ok && rooms != nil {
		rooms.RevokeOtherSessions(userID, "")
		return
	}
	log.Printf("admin: realtime revocation unavailable for user %s; database state is committed and connections end with the process", userID)
}
