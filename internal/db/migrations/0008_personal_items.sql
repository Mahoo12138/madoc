CREATE TABLE item_favorites (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL,
    PRIMARY KEY(user_id, item_id)
);
CREATE TABLE item_visits (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    visited_at DATETIME NOT NULL,
    PRIMARY KEY(user_id, item_id)
);
CREATE INDEX idx_item_visits_user_time ON item_visits(user_id, visited_at DESC);
