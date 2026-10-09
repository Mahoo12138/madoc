ALTER TABLE users ADD COLUMN can_create_workspace INTEGER NOT NULL DEFAULT 0
  CHECK (can_create_workspace IN (0, 1));
ALTER TABLE users ADD COLUMN signup_source TEXT NOT NULL DEFAULT 'legacy'
  CHECK (signup_source IN ('setup', 'workspace_invite', 'public_signup', 'admin_created', 'legacy'));
UPDATE users SET can_create_workspace = 1;

CREATE TABLE admin_audit_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_kind    TEXT NOT NULL CHECK (actor_kind IN ('user', 'system', 'maintenance')),
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    target_type   TEXT NOT NULL,
    target_id     TEXT,
    changes_json  TEXT NOT NULL DEFAULT '{}',
    request_id    TEXT,
    created_at    DATETIME NOT NULL
);
CREATE INDEX idx_admin_audit_target ON admin_audit_events(target_type, target_id, id);

INSERT INTO server_config(key, value, updated_at)
SELECT 'site_settings', '{"schemaVersion":1,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":false,"inviteDefaultCanCreateWorkspace":false,"publicSignupDefaultCanCreateWorkspace":false,"origin":"new"}', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM server_config WHERE key = 'site_settings')
  AND NOT EXISTS (SELECT 1 FROM users);

INSERT INTO server_config(key, value, updated_at)
SELECT 'site_settings', '{"schemaVersion":1,"revision":0,"registrationMode":"invite_only","allowWorkspaceOwnerInviteNewUsers":true,"inviteDefaultCanCreateWorkspace":true,"publicSignupDefaultCanCreateWorkspace":false,"origin":"upgrade"}', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM server_config WHERE key = 'site_settings')
  AND EXISTS (SELECT 1 FROM users);
