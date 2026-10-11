package main

import (
	"strings"
	"testing"
)

// TestRedactPathKeepsTokensOutOfRequestLogs covers docs/API.md §1 the imported
// requirement from the design document: a token is a credential that happens to
// travel in the path, so the request log must describe the route without it.
func TestRedactPathKeepsTokensOutOfRequestLogs(t *testing.T) {
	token := "0123456789abcdef." + strings.Repeat("S", 43)
	cases := map[string]string{
		"/enroll/" + token:                  "/enroll/<token>",
		"/api/invites/" + token:             "/api/invites/<token>",
		"/api/invites/" + token + "/accept": "/api/invites/<token>/accept",
		"/api/public/shares/" + token:       "/api/public/shares/<token>",
		"/api/admin/account-enrollments":    "/api/admin/account-enrollments",
		"/api/workspaces":                   "/api/workspaces",
		"/":                                 "/",
	}
	for path, want := range cases {
		if got := redactPath(path); got != want {
			t.Fatalf("redactPath(%q) = %q, want %q", path, got, want)
		}
		if strings.Contains(redactPath(path), token) {
			t.Fatalf("redacted path still contains the token: %s", redactPath(path))
		}
	}
}
