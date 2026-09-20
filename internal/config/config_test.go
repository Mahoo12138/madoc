package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadSecretPersistsWithPrivatePermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "server.secret")
	first, err := loadSecret(path)
	if err != nil {
		t.Fatal(err)
	}
	second, err := loadSecret(path)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) || info.Mode().Perm() != 0o600 {
		t.Fatalf("secret changed or permissions are not private: mode=%o", info.Mode().Perm())
	}
}

func TestLoadSecretRejectsCorruption(t *testing.T) {
	path := filepath.Join(t.TempDir(), "server.secret")
	if err := os.WriteFile(path, []byte("short"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadSecret(path); err == nil {
		t.Fatal("expected a short secret to be rejected")
	}
}
