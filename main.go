package main

import (
	"embed"
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

//go:embed all:frontend/dist
var frontendFS embed.FS

func main() {
	dbPath := envOr("MADOC_DB", "madoc.db")
	addr := envOr("MADOC_ADDR", ":3000")

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
	syncSrv := sync.NewServer(repo)

	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/info", infoHandler)
	r.Post("/api/setup/create-admin-user", setupH.ServeHTTP)
	r.Post("/api/auth/preflight", authH.Preflight)
	r.Post("/api/auth/sign-in", authH.SignIn)
	r.Post("/api/auth/sign-out", authH.SignOut)
	r.Get("/api/auth/session", authH.Session)
	r.With(sm.OptionalAuth).Post("/graphql", gqlH.ServeHTTP)

	r.Mount("/socket.io", syncSrv.Router())

	r.Get("/api/workspaces/{workspaceId}/blobs/{key}", blobDownloadHandler(repo))
	r.With(sm.OptionalAuth).Post("/api/workspaces/{workspaceId}/blobs/{key}", blobUploadHandler(repo))

	static, err := fs.Sub(frontendFS, "frontend/dist")
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

func infoHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"version":"0.26.2","type":"selfhosted","flavor":"allinone"}`))
}

func spaHandler(static fs.FS, fileServer http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			fileServer.ServeHTTP(w, r)
			return
		}
		if _, err := fs.Stat(static, p); err != nil {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
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
