-- Account enrollment records (§11.4): one table for both future enrollment
-- flows. kind is pinned to public_signup / admin_created now so the later
-- public registration package can share this structure without another
-- migration; only admin_created rows are written today (§11.3).
--
-- created_by and can_create_workspace are deliberately reserved for the
-- administrator flow in the column comments below: a public signup record has
-- no approving administrator, and its initial grant must be read from the
-- settings in force when registration completes, never frozen into the token.
CREATE TABLE account_enrollments (
    id                   TEXT PRIMARY KEY,
    kind                 TEXT NOT NULL
                         CHECK (kind IN ('public_signup', 'admin_created')),
    -- Normalized target mailbox (trimmed + lowercased), matching every other
    -- entry point. The +tag and dot rules of a provider are intentionally not
    -- applied (§11.5).
    email                TEXT NOT NULL,
    -- sha256 digest of the opaque `id.secret` token. The plain token exists
    -- only in the create response, so a database leak cannot be replayed.
    token_hash           TEXT NOT NULL UNIQUE,
    status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'consumed', 'revoked')),
    expires_at           DATETIME NOT NULL,
    created_at           DATETIME NOT NULL,
    consumed_at          DATETIME,
    -- Only administrator invitations have an issuer. SET NULL keeps an audit
    -- grade history alive when that account is removed.
    created_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
    -- Only administrator invitations carry an explicit, revocable initial
    -- workspace creation grant (§11.3).
    can_create_workspace INTEGER CHECK (can_create_workspace IN (0, 1))
);

-- Duplicate / supersede checks always filter by the target mailbox plus state.
CREATE INDEX idx_account_enrollments_email_status
    ON account_enrollments(email, status);

-- Listing what one administrator authorized, newest first. It mirrors the
-- target index of admin_audit_events so a future page can answer "which
-- approvals did this administrator issue".
CREATE INDEX idx_account_enrollments_issuer
    ON account_enrollments(created_by, id DESC);

-- Only a real email verification flow may write this timestamp. An
-- administrator approved the account, they did not prove the mailbox is
-- reachable, so existing accounts and every existing creation path keep NULL
-- and nothing here infers verification from the account source (§11.4).
ALTER TABLE users ADD COLUMN email_verified_at DATETIME;
