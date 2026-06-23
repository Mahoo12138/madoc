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

	"madoc/internal/api"
	"madoc/internal/db"
	"madoc/internal/ws"
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
	hub := ws.NewHub(repo)

	docs := &api.DocsHandler{Repo: repo}
	wsh := &api.WSHandler{Hub: hub}

	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Route("/api", func(r chi.Router) {
		r.Get("/docs", docs.List)
		r.Post("/docs", docs.Create)
		r.Get("/docs/{id}", docs.Get)
		r.Post("/docs/{id}/text", docs.UpsertText)
		r.Get("/search", docs.Search)
	})
	r.Get("/ws/{id}", wsh.Handle)

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
