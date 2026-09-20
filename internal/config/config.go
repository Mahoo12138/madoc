package config

import (
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	Addr        string
	DataDir     string
	DBPath      string
	AssetDir    string
	Secret      []byte
	Dev         bool
	MaxUploadMB int64
}

func Load() (Config, error) {
	dataDir := envOr("MADOC_DATA", "./data")
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return Config{}, fmt.Errorf("create data directory: %w", err)
	}
	assetDir := filepath.Join(dataDir, "assets")
	if err := os.MkdirAll(assetDir, 0o750); err != nil {
		return Config{}, fmt.Errorf("create asset directory: %w", err)
	}
	secret, err := loadSecret(filepath.Join(dataDir, "server.secret"))
	if err != nil {
		return Config{}, err
	}
	return Config{Addr: envOr("MADOC_ADDR", ":3000"), DataDir: dataDir, DBPath: envOr("MADOC_DB", filepath.Join(dataDir, "madoc.db")), AssetDir: assetDir, Secret: secret, Dev: os.Getenv("MADOC_DEV") == "true", MaxUploadMB: envInt64("MADOC_MAX_UPLOAD_MB", 20)}, nil
}

func loadSecret(path string) ([]byte, error) {
	secret, err := os.ReadFile(path)
	if err == nil {
		if len(secret) < 32 {
			return nil, fmt.Errorf("server secret is too short")
		}
		if err := os.Chmod(path, 0o600); err != nil {
			return nil, fmt.Errorf("secure server secret: %w", err)
		}
		return secret, nil
	}
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("read server secret: %w", err)
	}
	secret = make([]byte, 48)
	if _, err := rand.Read(secret); err != nil {
		return nil, fmt.Errorf("generate server secret: %w", err)
	}
	if err := os.WriteFile(path, secret, 0o600); err != nil {
		return nil, fmt.Errorf("persist server secret: %w", err)
	}
	return secret, nil
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt64(key string, fallback int64) int64 {
	var value int64
	if _, err := fmt.Sscan(os.Getenv(key), &value); err == nil && value > 0 {
		return value
	}
	return fallback
}
