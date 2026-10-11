-- Admin-managed revision for the users table. It tracks only the three fields
-- site administrators may change through the management API (is_admin,
-- disabled, can_create_workspace); profile edits such as the avatar or name
-- must not advance it, otherwise a permission form would conflict with an
-- unrelated personal change.
ALTER TABLE users ADD COLUMN admin_revision INTEGER NOT NULL DEFAULT 0
  CHECK (admin_revision >= 0);
