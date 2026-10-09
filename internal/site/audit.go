package site

import (
	"context"
	"encoding/json"
	"time"
)

const ActionSettingsChanged = "site.settings_changed"

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
	body, err := json.Marshal(allowed)
	if err != nil {
		return err
	}
	_, err = q.ExecContext(ctx, `INSERT INTO admin_audit_events(actor_kind,actor_user_id,action,target_type,target_id,changes_json,request_id,created_at) VALUES('user',?,?, 'site_settings','site_settings',?,NULL,?)`, actor.ID, ActionSettingsChanged, string(body), time.Now().UTC())
	return err
}
