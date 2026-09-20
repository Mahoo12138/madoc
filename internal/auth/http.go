package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
)

const (
	SessionCookie = "madoc_session"
	CSRFCookie    = "madoc_csrf"
	CSRFHeader    = "x-madoc-csrf-token"
)

type contextKey string

const userContextKey contextKey = "madoc-user"

func UserFromContext(ctx context.Context) *User {
	user, _ := ctx.Value(userContextKey).(*User)
	return user
}

func (s *Service) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(SessionCookie)
		if err != nil {
			writeAuthError(w)
			return
		}
		user, err := s.Resolve(r.Context(), cookie.Value)
		if err != nil {
			writeAuthError(w)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey, user)))
	})
}

func writeAuthError(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": "UNAUTHORIZED", "message": "authentication required"}})
}

func (s *Service) Optional(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cookie, err := r.Cookie(SessionCookie); err == nil {
			if user, err := s.Resolve(r.Context(), cookie.Value); err == nil {
				r = r.WithContext(context.WithValue(r.Context(), userContextKey, user))
			}
		}
		next.ServeHTTP(w, r)
	})
}

type CSRF struct{ secret []byte }

func NewCSRF(secret []byte) *CSRF { return &CSRF{secret: secret} }

func (c *CSRF) Issue(w http.ResponseWriter, secure bool) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	http.SetCookie(w, &http.Cookie{Name: CSRFCookie, Value: token + "." + c.sign(token), Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: secure})
	return token, nil
}

func (c *CSRF) Validate(r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
		return true
	}
	cookie, err := r.Cookie(CSRFCookie)
	if err != nil {
		return false
	}
	parts := strings.Split(cookie.Value, ".")
	if len(parts) != 2 || !hmac.Equal([]byte(parts[1]), []byte(c.sign(parts[0]))) {
		return false
	}
	return hmac.Equal([]byte(parts[0]), []byte(r.Header.Get(CSRFHeader)))
}

func (c *CSRF) sign(value string) string {
	mac := hmac.New(sha256.New, c.secret)
	mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
