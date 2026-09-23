CREATE TABLE workspace_activity (
    id          TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    item_id     TEXT,
    item_title  TEXT NOT NULL DEFAULT '',
    actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    actor_name  TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    summary     TEXT NOT NULL,
    created_at  DATETIME NOT NULL
);

CREATE INDEX idx_workspace_activity_feed
    ON workspace_activity(workspace_id, created_at DESC, id DESC);
