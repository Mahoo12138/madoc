package site

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"
)

const schemaVersion = 1

// DBTX is the only SQL channel used by site settings and accepts both databases and transactions.
type DBTX interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// Store persists validated site settings.
type Store struct {
	db *sql.DB
}

// Settings is the public response representation of the site settings document.
type Settings struct {
	SchemaVersion                         int             `json:"schemaVersion"`
	Revision                              int             `json:"revision"`
	RegistrationMode                      string          `json:"registrationMode"`
	AllowWorkspaceOwnerInviteNewUsers     bool            `json:"allowWorkspaceOwnerInviteNewUsers"`
	InviteDefaultCanCreateWorkspace       bool            `json:"inviteDefaultCanCreateWorkspace"`
	PublicSignupDefaultCanCreateWorkspace bool            `json:"publicSignupDefaultCanCreateWorkspace"`
	Implemented                           map[string]bool `json:"implemented"`
	UpgradedInstance                      bool            `json:"upgradedInstance"`
	UpdatedAt                             string          `json:"updatedAt"`
}

type document struct {
	SchemaVersion                         int
	Revision                              int
	RegistrationMode                      string
	AllowWorkspaceOwnerInviteNewUsers     bool
	InviteDefaultCanCreateWorkspace       bool
	PublicSignupDefaultCanCreateWorkspace bool
	Origin                                string
}

type normalizedChanges struct {
	registrationMode                      *string
	allowWorkspaceOwnerInviteNewUsers     *bool
	inviteDefaultCanCreateWorkspace       *bool
	publicSignupDefaultCanCreateWorkspace *bool
}

// New constructs a site settings store.
func New(db *sql.DB) *Store {
	return &Store{db: db}
}

// Load reads and validates settings using q. It never falls back to Store.db.
func (s *Store) Load(ctx context.Context, q DBTX) (Settings, error) {
	var raw string
	var updatedAt time.Time
	if err := q.QueryRowContext(ctx, `SELECT value,updated_at FROM server_config WHERE key='site_settings'`).Scan(&raw, &updatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			err = fmt.Errorf("%w: site_settings row is missing", ErrCorrupt)
		}
		if errors.Is(err, ErrCorrupt) {
			log.Printf("invalid site settings: %v", err)
		}
		return Settings{}, err
	}
	doc, err := decodeDocument([]byte(raw))
	if err != nil {
		log.Printf("invalid site settings: %v", err)
		return Settings{}, err
	}
	return doc.settings(updatedAt), nil
}

// Ensure returns settings and persists a default document when the row is absent.
func (s *Store) Ensure(ctx context.Context) (Settings, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback()

	settings, err := s.Load(ctx, tx)
	if err == nil {
		if err := tx.Commit(); err != nil {
			return Settings{}, err
		}
		return settings, nil
	}
	if !errors.Is(err, ErrCorrupt) || !isMissingSettings(ctx, tx) {
		return Settings{}, err
	}

	doc, err := defaultDocument(ctx, tx)
	if err != nil {
		return Settings{}, err
	}
	now := time.Now().UTC()
	body, err := json.Marshal(doc.storageValue())
	if err != nil {
		return Settings{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO server_config(key,value,updated_at) VALUES('site_settings',?,?)`, string(body), now); err != nil {
		return Settings{}, err
	}
	if err := tx.Commit(); err != nil {
		return Settings{}, err
	}
	return doc.settings(now), nil
}

// Update validates, authorizes, persists, and audits an optimistic settings change.
func (s *Store) Update(ctx context.Context, actor Actor, expectedRevision int, changes map[string]json.RawMessage) (Settings, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback()

	current, err := s.loadDocument(ctx, tx)
	if err != nil {
		return Settings{}, err
	}
	normalized, err := normalizeChanges(changes)
	if err != nil {
		return Settings{}, err
	}
	updated, changed, auditChanges := current.apply(normalized)
	if updated.RegistrationMode == "open" {
		return Settings{}, ErrRegistrationNotReady
	}
	if expectedRevision != current.Revision {
		return Settings{}, ErrRevisionConflict
	}
	persistedActor, err := s.ActorFrom(ctx, tx, actor.ID)
	if err != nil {
		return Settings{}, err
	}
	if !CanManageSite(persistedActor) {
		return Settings{}, ErrAdminRequired
	}
	if !changed {
		settings, err := s.Load(ctx, tx)
		if err != nil {
			return Settings{}, err
		}
		return settings, nil
	}

	updated.Revision++
	now := time.Now().UTC()
	body, err := json.Marshal(updated.storageValue())
	if err != nil {
		return Settings{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE server_config SET value=?,updated_at=? WHERE key='site_settings'`, string(body), now); err != nil {
		return Settings{}, err
	}
	if err := record(ctx, tx, persistedActor, auditChanges); err != nil {
		return Settings{}, err
	}
	if err := tx.Commit(); err != nil {
		return Settings{}, err
	}
	return updated.settings(now), nil
}

func (s *Store) loadDocument(ctx context.Context, q DBTX) (document, error) {
	var raw string
	if err := q.QueryRowContext(ctx, `SELECT value FROM server_config WHERE key='site_settings'`).Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			err = fmt.Errorf("%w: site_settings row is missing", ErrCorrupt)
		}
		if errors.Is(err, ErrCorrupt) {
			log.Printf("invalid site settings: %v", err)
		}
		return document{}, err
	}
	doc, err := decodeDocument([]byte(raw))
	if err != nil {
		log.Printf("invalid site settings: %v", err)
	}
	return doc, err
}

func decodeDocument(body []byte) (document, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return document{}, corrupt("invalid JSON: %v", err)
	}
	required := []string{
		"schemaVersion",
		"revision",
		KeyRegistrationMode,
		KeyAllowWorkspaceOwnerInviteNewUsers,
		KeyInviteDefaultCanCreateWorkspace,
		KeyPublicSignupDefaultCanCreateWorkspace,
	}
	for _, key := range required {
		if _, ok := fields[key]; !ok {
			return document{}, corrupt("missing %s", key)
		}
	}
	var doc document
	var err error
	if doc.SchemaVersion, err = strictInt(fields["schemaVersion"]); err != nil || doc.SchemaVersion != schemaVersion {
		return document{}, corrupt("invalid schemaVersion")
	}
	if doc.Revision, err = strictInt(fields["revision"]); err != nil || doc.Revision < 0 {
		return document{}, corrupt("invalid revision")
	}
	if err := json.Unmarshal(fields[KeyRegistrationMode], &doc.RegistrationMode); err != nil || !validRegistrationMode(doc.RegistrationMode) {
		return document{}, corrupt("invalid registrationMode")
	}
	if doc.RegistrationMode == "open" {
		// No write path can store "open" because the request side is always
		// rejected with 422, so reading it means the document was edited from
		// outside this service. Treating it as corruption here keeps the read and
		// write sides on one verdict instead of letting a page render a value no
		// change can ever act on.
		return document{}, corrupt("stored registrationMode is open")
	}
	if doc.AllowWorkspaceOwnerInviteNewUsers, err = strictBool(fields[KeyAllowWorkspaceOwnerInviteNewUsers]); err != nil {
		return document{}, corrupt("invalid %s", KeyAllowWorkspaceOwnerInviteNewUsers)
	}
	if doc.InviteDefaultCanCreateWorkspace, err = strictBool(fields[KeyInviteDefaultCanCreateWorkspace]); err != nil {
		return document{}, corrupt("invalid %s", KeyInviteDefaultCanCreateWorkspace)
	}
	if doc.PublicSignupDefaultCanCreateWorkspace, err = strictBool(fields[KeyPublicSignupDefaultCanCreateWorkspace]); err != nil {
		return document{}, corrupt("invalid %s", KeyPublicSignupDefaultCanCreateWorkspace)
	}
	if rawOrigin, ok := fields["origin"]; ok {
		if bytes.Equal(bytes.TrimSpace(rawOrigin), []byte("null")) {
			return document{}, corrupt("invalid origin")
		}
		if err := json.Unmarshal(rawOrigin, &doc.Origin); err != nil {
			return document{}, corrupt("invalid origin")
		}
	}
	if doc.Origin != "" && doc.Origin != "new" && doc.Origin != "upgrade" {
		return document{}, corrupt("invalid origin")
	}
	return doc, nil
}

func normalizeChanges(changes map[string]json.RawMessage) (normalizedChanges, error) {
	if len(changes) == 0 {
		return normalizedChanges{}, ErrInvalidChange
	}
	var result normalizedChanges
	for key, raw := range changes {
		switch key {
		case KeyRegistrationMode:
			var value string
			if err := json.Unmarshal(raw, &value); err != nil || !validRegistrationMode(value) {
				return normalizedChanges{}, ErrInvalidChange
			}
			result.registrationMode = &value
		case KeyAllowWorkspaceOwnerInviteNewUsers:
			value, err := strictBool(raw)
			if err != nil {
				return normalizedChanges{}, ErrInvalidChange
			}
			result.allowWorkspaceOwnerInviteNewUsers = &value
		case KeyInviteDefaultCanCreateWorkspace:
			value, err := strictBool(raw)
			if err != nil {
				return normalizedChanges{}, ErrInvalidChange
			}
			result.inviteDefaultCanCreateWorkspace = &value
		case KeyPublicSignupDefaultCanCreateWorkspace:
			value, err := strictBool(raw)
			if err != nil {
				return normalizedChanges{}, ErrInvalidChange
			}
			result.publicSignupDefaultCanCreateWorkspace = &value
		default:
			return normalizedChanges{}, ErrInvalidChange
		}
	}
	return result, nil
}

func (doc document) apply(changes normalizedChanges) (document, bool, map[string]any) {
	updated := doc
	auditChanges := make(map[string]any)
	if changes.registrationMode != nil && *changes.registrationMode != doc.RegistrationMode {
		updated.RegistrationMode = *changes.registrationMode
		auditChanges[KeyRegistrationMode] = auditValueChange{From: doc.RegistrationMode, To: *changes.registrationMode}
	}
	if changes.allowWorkspaceOwnerInviteNewUsers != nil && *changes.allowWorkspaceOwnerInviteNewUsers != doc.AllowWorkspaceOwnerInviteNewUsers {
		updated.AllowWorkspaceOwnerInviteNewUsers = *changes.allowWorkspaceOwnerInviteNewUsers
		auditChanges[KeyAllowWorkspaceOwnerInviteNewUsers] = auditValueChange{From: doc.AllowWorkspaceOwnerInviteNewUsers, To: *changes.allowWorkspaceOwnerInviteNewUsers}
	}
	if changes.inviteDefaultCanCreateWorkspace != nil && *changes.inviteDefaultCanCreateWorkspace != doc.InviteDefaultCanCreateWorkspace {
		updated.InviteDefaultCanCreateWorkspace = *changes.inviteDefaultCanCreateWorkspace
		auditChanges[KeyInviteDefaultCanCreateWorkspace] = auditValueChange{From: doc.InviteDefaultCanCreateWorkspace, To: *changes.inviteDefaultCanCreateWorkspace}
	}
	if changes.publicSignupDefaultCanCreateWorkspace != nil && *changes.publicSignupDefaultCanCreateWorkspace != doc.PublicSignupDefaultCanCreateWorkspace {
		updated.PublicSignupDefaultCanCreateWorkspace = *changes.publicSignupDefaultCanCreateWorkspace
		auditChanges[KeyPublicSignupDefaultCanCreateWorkspace] = auditValueChange{From: doc.PublicSignupDefaultCanCreateWorkspace, To: *changes.publicSignupDefaultCanCreateWorkspace}
	}
	return updated, len(auditChanges) > 0, auditChanges
}

func (doc document) storageValue() map[string]any {
	return map[string]any{
		"schemaVersion":                          doc.SchemaVersion,
		"revision":                               doc.Revision,
		KeyRegistrationMode:                      doc.RegistrationMode,
		KeyAllowWorkspaceOwnerInviteNewUsers:     doc.AllowWorkspaceOwnerInviteNewUsers,
		KeyInviteDefaultCanCreateWorkspace:       doc.InviteDefaultCanCreateWorkspace,
		KeyPublicSignupDefaultCanCreateWorkspace: doc.PublicSignupDefaultCanCreateWorkspace,
		"origin":                                 doc.Origin,
	}
}

func (doc document) settings(updatedAt time.Time) Settings {
	return Settings{
		SchemaVersion:                         doc.SchemaVersion,
		Revision:                              doc.Revision,
		RegistrationMode:                      doc.RegistrationMode,
		AllowWorkspaceOwnerInviteNewUsers:     doc.AllowWorkspaceOwnerInviteNewUsers,
		InviteDefaultCanCreateWorkspace:       doc.InviteDefaultCanCreateWorkspace,
		PublicSignupDefaultCanCreateWorkspace: doc.PublicSignupDefaultCanCreateWorkspace,
		Implemented:                           implementedSettings(),
		UpgradedInstance:                      doc.Origin == "upgrade",
		UpdatedAt:                             updatedAt.UTC().Format(time.RFC3339),
	}
}

func defaultDocument(ctx context.Context, q DBTX) (document, error) {
	var upgraded bool
	if err := q.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE signup_source='legacy')`).Scan(&upgraded); err != nil {
		return document{}, err
	}
	doc := document{
		SchemaVersion:                         schemaVersion,
		Revision:                              0,
		RegistrationMode:                      "invite_only",
		AllowWorkspaceOwnerInviteNewUsers:     false,
		InviteDefaultCanCreateWorkspace:       false,
		PublicSignupDefaultCanCreateWorkspace: false,
		Origin:                                "new",
	}
	if upgraded {
		doc.AllowWorkspaceOwnerInviteNewUsers = true
		doc.InviteDefaultCanCreateWorkspace = true
		doc.Origin = "upgrade"
	}
	return doc, nil
}

func strictInt(raw json.RawMessage) (int, error) {
	trimmed := bytes.TrimSpace(raw)
	if bytes.Equal(trimmed, []byte("null")) {
		return 0, ErrInvalidChange
	}
	var value int
	if err := json.Unmarshal(trimmed, &value); err != nil {
		return 0, err
	}
	return value, nil
}

func strictBool(raw json.RawMessage) (bool, error) {
	trimmed := bytes.TrimSpace(raw)
	if bytes.Equal(trimmed, []byte("null")) {
		return false, ErrInvalidChange
	}
	var value bool
	if err := json.Unmarshal(trimmed, &value); err != nil {
		return false, err
	}
	return value, nil
}

func validRegistrationMode(value string) bool {
	return value == "closed" || value == "invite_only" || value == "open"
}

func corrupt(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrCorrupt, fmt.Sprintf(format, args...))
}

func isMissingSettings(ctx context.Context, q DBTX) bool {
	var exists bool
	if err := q.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM server_config WHERE key='site_settings')`).Scan(&exists); err != nil {
		return false
	}
	return !exists
}
