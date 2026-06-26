package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"madoc/internal/auth"
	"madoc/internal/db"
	"madoc/internal/graphql"
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

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
