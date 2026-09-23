-- Public shares grant access only to one immutable, manually published item
-- version. The capability token is never stored in plaintext.
CREATE TABLE item_shares (
    id          TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    version_id  TEXT NOT NULL REFERENCES item_versions(id) ON DELETE CASCADE,
    published_title TEXT NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL,
    expires_at  DATETIME,
    revoked_at  DATETIME
);
CREATE INDEX idx_item_shares_item ON item_shares(item_id, created_at DESC);
CREATE INDEX idx_item_shares_version ON item_shares(version_id);
