CREATE TABLE user_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferences_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL
);
