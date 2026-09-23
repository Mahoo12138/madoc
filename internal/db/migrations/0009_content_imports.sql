-- A successful import and its receipt commit together. Keep receipts after Item
-- deletion so retrying an old request cannot recreate deleted content.
CREATE TABLE content_imports (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL REFERENCES users(id),
    request_sha256 TEXT NOT NULL,
    root_item_id TEXT NOT NULL,
    created_at DATETIME NOT NULL
);
CREATE INDEX idx_content_imports_workspace ON content_imports(workspace_id);
