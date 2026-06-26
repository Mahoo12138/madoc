package auth

import (
	"context"
	"net/http"

	"madoc/internal/db"
)

type ctxKey string

const CtxUserKey ctxKey = "user"

func GetUser(ctx context.Context) *db.User {
	u, _ := ctx.Value(CtxUserKey).(*db.User)
	return u
}

func (m *SessionManager) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := m.resolveUser(r)
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), CtxUserKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *SessionManager) OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := m.resolveUser(r)
		if user != nil {
			ctx := context.WithValue(r.Context(), CtxUserKey, user)
			r = r.WithContext(ctx)
		}
		next.ServeHTTP(w, r)
	})
}

func (m *SessionManager) resolveUser(r *http.Request) *db.User {
	cookie, err := r.Cookie("sid")
	if err != nil {
		return nil
	}
	userID, err := m.GetUserID(r.Context(), cookie.Value)
	if err != nil {
		return nil
	}
	user, err := m.repo.GetUserByID(r.Context(), userID)
	if err != nil {
		return nil
	}
	return user
}
