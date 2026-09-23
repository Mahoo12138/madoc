package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"madoc/internal/core"
)

func shareTokenHash(token string) (string, bool) {
	if len(token) != 64 {
		return "", false
	}
	bytes, err := hex.DecodeString(token)
	if err != nil || len(bytes) != 32 {
		return "", false
	}
	hash := sha256.Sum256(bytes)
	return hex.EncodeToString(hash[:]), true
}

func (a *API) listItemShares(w http.ResponseWriter, r *http.Request) {
	shares, err := a.core.ListItemShares(r.Context(), userID(r), chi.URLParam(r, "itemId"))
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"shares": shares})
}

func (a *API) createItemShare(w http.ResponseWriter, r *http.Request) {
	var body struct {
		VersionID string `json:"versionId"`
		ExpiresAt string `json:"expiresAt"`
	}
	if decode(r, &body) != nil || strings.TrimSpace(body.VersionID) == "" {
		domainError(w, core.ErrInvalid)
		return
	}
	var expiresAt *time.Time
	if body.ExpiresAt != "" {
		parsed, err := time.Parse(time.RFC3339, body.ExpiresAt)
		if err != nil {
			domainError(w, core.ErrInvalid)
			return
		}
		parsed = parsed.UTC()
		expiresAt = &parsed
	}
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		domainError(w, err)
		return
	}
	token := hex.EncodeToString(tokenBytes)
	hash := sha256.Sum256(tokenBytes)
	share, err := a.core.CreateItemShare(r.Context(), userID(r), chi.URLParam(r, "itemId"), body.VersionID, hex.EncodeToString(hash[:]), expiresAt)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"share": share, "token": token, "url": "/s/" + token})
}

func (a *API) publishItemShare(w http.ResponseWriter, r *http.Request) {
	var body struct {
		VersionID string `json:"versionId"`
	}
	if decode(r, &body) != nil || strings.TrimSpace(body.VersionID) == "" {
		domainError(w, core.ErrInvalid)
		return
	}
	if err := a.core.PublishItemShare(r.Context(), userID(r), chi.URLParam(r, "itemId"), chi.URLParam(r, "shareId"), body.VersionID); err != nil {
		domainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) revokeItemShare(w http.ResponseWriter, r *http.Request) {
	if err := a.core.RevokeItemShare(r.Context(), userID(r), chi.URLParam(r, "itemId"), chi.URLParam(r, "shareId")); err != nil {
		domainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) getPublicShare(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive")
	hash, ok := shareTokenHash(chi.URLParam(r, "token"))
	if !ok {
		domainError(w, core.ErrNotFound)
		return
	}
	shared, err := a.core.GetSharedItem(r.Context(), hash)
	if err != nil {
		domainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, shared)
}

func (a *API) getPublicShareAsset(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive")
	hash, ok := shareTokenHash(chi.URLParam(r, "token"))
	if !ok {
		domainError(w, core.ErrNotFound)
		return
	}
	asset, file, err := a.assets.OpenShared(r.Context(), hash, chi.URLParam(r, "assetId"))
	if err != nil {
		domainError(w, err)
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", asset.MIME)
	w.Header().Set("Content-Length", fmt.Sprint(asset.Size))
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename=%q`, asset.FileName))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	_, _ = file.WriteTo(w)
}
