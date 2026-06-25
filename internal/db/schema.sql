-- madoc SQLite Schema — 12 tables mapped from AFFiNE Prisma models

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    email      TEXT NOT NULL UNIQUE,
    password   TEXT,
    avatar_url TEXT,
    registered INTEGER NOT NULL DEFAULT 1,
    disabled   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Sessions (multiple-users session container)
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. UserSession — links users to sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_uid ON user_sessions(user_id);

-- 4. Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id         TEXT PRIMARY KEY,
    public     INTEGER NOT NULL DEFAULT 0,
    name       TEXT,
    avatar_key TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. WorkspaceUserRole — workspace member permissions
CREATE TABLE IF NOT EXISTS workspace_user_permissions (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'Accepted',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wup_ws ON workspace_user_permissions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wup_uid ON workspace_user_permissions(user_id);

-- 6. WorkspaceDoc — page metadata
CREATE TABLE IF NOT EXISTS workspace_pages (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    doc_id       TEXT NOT NULL,
    public       INTEGER NOT NULL DEFAULT 0,
    mode         INTEGER NOT NULL DEFAULT 0,
    title        TEXT,
    PRIMARY KEY(workspace_id, doc_id)
);
CREATE INDEX IF NOT EXISTS idx_wp_ws ON workspace_pages(workspace_id);

-- 7. Snapshots — latest Yjs document state per doc
CREATE TABLE IF NOT EXISTS snapshots (
    workspace_id TEXT NOT NULL,
    guid         TEXT NOT NULL,
    blob         BLOB,
    state        BLOB,
    size         INTEGER,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY(workspace_id, guid)
);
CREATE INDEX IF NOT EXISTS idx_snap_ws ON snapshots(workspace_id);

-- 8. Updates — sequential Yjs binary patches
CREATE TABLE IF NOT EXISTS updates (
    workspace_id TEXT NOT NULL,
    guid         TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    blob         BLOB NOT NULL,
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY(workspace_id, guid, created_at)
);
CREATE INDEX IF NOT EXISTS idx_upd_ws ON updates(workspace_id);

-- 9. SnapshotHistory — point-in-time doc snapshots for version history
CREATE TABLE IF NOT EXISTS snapshot_histories (
    workspace_id TEXT NOT NULL,
    guid         TEXT NOT NULL,
    timestamp    TEXT NOT NULL,
    blob         BLOB,
    state        BLOB,
    expired_at   TEXT NOT NULL,
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY(workspace_id, guid, timestamp)
);

-- 10. UserSnapshot — per-user Yjs docs (settings, preferences)
CREATE TABLE IF NOT EXISTS user_snapshots (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    blob       BLOB,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(user_id, id)
);

-- 11. Blobs — file attachments per workspace
CREATE TABLE IF NOT EXISTS blobs (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key          TEXT NOT NULL,
    size         INTEGER NOT NULL DEFAULT 0,
    mime         TEXT NOT NULL DEFAULT 'application/octet-stream',
    status       INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at   TEXT,
    PRIMARY KEY(workspace_id, key)
);
CREATE INDEX IF NOT EXISTS idx_blob_ws ON blobs(workspace_id);

-- 12. AppConfig — server-level key-value configuration
CREATE TABLE IF NOT EXISTS app_configs (
    id         TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ========================================
-- Legacy tables (from early prototype, keep for backward compat)
-- ========================================

CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled',
    snapshot BLOB,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doc_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    update_blob BLOB NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(doc_id) REFERENCES docs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_doc_updates_doc_id ON doc_updates(doc_id, id);

CREATE VIRTUAL TABLE IF NOT EXISTS doc_search USING fts5(
    doc_id UNINDEXED,
    content
);
