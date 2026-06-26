package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"

	"github.com/gorilla/securecookie"
)

type CSRFProtector struct {
	sc *securecookie.SecureCookie
}

func NewCSRFProtector(hashKey []byte) *CSRFProtector {
	if hashKey == nil {
		hashKey = make([]byte, 32)
		copy(hashKey, []byte("madoc-csrf-hash-key-2024-abcdef123456"))
	}
	return &CSRFProtector{
		sc: securecookie.New(hashKey, nil),
	}
}

func (p *CSRFProtector) Generate(w http.ResponseWriter) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)
	encoded, err := p.sc.Encode("csrf_token", token)
	if err != nil {
		return "", err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "csrf_token",
		Value:    encoded,
		Path:     "/",
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	})
	return token, nil
}

func (p *CSRFProtector) Validate(r *http.Request) bool {
	cookie, err := r.Cookie("csrf_token")
	if err != nil {
		return false
	}
	var token string
	if err := p.sc.Decode("csrf_token", cookie.Value, &token); err != nil {
		return false
	}
	header := r.Header.Get("x-affine-csrf-token")
	return token == header
}
