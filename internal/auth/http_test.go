package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSessionCSRFTokenReuseAndTamper(t *testing.T) {
	csrf := NewCSRF([]byte("test signing secret"))
	first := httptest.NewRecorder()
	token, err := csrf.Token(first, httptest.NewRequest(http.MethodGet, "/", nil), false)
	if err != nil {
		t.Fatal(err)
	}
	cookie := first.Result().Cookies()[0]
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.AddCookie(cookie)
	next := httptest.NewRecorder()
	reused, err := csrf.Token(next, request, false)
	if err != nil || reused != token || len(next.Result().Cookies()) != 0 {
		t.Fatal("session refresh rotated browser CSRF", err)
	}
	write := httptest.NewRequest(http.MethodPatch, "/", nil)
	write.AddCookie(cookie)
	write.Header.Set(CSRFHeader, token)
	if !csrf.Validate(write) {
		t.Fatal("existing tab token rejected")
	}
	cookie.Value += "tampered"
	request = httptest.NewRequest(http.MethodGet, "/", nil)
	request.AddCookie(cookie)
	replacement, err := csrf.Token(httptest.NewRecorder(), request, false)
	if err != nil || replacement == token {
		t.Fatal("tampered cookie reused", err)
	}
}
