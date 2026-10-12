package config

import (
	"crypto/rand"
	"fmt"
	"log"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Addr        string
	DataDir     string
	DBPath      string
	AssetDir    string
	Secret      []byte
	Dev         bool
	MaxUploadMB int64
	SMTP        SMTP
	// PublicURL is the address the deployment publishes, validated once at
	// startup. It is the only source verification links are built from.
	PublicURL *url.URL
}

// TLS modes for the SMTP connection. `starttls` upgrades a plaintext
// connection, `implicit` wraps the socket before the greeting, and `none`
// sends the session in the clear (development relays only).
const (
	TLSNone     = "none"
	TLSStartTLS = "starttls"
	TLSImplicit = "implicit"
)

// SMTP holds the optional outbound mail configuration (§11.1). It is not a
// startup requirement: an instance without it runs normally and simply cannot
// offer public registration, which needs a real verification email.
type SMTP struct {
	Host     string
	Port     int
	Username string
	// Password stays in this struct for the lifetime of the process and is
	// never persisted, logged, or included in any API response.
	Password string
	From     string
	TLS      string
}

// Addr is the host:port the SMTP client dials.
func (s SMTP) Addr() string { return net.JoinHostPort(s.Host, strconv.Itoa(s.Port)) }

// AuthConfigured reports whether credentials were supplied. Some relays accept
// unauthenticated submission from a trusted network, so the pair is optional.
func (s SMTP) AuthConfigured() bool { return s.Username != "" }

// MailDiagnosis is the redacted view of the mail configuration handed to the
// management API. It deliberately has no password field: the deployer's secret
// must not be readable back through any endpoint (§11.1).
type MailDiagnosis struct {
	Configured     bool   `json:"configured"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	From           string `json:"from"`
	TLS            string `json:"tls"`
	AuthConfigured bool   `json:"authConfigured"`
	PublicURL      string `json:"publicUrl"`
}

// MailDiagnosis redacts the SMTP settings. The username is not echoed either:
// whether credentials exist is the only fact a management page needs.
func (c Config) MailDiagnosis() MailDiagnosis {
	diagnosis := MailDiagnosis{
		Configured:     c.SMTP.Ready(),
		Host:           c.SMTP.Host,
		Port:           c.SMTP.Port,
		From:           c.SMTP.From,
		TLS:            c.SMTP.TLS,
		AuthConfigured: c.SMTP.AuthConfigured(),
	}
	if c.PublicURL != nil {
		diagnosis.PublicURL = c.PublicURL.String()
	}
	return diagnosis
}

// PublicRegistrationReady reports whether public registration can actually run.
// It is deliberately stricter than "SMTP fields are non-empty": the deployment
// must also have published the address that verification links point at, and
// that address is the one thing an attacker would want to control (§11.5).
func (c Config) PublicRegistrationReady() bool {
	return c.SMTP.Ready() && c.PublicURL != nil
}

// Ready reports whether the mail transport is completely configured.
func (s SMTP) Ready() bool { return s.Host != "" && s.From != "" }

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
	smtp := SMTP{
		Host:     strings.TrimSpace(os.Getenv("MADOC_SMTP_HOST")),
		Port:     envInt("MADOC_SMTP_PORT", 587),
		Username: os.Getenv("MADOC_SMTP_USERNAME"),
		Password: os.Getenv("MADOC_SMTP_PASSWORD"),
		From:     strings.TrimSpace(os.Getenv("MADOC_SMTP_FROM")),
		TLS:      envOr("MADOC_SMTP_TLS", TLSStartTLS),
	}
	if !validTLSMode(smtp.TLS) {
		return Config{}, fmt.Errorf("MADOC_SMTP_TLS must be none, starttls or implicit, got %q", smtp.TLS)
	}
	publicURL := parsePublicURL(os.Getenv("MADOC_PUBLIC_URL"))
	return Config{
		Addr:        envOr("MADOC_ADDR", ":3000"),
		DataDir:     dataDir,
		DBPath:      envOr("MADOC_DB", filepath.Join(dataDir, "madoc.db")),
		AssetDir:    assetDir,
		Secret:      secret,
		Dev:         os.Getenv("MADOC_DEV") == "true",
		MaxUploadMB: envInt64("MADOC_MAX_UPLOAD_MB", 20),
		SMTP:        smtp,
		PublicURL:   publicURL,
	}, nil
}

func validTLSMode(mode string) bool {
	return mode == TLSNone || mode == TLSStartTLS || mode == TLSImplicit
}

// parsePublicURL accepts only an absolute https address, or plain http on
// loopback so a developer can run the whole signup flow locally.
//
// A verification link is a credential: whoever controls the host part controls
// where a person types their password. Deriving it from a Host header or an
// X-Forwarded-* value would let any visitor redirect that credential to a
// domain they own, so the address has to be configured by the deployer and
// validated here.
//
// An unusable value is treated as "not configured" rather than as a startup
// failure: the instance keeps running and simply cannot offer public
// registration, which is the same state an operator sees when SMTP is absent.
// Failing to boot would turn a typo in one variable into a site-wide outage.
func parsePublicURL(raw string) *url.URL {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil {
		log.Printf("madoc: MADOC_PUBLIC_URL %q is not an absolute URL without credentials; public registration stays unavailable", raw)
		return nil
	}
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && isLoopbackHost(parsed.Host)) {
		log.Printf("madoc: MADOC_PUBLIC_URL must use https (http only on loopback); public registration stays unavailable")
		return nil
	}
	// A path would silently produce links like https://host/sub/sign-up/x; the
	// site is served from the root, so keep the origin only.
	parsed.Path = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed
}

func isLoopbackHost(host string) bool {
	name := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		name = h
	}
	if strings.EqualFold(name, "localhost") {
		return true
	}
	if ip := net.ParseIP(name); ip != nil {
		return ip.IsLoopback()
	}
	return false
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

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(key))
	if err != nil || value <= 0 || value > 65535 {
		return fallback
	}
	return value
}

func envInt64(key string, fallback int64) int64 {
	var value int64
	if _, err := fmt.Sscan(os.Getenv(key), &value); err == nil && value > 0 {
		return value
	}
	return fallback
}
