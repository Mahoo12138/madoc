package site

import (
	"context"
	"encoding/json"
	"time"
)

const (
	ActionSettingsChanged = "site.settings_changed"
	// Audit rows for the user lifecycle share one target type so a future audit
	// page can list everything that happened to an account by id.
	targetTypeUser = "user"
)

type auditValueChange struct {
	From any `json:"from"`
	To   any `json:"to"`
}

func record(ctx context.Context, q DBTX, actor Actor, changes map[string]any) error {
	allowed := make(map[string]any, len(changes))
	for _, key := range []string{
		KeyRegistrationMode,
		KeyAllowWorkspaceOwnerInviteNewUsers,
		KeyInviteDefaultCanCreateWorkspace,
		KeyPublicSignupDefaultCanCreateWorkspace,
	} {
		if change, ok := changes[key]; ok {
			allowed[key] = change
		}
	}
	return insertAudit(ctx, q, actor, ActionSettingsChanged, "site_settings", "site_settings", allowed)
}

// recordUser stores a management audit row for a user lifecycle action. Only
// whitelisted business fields survive: passwords, hashes, cookies, tokens and
// raw request bodies are never written, and the IP is not collected.
func recordUser(ctx context.Context, q DBTX, actor Actor, action, targetID string, changes map[string]any) error {
	allowed := make(map[string]any, len(changes))
	for _, key := range []string{
		KeyUserIsAdmin,
		KeyUserDisabled,
		KeyUserCanCreateWorkspace,
		KeySessionsRevoked,
	} {
		if change, ok := changes[key]; ok {
			allowed[key] = change
		}
	}
	return insertAudit(ctx, q, actor, action, targetTypeUser, targetID, allowed)
}

// recordEnrollment stores a management audit row for the enrollment lifecycle.
// Its whitelist is the only thing standing between a caller and a token-bearing
// audit row, so it accepts business fields and counts and nothing else.
func recordEnrollment(ctx context.Context, q DBTX, actor Actor, action, targetType, targetID string, changes map[string]any) error {
	allowed := make(map[string]any, len(changes))
	for _, key := range []string{
		KeyEnrollmentEmail,
		KeyEnrollmentCanCreateWorkspace,
		KeyEnrollmentRevokedExisting,
		KeyEnrollmentID,
		KeyEnrollmentSignupSource,
	} {
		if change, ok := changes[key]; ok {
			allowed[key] = change
		}
	}
	return insertAudit(ctx, q, actor, action, targetType, targetID, allowed)
}

func insertAudit(ctx context.Context, q DBTX, actor Actor, action, targetType, targetID string, changes map[string]any) error {
	body, err := json.Marshal(changes)
	if err != nil {
		return err
	}
	_, err = q.ExecContext(ctx, `INSERT INTO admin_audit_events(actor_kind,actor_user_id,action,target_type,target_id,changes_json,request_id,created_at) VALUES('user',?,?,?,?,?,NULL,?)`,
		actor.ID, action, targetType, targetID, string(body), time.Now().UTC())
	return err
}
