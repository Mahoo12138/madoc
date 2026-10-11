package site

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	// Audit paging mirrors the user list: a bounded page size and a keyset
	// cursor, never a bare offset.
	auditListDefaultLimit = 20
	auditListMaxLimit     = 100
	maxAuditTargetLength  = 200
	maxAuditCursorLength  = 32
)

// auditTargetTypeSiteSettings is the target type used by settings changes. The
// user lifecycle shares targetTypeUser so a page can list everything that
// happened to one account by id.
const auditTargetTypeSiteSettings = "site_settings"

// auditActions is the server-owned whitelist of queryable actions. It mirrors
// the write side in audit.go/users.go exactly; anything a client sends outside
// it is rejected instead of being ignored, so a typo cannot silently widen a
// page into an unfiltered one.
var auditActions = map[string]bool{
	ActionSettingsChanged:              true,
	ActionUserDisabled:                 true,
	ActionUserEnabled:                  true,
	ActionUserAdminRoleChanged:         true,
	ActionUserWorkspaceCreationChanged: true,
	ActionUserSessionsRevoked:          true,
}

// auditTargetTypes is the server-owned whitelist of queryable target types.
var auditTargetTypes = map[string]bool{
	auditTargetTypeSiteSettings: true,
	targetTypeUser:              true,
}

// AuditEvent is one management audit row. `changes` only ever carries the
// whitelisted business fields written by the audit whitelist: passwords,
// hashes, cookies, tokens and raw request bodies never reach this table, so
// this read path has nothing to redact.
type AuditEvent struct {
	ID         int64          `json:"id"`
	ActorKind  string         `json:"actorKind"`
	ActorID    *string        `json:"actorId"`
	ActorName  string         `json:"actorName"`
	Action     string         `json:"action"`
	TargetType string         `json:"targetType"`
	TargetID   *string        `json:"targetId"`
	Changes    map[string]any `json:"changes"`
	CreatedAt  string         `json:"createdAt"`
}

// AuditQuery is a validated audit list request. Every field is produced by
// ParseAuditQuery, so the query builder never interpolates client text.
type AuditQuery struct {
	Limit      int
	Before     *int64
	Action     string
	TargetType string
	TargetID   string
}

// ParseAuditQuery validates the audit list filters. Unknown filter values are
// rejected instead of ignored so a typo cannot silently widen a page, and the
// cursor must be a plain positive integer so it can never carry SQL.
func ParseAuditQuery(values url.Values) (AuditQuery, error) {
	query := AuditQuery{Limit: auditListDefaultLimit}
	switch action := strings.TrimSpace(values.Get("action")); action {
	case "":
	default:
		if !auditActions[action] {
			return AuditQuery{}, ErrInvalidChange
		}
		query.Action = action
	}
	switch targetType := strings.TrimSpace(values.Get("targetType")); targetType {
	case "":
	default:
		if !auditTargetTypes[targetType] {
			return AuditQuery{}, ErrInvalidChange
		}
		query.TargetType = targetType
	}
	query.TargetID = strings.TrimSpace(values.Get("targetId"))
	if len(query.TargetID) > maxAuditTargetLength {
		return AuditQuery{}, ErrInvalidChange
	}
	if raw := strings.TrimSpace(values.Get("limit")); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > auditListMaxLimit {
			return AuditQuery{}, ErrInvalidChange
		}
		query.Limit = limit
	}
	if raw := strings.TrimSpace(values.Get("before")); raw != "" {
		if len(raw) > maxAuditCursorLength {
			return AuditQuery{}, ErrInvalidChange
		}
		before, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || before < 1 {
			return AuditQuery{}, ErrInvalidChange
		}
		query.Before = &before
	}
	return query, nil
}

// ListAuditEvents reads one page of management audit rows, newest first.
//
// It deliberately does not read site_settings. Reading the audit trail must
// keep working when an unrelated configuration document is unreadable, exactly
// like user management: the emergency path an administrator needs (see who
// disabled an account) cannot be tied to a document that may be corrupt.
func (s *Store) ListAuditEvents(ctx context.Context, query AuditQuery) ([]AuditEvent, *int64, error) {
	return listAuditEvents(ctx, s.db, query)
}

const selectAuditEventSQL = `SELECT e.id,
 e.actor_kind,
 e.actor_user_id,
 COALESCE(u.name,''),
 e.action,
 e.target_type,
 e.target_id,
 e.changes_json,
 e.created_at
 FROM admin_audit_events e
 LEFT JOIN users u ON u.id=e.actor_user_id`

func listAuditEvents(ctx context.Context, q DBTX, query AuditQuery) ([]AuditEvent, *int64, error) {
	conditions := []string{"1=1"}
	args := []any{}
	if query.Action != "" {
		conditions = append(conditions, `e.action=?`)
		args = append(args, query.Action)
	}
	if query.TargetType != "" {
		conditions = append(conditions, `e.target_type=?`)
		args = append(args, query.TargetType)
	}
	if query.TargetID != "" {
		conditions = append(conditions, `e.target_id=?`)
		args = append(args, query.TargetID)
	}
	if query.Before != nil {
		// `id` is an autoincrement primary key, so it is monotonic with
		// creation time: `id < before` is a stable keyset cursor that cannot
		// skip or repeat a row the way a bare offset would.
		conditions = append(conditions, `e.id < ?`)
		args = append(args, *query.Before)
	}
	args = append(args, query.Limit+1)
	rows, err := q.QueryContext(ctx, selectAuditEventSQL+`
WHERE `+strings.Join(conditions, " AND ")+`
ORDER BY e.id DESC
LIMIT ?`, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	events := make([]AuditEvent, 0, query.Limit+1)
	for rows.Next() {
		var event AuditEvent
		var actorID, targetID sql.NullString
		var createdAt time.Time
		var changes string
		if err := rows.Scan(&event.ID, &event.ActorKind, &actorID, &event.ActorName, &event.Action, &event.TargetType, &targetID, &changes, &createdAt); err != nil {
			return nil, nil, err
		}
		if actorID.Valid {
			value := actorID.String
			event.ActorID = &value
		}
		if targetID.Valid {
			value := targetID.String
			event.TargetID = &value
		}
		event.Changes = decodeAuditChanges(event.ID, changes)
		event.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	if len(events) <= query.Limit {
		return events, nil, nil
	}
	events = events[:query.Limit]
	// The cursor is the smallest id on this page, which is exactly the row the
	// next page must continue before.
	next := events[len(events)-1].ID
	return events, &next, nil
}

// decodeAuditChanges parses the stored change document. A row that cannot be
// parsed degrades to an empty object instead of failing the whole read: this is
// a read-only page, and one damaged row must not make the trail unopenable. The
// failure is logged so it stays diagnosable.
func decodeAuditChanges(id int64, raw string) map[string]any {
	if strings.TrimSpace(raw) == "" {
		return map[string]any{}
	}
	changes := map[string]any{}
	if err := json.Unmarshal([]byte(raw), &changes); err != nil {
		log.Printf("admin audit: event %d has unreadable changes_json: %v", id, err)
		return map[string]any{}
	}
	if changes == nil {
		// A literal `null` document unmarshals without error but leaves a nil
		// map, which would serialise as `null` instead of an object.
		return map[string]any{}
	}
	return changes
}
