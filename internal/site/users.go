package site

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Administrator-managed user fields. These names are the API contract: the
// management PATCH accepts exactly these keys and nothing else.
const (
	KeyUserIsAdmin            = "isAdmin"
	KeyUserDisabled           = "disabled"
	KeyUserCanCreateWorkspace = "canCreateWorkspace"
	KeySessionsRevoked        = "sessionsRevoked"
)

// Management audit actions for the user lifecycle. The server owns this
// whitelist; clients cannot choose an action.
const (
	ActionUserDisabled                 = "user.disabled"
	ActionUserEnabled                  = "user.enabled"
	ActionUserAdminRoleChanged         = "user.admin_role_changed"
	ActionUserWorkspaceCreationChanged = "user.workspace_creation_changed"
	ActionUserSessionsRevoked          = "user.sessions_revoked"
)

const (
	userListDefaultLimit = 20
	userListMaxLimit     = 100
	maxUserSearchLength  = 200
	maxCursorLength      = 256
)

// AdminUser is the management representation of an account. It carries the raw
// administrator-maintained grants plus the effective capability so the page can
// show why an administrator may still create workspaces.
type AdminUser struct {
	ID                          string  `json:"id"`
	AvatarURL                   *string `json:"avatarUrl"`
	Name                        string  `json:"name"`
	Email                       string  `json:"email"`
	IsAdmin                     bool    `json:"isAdmin"`
	Disabled                    bool    `json:"disabled"`
	CanCreateWorkspace          bool    `json:"canCreateWorkspace"`
	EffectiveCanCreateWorkspace bool    `json:"effectiveCanCreateWorkspace"`
	SignupSource                string  `json:"signupSource"`
	CreatedAt                   string  `json:"createdAt"`
	Revision                    int     `json:"revision"`
}

// AdminUserStats reports account risk without exposing private content. Titles,
// documents and member names stay out of it: an administrator must not be able
// to read someone's workspace through the user drawer.
type AdminUserStats struct {
	MemberWorkspaces int  `json:"memberWorkspaces"`
	OwnedWorkspaces  int  `json:"ownedWorkspaces"`
	SoleOwnerRisk    bool `json:"soleOwnerRisk"`
}

// AdminUserDetail is the user drawer payload: management fields plus stats.
type AdminUserDetail struct {
	AdminUser
	Stats AdminUserStats `json:"stats"`
}

// UserListQuery is a validated list request. Every field is produced by
// ParseUserListQuery, so the query builder never interpolates client text.
type UserListQuery struct {
	Q      string
	Status string
	Role   string
	Limit  int
	Cursor string
}

// UserListResult is one page of users ordered by created_at DESC, id DESC.
type UserListResult struct {
	Users      []AdminUser `json:"users"`
	NextCursor *string     `json:"nextCursor"`
}

// UpdateUserResult reports a committed management change. RevokeSessions tells
// the caller to drop the account's realtime connections after commit; the
// database state is already durable when it is true.
type UpdateUserResult struct {
	User            AdminUser
	RevokeSessions  bool
	RevokedSessions int
}

// ParseUserListQuery validates the user list filters. Unknown filter values are
// rejected instead of being ignored so a typo cannot silently widen a page.
func ParseUserListQuery(values url.Values) (UserListQuery, error) {
	query := UserListQuery{Limit: userListDefaultLimit}
	query.Q = strings.TrimSpace(values.Get("q"))
	if len(query.Q) > maxUserSearchLength {
		return UserListQuery{}, ErrInvalidChange
	}
	switch status := values.Get("status"); status {
	case "":
	case "enabled", "disabled":
		query.Status = status
	default:
		return UserListQuery{}, ErrInvalidChange
	}
	switch role := values.Get("role"); role {
	case "":
	case "admin", "user":
		query.Role = role
	default:
		return UserListQuery{}, ErrInvalidChange
	}
	if raw := values.Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > userListMaxLimit {
			return UserListQuery{}, ErrInvalidChange
		}
		query.Limit = limit
	}
	query.Cursor = strings.TrimSpace(values.Get("cursor"))
	if len(query.Cursor) > maxCursorLength {
		return UserListQuery{}, ErrInvalidChange
	}
	return query, nil
}

// ListUsers reads one page of accounts through the store's connection.
func (s *Store) ListUsers(ctx context.Context, query UserListQuery) (UserListResult, error) {
	return listUsers(ctx, s.db, query)
}

// AdminUser reads one account and its risk stats.
func (s *Store) AdminUser(ctx context.Context, userID string) (AdminUserDetail, error) {
	return loadAdminUser(ctx, s.db, userID)
}

func loadAdminUser(ctx context.Context, q DBTX, userID string) (AdminUserDetail, error) {
	user, err := scanAdminUser(q.QueryRowContext(ctx, selectAdminUserSQL+` WHERE u.id=?`, userID))
	if err != nil {
		return AdminUserDetail{}, err
	}
	var stats AdminUserStats
	var soleOwner int
	// A workspace is at risk when no other *enabled* owner could manage it once
	// this account is disabled. Disabled owners do not count: a workspace whose
	// only other owner cannot sign in is exactly the case the warning exists to
	// surface. It stays a warning and never blocks disabling the account.
	err = q.QueryRowContext(ctx, `
SELECT
  (SELECT count(*) FROM workspace_members WHERE user_id=?),
  (SELECT count(*) FROM workspaces WHERE created_by=?),
  (SELECT EXISTS(
     SELECT 1 FROM workspace_members m
     WHERE m.user_id=? AND m.role='owner'
       AND NOT EXISTS(
         SELECT 1 FROM workspace_members o JOIN users ou ON ou.id=o.user_id
         WHERE o.workspace_id=m.workspace_id AND o.role='owner' AND o.user_id<>? AND ou.disabled=0
       )
   ))`, userID, userID, userID, userID).Scan(&stats.MemberWorkspaces, &stats.OwnedWorkspaces, &soleOwner)
	if err != nil {
		return AdminUserDetail{}, err
	}
	stats.SoleOwnerRisk = soleOwner != 0
	return AdminUserDetail{AdminUser: user, Stats: stats}, nil
}

const selectAdminUserSQL = `SELECT u.id,
 (SELECT '/api/users/'||u.id||'/avatar?v='||storage_key FROM user_avatars WHERE user_id=u.id),
 u.name,u.email,u.is_admin,u.disabled,u.can_create_workspace,u.signup_source,u.created_at,u.admin_revision
 FROM users u`

func listUsers(ctx context.Context, q DBTX, query UserListQuery) (UserListResult, error) {
	conditions := []string{"1=1"}
	args := []any{}
	if query.Q != "" {
		pattern := "%" + escapeLike(query.Q) + "%"
		conditions = append(conditions, `(u.name LIKE ? ESCAPE '\' OR u.email LIKE ? ESCAPE '\')`)
		args = append(args, pattern, pattern)
	}
	switch query.Status {
	case "enabled":
		conditions = append(conditions, `u.disabled=0`)
	case "disabled":
		conditions = append(conditions, `u.disabled=1`)
	}
	switch query.Role {
	case "admin":
		conditions = append(conditions, `u.is_admin=1`)
	case "user":
		conditions = append(conditions, `u.is_admin=0`)
	}
	if query.Cursor != "" {
		cursorID, err := decodeUserCursor(query.Cursor)
		if err != nil {
			return UserListResult{}, ErrInvalidChange
		}
		// The cursor must still name a real row; it is a server-generated key
		// into the ordering, not an offset a client may invent.
		var exists bool
		if err := q.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=?)`, cursorID).Scan(&exists); err != nil {
			return UserListResult{}, err
		}
		if !exists {
			return UserListResult{}, ErrInvalidChange
		}
		conditions = append(conditions, `(u.created_at < (SELECT created_at FROM users WHERE id=?)
			OR (u.created_at = (SELECT created_at FROM users WHERE id=?) AND u.id < ?))`)
		args = append(args, cursorID, cursorID, cursorID)
	}
	args = append(args, query.Limit+1)
	rows, err := q.QueryContext(ctx, selectAdminUserSQL+`
WHERE `+strings.Join(conditions, " AND ")+`
ORDER BY u.created_at DESC, u.id DESC
LIMIT ?`, args...)
	if err != nil {
		return UserListResult{}, err
	}
	defer rows.Close()
	users := []AdminUser{}
	for rows.Next() {
		user, err := scanAdminUser(rows)
		if err != nil {
			return UserListResult{}, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return UserListResult{}, err
	}
	result := UserListResult{Users: users}
	if len(users) > query.Limit {
		result.Users = users[:query.Limit]
		cursor := encodeUserCursor(users[query.Limit-1].ID)
		result.NextCursor = &cursor
	}
	return result, nil
}

// scanAdminUser accepts either *sql.Row or *sql.Rows through the Scan method.
type scanner interface {
	Scan(dest ...any) error
}

func scanAdminUser(row scanner) (AdminUser, error) {
	var user AdminUser
	var admin, disabled, canCreate int
	var createdAt time.Time
	if err := row.Scan(&user.ID, &user.AvatarURL, &user.Name, &user.Email, &admin, &disabled, &canCreate, &user.SignupSource, &createdAt, &user.Revision); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return AdminUser{}, ErrUserNotFound
		}
		return AdminUser{}, err
	}
	user.IsAdmin, user.Disabled, user.CanCreateWorkspace = admin != 0, disabled != 0, canCreate != 0
	user.EffectiveCanCreateWorkspace = CanCreateWorkspace(Actor{
		ID:                 user.ID,
		IsAdmin:            user.IsAdmin,
		Disabled:           user.Disabled,
		CanCreateWorkspace: user.CanCreateWorkspace,
	})
	user.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	return user, nil
}

// UpdateUser applies a whitelisted management change inside one transaction.
func (s *Store) UpdateUser(ctx context.Context, actor Actor, targetID string, expectedRevision int, changes map[string]json.RawMessage) (UpdateUserResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return UpdateUserResult{}, err
	}
	defer tx.Rollback()

	// The transaction deliberately does not read site_settings. Disabling an
	// account, changing its identity or revoking its sessions is decided purely
	// by user columns (is_admin, disabled, can_create_workspace), so tying this
	// emergency path to an unrelated configuration document would take away the
	// ability to lock out an account exactly when the instance is unhealthy.
	target, err := scanAdminUser(tx.QueryRowContext(ctx, selectAdminUserSQL+` WHERE u.id=?`, targetID))
	if err != nil {
		return UpdateUserResult{}, err
	}
	normalized, err := normalizeUserChanges(changes)
	if err != nil {
		return UpdateUserResult{}, err
	}
	if expectedRevision != target.Revision {
		return UpdateUserResult{}, ErrRevisionConflict
	}
	// Re-read the operator inside the transaction: the middleware snapshot may
	// predate a demotion or a disabling that happened while this request waited.
	persistedActor, err := s.ActorFrom(ctx, tx, actor.ID)
	if err != nil {
		return UpdateUserResult{}, err
	}
	if !CanManageSite(persistedActor) {
		return UpdateUserResult{}, ErrAdminRequired
	}

	nextAdmin := target.IsAdmin
	if normalized.isAdmin != nil {
		nextAdmin = *normalized.isAdmin
	}
	nextDisabled := target.Disabled
	if normalized.disabled != nil {
		nextDisabled = *normalized.disabled
	}
	nextCanCreate := target.CanCreateWorkspace
	if normalized.canCreateWorkspace != nil {
		nextCanCreate = *normalized.canCreateWorkspace
	}

	if nextDisabled && target.ID == persistedActor.ID {
		return UpdateUserResult{}, ErrSelfDisableForbidden
	}
	// The site must always keep one enabled administrator. The count excludes
	// the target because its new values are only in memory until the update.
	var otherActiveAdmins int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM users WHERE is_admin=1 AND disabled=0 AND id<>?`, targetID).Scan(&otherActiveAdmins); err != nil {
		return UpdateUserResult{}, err
	}
	remaining := otherActiveAdmins
	if nextAdmin && !nextDisabled {
		remaining++
	}
	if remaining < 1 {
		return UpdateUserResult{}, ErrLastActiveAdmin
	}

	auditChanges := map[string]any{}
	if nextAdmin != target.IsAdmin {
		auditChanges[KeyUserIsAdmin] = auditValueChange{From: target.IsAdmin, To: nextAdmin}
	}
	if nextDisabled != target.Disabled {
		auditChanges[KeyUserDisabled] = auditValueChange{From: target.Disabled, To: nextDisabled}
	}
	if nextCanCreate != target.CanCreateWorkspace {
		auditChanges[KeyUserCanCreateWorkspace] = auditValueChange{From: target.CanCreateWorkspace, To: nextCanCreate}
	}
	if len(auditChanges) == 0 {
		return UpdateUserResult{User: target}, nil
	}

	revokeSessions := (nextDisabled && !target.Disabled) || nextAdmin != target.IsAdmin
	revoked := 0
	if revokeSessions {
		result, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id=?`, targetID)
		if err != nil {
			return UpdateUserResult{}, err
		}
		deleted, err := result.RowsAffected()
		if err != nil {
			return UpdateUserResult{}, err
		}
		revoked = int(deleted)
		auditChanges[KeySessionsRevoked] = revoked
	}

	updated, err := tx.ExecContext(ctx, `UPDATE users SET is_admin=?,disabled=?,can_create_workspace=?,admin_revision=admin_revision+1,updated_at=? WHERE id=? AND admin_revision=?`,
		boolInt(nextAdmin), boolInt(nextDisabled), boolInt(nextCanCreate), time.Now().UTC(), targetID, expectedRevision)
	if err != nil {
		return UpdateUserResult{}, err
	}
	affected, err := updated.RowsAffected()
	if err != nil {
		return UpdateUserResult{}, err
	}
	if affected != 1 {
		return UpdateUserResult{}, ErrRevisionConflict
	}
	if err := recordUser(ctx, tx, persistedActor, userAuditAction(auditChanges, nextDisabled), targetID, auditChanges); err != nil {
		return UpdateUserResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return UpdateUserResult{}, err
	}
	target.IsAdmin = nextAdmin
	target.Disabled = nextDisabled
	target.CanCreateWorkspace = nextCanCreate
	target.EffectiveCanCreateWorkspace = CanCreateWorkspace(Actor{
		ID:                 target.ID,
		IsAdmin:            nextAdmin,
		Disabled:           nextDisabled,
		CanCreateWorkspace: nextCanCreate,
	})
	target.Revision++
	return UpdateUserResult{User: target, RevokeSessions: revokeSessions, RevokedSessions: revoked}, nil
}

// RevokeUserSessions invalidates every session of an account. It does not
// disable the account, change its password, or touch its grants: the user can
// sign in again immediately.
func (s *Store) RevokeUserSessions(ctx context.Context, actor Actor, targetID string) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	target, err := scanAdminUser(tx.QueryRowContext(ctx, selectAdminUserSQL+` WHERE u.id=?`, targetID))
	if err != nil {
		return 0, err
	}
	persistedActor, err := s.ActorFrom(ctx, tx, actor.ID)
	if err != nil {
		return 0, err
	}
	if !CanManageSite(persistedActor) {
		return 0, ErrAdminRequired
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id=?`, targetID)
	if err != nil {
		return 0, err
	}
	deleted, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	// The audit is written even when there was nothing to revoke: the
	// administrator asked for a durable, idempotent action and the record of it
	// is what makes the count verifiable afterwards.
	if err := recordUser(ctx, tx, persistedActor, ActionUserSessionsRevoked, target.ID, map[string]any{KeySessionsRevoked: deleted}); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return int(deleted), nil
}

// userAuditAction picks one whitelisted action per request. The precedence is
// fixed so combined changes are predictable; every changed field is still
// recorded with its from/to values in changes_json.
func userAuditAction(changes map[string]any, nextDisabled bool) string {
	if _, ok := changes[KeyUserIsAdmin]; ok {
		return ActionUserAdminRoleChanged
	}
	if _, ok := changes[KeyUserDisabled]; ok {
		if nextDisabled {
			return ActionUserDisabled
		}
		return ActionUserEnabled
	}
	return ActionUserWorkspaceCreationChanged
}

type userChanges struct {
	isAdmin            *bool
	disabled           *bool
	canCreateWorkspace *bool
}

func normalizeUserChanges(changes map[string]json.RawMessage) (userChanges, error) {
	if len(changes) == 0 {
		return userChanges{}, ErrInvalidChange
	}
	var result userChanges
	for key, raw := range changes {
		value, err := strictBool(raw)
		if err != nil {
			return userChanges{}, ErrInvalidChange
		}
		switch key {
		case KeyUserIsAdmin:
			result.isAdmin = &value
		case KeyUserDisabled:
			result.disabled = &value
		case KeyUserCanCreateWorkspace:
			result.canCreateWorkspace = &value
		default:
			return userChanges{}, ErrInvalidChange
		}
	}
	return result, nil
}

func encodeUserCursor(userID string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(userID))
}

func decodeUserCursor(cursor string) (string, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return "", fmt.Errorf("%w: cursor is not decodable", ErrInvalidChange)
	}
	userID := string(decoded)
	if userID == "" || strings.Contains(userID, "\x00") {
		return "", fmt.Errorf("%w: cursor is empty", ErrInvalidChange)
	}
	return userID, nil
}

func escapeLike(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
