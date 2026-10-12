package api

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strconv"

	"madoc/internal/auth"
	"madoc/internal/site"
)

// signupActivatePath is the public page where a registrant sets their name and
// password. It has to match the frontend route, because the verification mail is
// the only thing that ever hands someone their link — and because that link is a
// credential, route-level log redaction must cover it (see tokenPathPrefixes).
const signupActivatePath = "/sign-up/"

// requestSignupResponse is the single answer the request endpoint ever gives.
//
// Its text says nothing about the mailbox. The same status, headers and body
// come back for a mailbox that already has an account, one that has an
// outstanding request, and one that has never been seen. Any difference at all
// — a faster rejection, a different word — turns this endpoint into an account
// enumeration oracle, which is worth more to an attacker than any single
// account.
type requestSignupResponse struct {
	Accepted bool   `json:"accepted"`
	Message  string `json:"message"`
}

const signupAcceptedMessage = "如果该邮箱可以用于注册，我们已经发送了一封验证邮件。请查收并按邮件中的链接完成注册。"

type requestSignupRequest struct {
	Email string `json:"email"`
}

type completeSignupRequest struct {
	Token    string `json:"token"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

// requestSignup accepts an address to verify.
//
// Like the administrator activation endpoint it is anonymous, so it cannot use
// the session-bound CSRF check; it takes the same explicit same-origin check
// instead. It does not consume a token and does not change any authorization —
// the worst a cross-site caller gets is one mail to a mailbox they chose, which
// the rate limits bound.
func (a *API) requestSignup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var body requestSignupRequest
	if err := decode(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	}
	err := a.site.RequestPublicSignup(r.Context(), site.SignupRequest{
		Email:  body.Email,
		Source: requestSource(r),
	})
	switch {
	case err == nil:
	case errors.Is(err, site.ErrRegistrationClosed):
		// The site is not offering self-service registration. This is a fact
		// GET /api/site already publishes, so saying it reveals nothing.
		writeError(w, http.StatusForbidden, "REGISTRATION_CLOSED", "当前站点未开放自助注册")
		return
	case errors.Is(err, site.ErrRegistrationNotReady):
		writeError(w, http.StatusUnprocessableEntity, "REGISTRATION_NOT_READY", "站点尚未配置发信能力，公开注册不可用")
		return
	case errors.Is(err, site.ErrInvalidChange):
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	default:
		writeSignupError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, requestSignupResponse{Accepted: true, Message: signupAcceptedMessage})
}

// completeSignup turns a verified mailbox into an account and signs it in.
//
// Opening the link does not reach this handler: the token is in the body, and
// only a POST consumes it. That separation is what keeps a mail client or chat
// preview that fetches links from spending the registrant's single chance
// before they have seen it (§11.2).
func (a *API) completeSignup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, private")
	var body completeSignupRequest
	if err := decode(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	}
	account, err := a.site.CompletePublicSignup(r.Context(), site.CompleteSignupRequest{
		Token:    body.Token,
		Name:     body.Name,
		Password: body.Password,
		Source:   requestSource(r),
		// bcrypt runs outside every transaction.
		HashPassword: auth.HashPassword,
	})
	if err != nil {
		writeSignupError(w, err)
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

// writeSignupError maps the public registration verdicts.
//
// Every unusable token collapses into one indistinguishable NOT_FOUND: unknown,
// revoked, consumed and expired must not be tellable apart, or a failed attempt
// becomes a way to map the token space.
func writeSignupError(w http.ResponseWriter, err error) {
	var limited *site.RateLimitError
	switch {
	case errors.As(err, &limited):
		seconds := int(limited.RetryAfter.Seconds())
		if seconds < 1 {
			seconds = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(seconds))
		writeError(w, http.StatusTooManyRequests, "RATE_LIMITED", "操作过于频繁，请稍后重试")
	case errors.Is(err, site.ErrEnrollmentNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "resource not found")
	case errors.Is(err, site.ErrEmailAlreadyRegistered):
		// The account exists and stays untouched. The wording points at sign-in
		// because that is the only thing this person can do next — offering to
		// "reset" here would imply a capability this flow does not have.
		writeError(w, http.StatusConflict, "EMAIL_ALREADY_REGISTERED", "该邮箱已注册，请直接登录")
	case errors.Is(err, site.ErrRegistrationClosed):
		writeError(w, http.StatusForbidden, "REGISTRATION_CLOSED", "站点已关闭公开注册，请联系站点管理员")
	case errors.Is(err, site.ErrRegistrationNotReady):
		writeError(w, http.StatusUnprocessableEntity, "REGISTRATION_NOT_READY", "站点尚未配置发信能力，公开注册不可用")
	case errors.Is(err, site.ErrMailDeliveryFailed):
		// The relay failed. The anonymous caller learns only that nothing was
		// created; the relay's own error is in the server log.
		writeError(w, http.StatusInternalServerError, "INTERNAL", "server error")
	default:
		writeSiteError(w, err)
	}
}

// peerAddressKey carries the address the connection actually came from.
type peerAddressKey struct{}

// CapturePeerAddress records the socket's remote address before any other
// middleware can rewrite it.
//
// chi's RealIP replaces RemoteAddr with X-Forwarded-For or X-Real-IP, both of
// which a client controls outright. That is the right default for logging but
// the wrong input for a rate limiter: an attacker who may vary the header per
// request gets a fresh budget every request. Registering this middleware ahead
// of RealIP is what lets the limiter charge the real connection.
func CapturePeerAddress(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), peerAddressKey{}, r.RemoteAddr)))
	})
}

// requestSource is the rate limiting key for one anonymous request.
//
// It is the connection source, never a forwarded header. The deployment has no
// trusted-proxy configuration to consult, and assuming one would mean trusting a
// client-supplied value — which is exactly what the limit must not be built on.
func requestSource(r *http.Request) string {
	raw, _ := r.Context().Value(peerAddressKey{}).(string)
	if raw == "" {
		raw = r.RemoteAddr
	}
	if host, _, err := net.SplitHostPort(raw); err == nil {
		return host
	}
	return raw
}
