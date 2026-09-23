-- Item-level asynchronous discussion. Comment bodies are plain text and do
-- not alter the collaborative Markdown / whiteboard document state.
CREATE TABLE item_comments (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    item_id      TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    author_name  TEXT NOT NULL,
    body         TEXT NOT NULL,
    created_at   DATETIME NOT NULL,
    CHECK(length(trim(body)) > 0)
);
CREATE INDEX idx_item_comments_item_created ON item_comments(item_id, created_at DESC, id DESC);
