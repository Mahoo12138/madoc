CREATE TABLE item_deletion_batches (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    root_item_id TEXT NOT NULL,
    original_parent_id TEXT,
    deleted_by TEXT NOT NULL REFERENCES users(id),
    deleted_at DATETIME NOT NULL
);
CREATE INDEX idx_item_deletion_batches_workspace ON item_deletion_batches(workspace_id, deleted_at);
ALTER TABLE items ADD COLUMN deletion_batch_id TEXT REFERENCES item_deletion_batches(id);
CREATE INDEX idx_items_deletion_batch ON items(deletion_batch_id);
