package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"madoc/internal/account"
	"madoc/internal/api"
	"madoc/internal/asset"
	"madoc/internal/auth"
	"madoc/internal/config"
	"madoc/internal/core"
	"madoc/internal/db"
	"madoc/internal/maintenance"
	"madoc/internal/realtime"
)

//go:embed all:web/dist
var frontendFS embed.FS

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	if len(os.Args) > 2 && os.Args[1] == "maintenance" && os.Args[2] == "backup" {
		backup, err := maintenance.Backup(cfg.DataDir, cfg.DBPath)
		if err != nil {
			log.Fatal(err)
		}
		log.Printf("backup verified at %s", backup)
		return
	}
	if len(os.Args) > 3 && os.Args[1] == "maintenance" && os.Args[2] == "restore" {
		confirmed := false
		for _, arg := range os.Args[4:] {
			if arg == "--confirm" {
				confirmed = true
			}
		}
		recovery, err := maintenance.Restore(cfg.DataDir, cfg.DBPath, os.Args[3], confirmed)
		if err != nil {
			log.Fatal(err)
		}
		log.Printf("restore verified; previous data preserved at %s", recovery)
		return
	}
	if len(os.Args) > 2 && os.Args[1] == "maintenance" && os.Args[2] == "legacy-clean" {
		confirmed := false
		for _, arg := range os.Args[3:] {
			if arg == "--confirm" {
				confirmed = true
			}
		}
		if !confirmed {
			log.Fatal("legacy-clean requires --confirm")
		}
		fullBackup, err := maintenance.Backup(cfg.DataDir, cfg.DBPath)
		if err != nil {
			log.Fatalf("back up legacy data: %v", err)
		}
		backup, err := maintenance.CleanLegacy(cfg.DBPath, filepath.Join(cfg.DataDir, "backups"), confirmed)
		if err != nil {
			log.Fatal(err)
		}
		log.Printf("full backup verified at %s; legacy database preserved at %s", fullBackup, backup)
		return
	}
	conn, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer conn.Close()
	authService := auth.New(conn)
	domain := core.New(conn)
	assetService := asset.New(conn, domain, cfg.AssetDir, cfg.MaxUploadMB)
	if err := assetService.RecoverImports(context.Background()); err != nil {
		log.Fatalf("recover incomplete content imports: %v", err)
	}
	hub := realtime.New(authService, domain, cfg.Dev)
	apiHandler := api.New(authService, auth.NewCSRF(cfg.Secret), domain, assetService, account.New(conn, cfg.AssetDir), hub, !cfg.Dev)

	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer, securityHeaders)
	if cfg.Dev {
		r.Use(devCORS)
	}
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	r.Mount("/api", apiHandler.Routes())
	r.Get("/ws", hub.ServeHTTP)
	static, err := fs.Sub(frontendFS, "web/dist")
	if err != nil {
		log.Fatal(err)
	}
	fileServer := http.FileServer(http.FS(static))
	r.Get("/*", spaHandler(static, fileServer))
	r.Head("/*", spaHandler(static, fileServer))

	server := &http.Server{Addr: cfg.Addr, Handler: r, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = hub.Close(ctx)
		_ = server.Shutdown(ctx)
	}()
	log.Printf("madoc listening on %s (data: %s)", cfg.Addr, cfg.DataDir)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	if _, err := conn.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		log.Printf("checkpoint database during shutdown: %v", err)
	}
}

func spaHandler(static fs.FS, fileServer http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/s/") {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Referrer-Policy", "no-referrer")
			w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'")
		}
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(static, path); err != nil {
			index, readErr := fs.ReadFile(static, "index.html")
			if readErr != nil {
				http.Error(w, "frontend unavailable", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(index)
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

func devCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:")) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, x-madoc-csrf-token")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
