package main

import (
	"embed"
	"encoding/json"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"madoc/internal/auth"
	"madoc/internal/db"
	"madoc/internal/graphql"
	"madoc/internal/sync"
)

//go:embed all:web/dist
var frontendFS embed.FS

func main() {
	dbPath := envOr("MADOC_DB", "madoc.db")
	addr := envOr("MADOC_ADDR", ":4000")

	conn, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer conn.Close()
	repo := db.NewRepo(conn)

	sm := auth.NewSessionManager(repo)
	csrf := auth.NewCSRFProtector([]byte("madoc-csrf-hash-key-32bytes!"))
	authH := auth.NewAuthHandler(sm, csrf, repo)
	setupH := auth.NewSetupHandler(repo, sm, csrf)
	gqlH := graphql.NewHandler(repo)
	syncSrv := sync.NewServer(repo, sm)

	isDev := os.Getenv("MADOC_DEV") == "true"

	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	if isDev {
		r.Use(corsMiddleware)
		log.Println("MADOC_DEV=true: CORS enabled for development")
	}

	r.Get("/info", infoHandler(repo))
	r.Post("/api/setup/create-admin-user", setupH.ServeHTTP)
	r.Post("/api/auth/preflight", authH.Preflight)
	r.Post("/api/auth/sign-in", authH.SignIn)
	r.Post("/api/auth/sign-out", authH.SignOut)
	r.Get("/api/auth/session", authH.Session)
	r.Get("/api/auth/methods", authMethodsHandler)
	r.With(sm.OptionalAuth).Post("/graphql", gqlH.ServeHTTP)

	r.Mount("/socket.io", syncSrv.Router())
	syncSrv.StartCompactionLoop()

	r.Get("/api/workspaces/{workspaceId}/blobs/{key}", blobDownloadHandler(repo))
	r.With(sm.OptionalAuth).Post("/api/workspaces/{workspaceId}/blobs/{key}", blobUploadHandler(repo))

	// Doc binary endpoint (used by frontend for initial doc loading)
	r.With(sm.OptionalAuth).Get("/api/workspaces/{workspaceId}/docs/{guid}", docDownloadHandler(repo))

	// Public doc endpoints (madoc doesn't support public docs yet, return 404)
	r.Head("/api/workspaces/{workspaceId}/public-docs/{docId}", publicDocHandler)
	r.Get("/api/workspaces/{workspaceId}/public-docs/{docId}", publicDocHandler)

	static, err := fs.Sub(frontendFS, "web/dist")
	if err != nil {
		log.Fatalf("static fs: %v", err)
	}
	fileServer := http.FileServer(http.FS(static))
	r.Get("/*", spaHandler(static, fileServer))

	srv := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("madoc listening on %s (db: %s)", addr, dbPath)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func infoHandler(repo *db.Repo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		initialized, err := repo.IsInitialized(r.Context())
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"version":     "0.26.2",
			"type":        "selfhosted",
			"flavor":      "allinone",
			"initialized": initialized,
		})
	}
}

func spaHandler(static fs.FS, fileServer http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/selfhost.html"
			fileServer.ServeHTTP(w, r2)
			return
		}
		if _, err := fs.Stat(static, p); err != nil {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/selfhost.html"
			fileServer.ServeHTTP(w, r2)
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}

func blobDownloadHandler(repo *db.Repo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		workspaceID := chi.URLParam(r, "workspaceId")
		key := chi.URLParam(r, "key")
		b, err := repo.GetBlob(r.Context(), workspaceID, key)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", b.Mime)
		w.Header().Set("Content-Length", strconv.Itoa(len(b.Data)))
		w.Write(b.Data)
	}
}

func blobUploadHandler(repo *db.Repo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		workspaceID := chi.URLParam(r, "workspaceId")
		key := chi.URLParam(r, "key")
		data, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read error", http.StatusBadRequest)
			return
		}
		mimeType := r.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		if err := repo.CreateBlob(r.Context(), workspaceID, key, int64(len(data)), mimeType, data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success":true}`))
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// authMethodsHandler returns available auth methods for the current user.
func authMethodsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"password":{"bound":true},"oauth":{"bound":false,"providers":[]},"passkey":{"bound":false,"count":0}}`))
}

// docDownloadHandler returns the binary representation of a doc (snapshot + updates).
func docDownloadHandler(repo *db.Repo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		workspaceID := chi.URLParam(r, "workspaceId")
		guid := chi.URLParam(r, "guid")
		ctx := r.Context()

		// Collect all updates for this doc
		updates, err := repo.ListUpdates(ctx, workspaceID, guid)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		var bin []byte
		for _, u := range updates {
			bin = append(bin, u.Blob...)
		}

		// If no updates, try snapshot
		if len(bin) == 0 {
			snap, err := repo.GetSnapshot(ctx, workspaceID, guid)
			if err != nil || snap == nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			bin = snap.Blob
		}

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Write(bin)
	}
}

// publicDocHandler returns 404 for public-doc requests since madoc doesn't support public docs yet.
func publicDocHandler(w http.ResponseWriter, r *http.Request) {
	// For HEAD requests, only write headers (no body)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusNotFound)
	if r.Method != "HEAD" {
		w.Write([]byte("not found"))
	}
}

// corsMiddleware adds permissive CORS headers for local development.
// Only active when MADOC_DEV=true.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-affine-csrf-token, x-operation-name")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
