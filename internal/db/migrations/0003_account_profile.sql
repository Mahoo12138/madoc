CREATE TABLE user_avatars (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL UNIQUE,
    updated_at DATETIME NOT NULL
);
