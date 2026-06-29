package auth

import (
	"context"
	"net/http"

	"madoc/internal/db"
)

type ctxKey string

const CtxUserKey ctxKey = "user"
const CtxSessionIDKey ctxKey = "session_id"

func GetUser(ctx context.Context) *db.User {
	u, _ := ctx.Value(CtxUserKey).(*db.User)
	return u
}

func GetSessionID(ctx context.Context) string {
	s, _ := ctx.Value(CtxSessionIDKey).(string)
	return s
}

func (m *SessionManager) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("sid")
		if err != nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		user, err := m.resolveUser(r, cookie.Value)
		if err != nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), CtxUserKey, user)
		ctx = context.WithValue(ctx, CtxSessionIDKey, cookie.Value)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *SessionManager) OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("sid")
		if err == nil {
			user, err := m.resolveUser(r, cookie.Value)
			if err == nil && user != nil {
				ctx := context.WithValue(r.Context(), CtxUserKey, user)
				ctx = context.WithValue(ctx, CtxSessionIDKey, cookie.Value)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (m *SessionManager) resolveUser(r *http.Request, sessionID string) (*db.User, error) {
	userID, err := m.GetUserID(r.Context(), sessionID)
	if err != nil {
		return nil, err
	}
	user, err := m.repo.GetUserByID(r.Context(), userID)
	if err != nil {
		return nil, err
	}
	return user, nil
}
