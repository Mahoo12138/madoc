package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

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

// auditEventsResponse is the list payload. `nextBefore` is the cursor for the
// next, older page and is null on the last page.
type auditEventsResponse struct {
	Events     []site.AuditEvent `json:"events"`
	NextBefore *string           `json:"nextBefore"`
}

// listAuditEvents reads the management audit trail. Filters are validated
// against a server-owned whitelist before the query is built, so client text is
// never interpolated into SQL.
func (a *API) listAuditEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	query, err := site.ParseAuditQuery(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	}
	events, nextBefore, err := a.site.ListAuditEvents(r.Context(), query)
	if err != nil {
		writeSiteError(w, err)
		return
	}
	response := auditEventsResponse{Events: events}
	if nextBefore != nil {
		cursor := strconv.FormatInt(*nextBefore, 10)
		response.NextBefore = &cursor
	}
	writeJSON(w, http.StatusOK, response)
}

type createAccountEnrollmentRequest struct {
	Email              string `json:"email"`
	CanCreateWorkspace bool   `json:"canCreateWorkspace"`
}

type completeAccountEnrollmentRequest struct {
	Token    string `json:"token"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

type enrollmentListResponse struct {
	Enrollments []site.Enrollment `json:"enrollments"`
}

type createEnrollmentResponse struct {
	Enrollment site.Enrollment `json:"enrollment"`
	Token      string          `json:"token"`
	URL        string          `json:"url"`
}

// enrollmentActivatePath is the public page where the recipient sets their name
// and password; it has to match the frontend route, because the create response
// is the only thing that ever hands the recipient their link. Route-level log
// redaction applies here: never log the path with its argument.
const enrollmentActivatePath = "/enroll/"

// listAccountEnrollments renders the pending and historical activation records.
// The response can only contain what the token digests allow, so there is no
// token to redact here.
func (a *API) listAccountEnrollments(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, private")
	result, err := a.site.ListEnrollments(r.Context())
	if err != nil {
		writeEnrollmentError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, enrollmentListResponse{Enrollments: result.Enrollments})
}

// createAccountEnrollment issues one activation record. The plain token is
// returned here and nowhere else: later reads can only revoke or supersede it.
func (a *API) createAccountEnrollment(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, private")
	var body createAccountEnrollmentRequest
	if err := decode(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	}
	operator := auth.UserFromContext(r.Context())
	enrollment, token, err := a.site.CreateEnrollment(r.Context(), site.Actor{
		ID:                 operator.ID,
		IsAdmin:            operator.IsAdmin,
		Disabled:           operator.Disabled,
		CanCreateWorkspace: operator.CanCreateWorkspace,
	}, body.Email, body.CanCreateWorkspace)
	if err != nil {
		writeEnrollmentError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, createEnrollmentResponse{Enrollment: enrollment, Token: token, URL: enrollmentActivatePath + token})
}

// revokeAccountEnrollment withdraws exactly one approval. Other records for the
// same mailbox are separate decisions and stay untouched.
func (a *API) revokeAccountEnrollment(w http.ResponseWriter, r *http.Request) {
	operator := auth.UserFromContext(r.Context())
	if err := a.site.RevokeEnrollment(r.Context(), site.Actor{
		ID:                 operator.ID,
		IsAdmin:            operator.IsAdmin,
		Disabled:           operator.Disabled,
		CanCreateWorkspace: operator.CanCreateWorkspace,
	}, chi.URLParam(r, "enrollmentId")); err != nil {
		writeEnrollmentError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// completeAccountEnrollment turns an administrator's approval into an account.
//
// The caller is anonymous by definition, so the request cannot be protected by
// the CSRF middleware: that check reads a cookie bound to a session this person
// does not have yet, and requiring it would close the only path a legitimate
// invitee has. The flow is still bound to this origin - see sameOriginRequired -
// and the credential itself is the single-use token in the body, which an
// attacker cannot read from another site. Dropping origin checking entirely is
// the opposite mistake and would make this an open cross-site endpoint.
func (a *API) completeAccountEnrollment(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, private")
	var body completeAccountEnrollmentRequest
	if err := decode(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	}
	account, err := a.site.CompleteEnrollment(r.Context(), site.CompleteEnrollmentRequest{
		Token:    body.Token,
		Name:     body.Name,
		Password: body.Password,
		// bcrypt runs outside every transaction; see the request type comment.
		HashPassword: auth.HashPassword,
	})
	if err != nil {
		writeEnrollmentError(w, err)
		return
	}
	user := auth.User{
		ID:                 account.ID,
		Name:               account.Name,
		Email:              account.Email,
		IsAdmin:            account.IsAdmin,
		Disabled:           account.Disabled,
		CanCreateWorkspace: account.CanCreateWorkspace,
	}
	user.ApplyCapabilities()
	session, err := a.auth.CreateSession(r.Context(), user.ID)
	if err != nil {
		domainError(w, err)
		return
	}
	setSessionCookie(w, session, a.secureCookies)
	token, err := a.csrf.Issue(w, a.secureCookies)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user, "csrfToken": token})
}

// writeEnrollmentError maps the enrollment verdicts. Missing records collapse
// into one indistinguishable NOT_FOUND so an attacker cannot tell an unknown
// token from a revoked, consumed or expired one.
func writeEnrollmentError(w http.ResponseWriter, err error) {
	var limited *site.RateLimitError
	switch {
	case errors.As(err, &limited):
		seconds := int(limited.RetryAfter.Seconds())
		if seconds < 1 {
			seconds = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(seconds))
		writeError(w, http.StatusTooManyRequests, "RATE_LIMITED", "操作过于频繁，请稍后重试")
	case errors.Is(err, site.ErrEmailAlreadyRegistered):
		writeError(w, http.StatusConflict, "EMAIL_ALREADY_REGISTERED", "该邮箱已有账号，请到「用户管理」中调整，建号流程不会修改已有账号")
	case errors.Is(err, site.ErrEnrollmentIssuerRevoked):
		writeError(w, http.StatusForbidden, "ADMIN_REQUIRED", "批准此次建号的管理员已无站点管理权限，请联系站点管理员重新发起邀请")
	case errors.Is(err, site.ErrEnrollmentNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "resource not found")
	default:
		writeSiteError(w, err)
	}
}

func (a *API) revokeAccountSessions(userID string) {
	if rooms, ok := a.rooms.(AccountRooms); ok && rooms != nil {
		rooms.RevokeOtherSessions(userID, "")
		return
	}
	log.Printf("admin: realtime revocation unavailable for user %s; database state is committed and connections end with the process", userID)
}
