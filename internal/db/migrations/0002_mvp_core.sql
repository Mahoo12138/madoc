CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
    created_at DATETIME NOT NULL,
    PRIMARY KEY(workspace_id, user_id)
);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE workspace_invites (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL COLLATE NOCASE,
    role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
    token_hash TEXT NOT NULL UNIQUE,
    inviter_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK(status IN ('pending','accepted','revoked','expired')),
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
CREATE INDEX idx_workspace_invites_workspace ON workspace_invites(workspace_id);

CREATE TABLE items (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES items(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('folder','markdown','whiteboard')),
    title TEXT NOT NULL,
    sort_key INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
CREATE INDEX idx_items_workspace_parent ON items(workspace_id, parent_id, sort_key);

CREATE TABLE markdown_states (
    item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    snapshot BLOB,
    snapshot_seq INTEGER NOT NULL DEFAULT 0,
    markdown_cache TEXT NOT NULL DEFAULT '',
    cache_seq INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL
);

CREATE TABLE markdown_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    client_update_id TEXT NOT NULL,
    update_blob BLOB NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME NOT NULL,
    UNIQUE(item_id, client_update_id)
);
CREATE INDEX idx_markdown_updates_item ON markdown_updates(item_id, id);

CREATE TABLE whiteboard_states (
    item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 0,
    scene_json TEXT NOT NULL DEFAULT '{"elements":[],"appState":{},"files":{}}',
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT,
    storage_key TEXT NOT NULL UNIQUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME NOT NULL
);
CREATE INDEX idx_assets_workspace ON assets(workspace_id);

CREATE TABLE server_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME NOT NULL
);
