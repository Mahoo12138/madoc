-- Durable, immutable content checkpoints. Markdown keeps its Yjs state and
-- updates separately so compaction of the live document cannot change history.
CREATE TABLE item_versions (
    id               TEXT PRIMARY KEY,
    item_id          TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    content_type     TEXT NOT NULL CHECK(content_type IN ('markdown','whiteboard')),
    kind             TEXT NOT NULL CHECK(kind IN ('manual','automatic')),
    label            TEXT,
    created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
    generation       INTEGER,
    snapshot_seq     INTEGER,
    head_seq         INTEGER,
    markdown_snapshot BLOB,
    markdown_text    TEXT,
    whiteboard_revision INTEGER,
    whiteboard_scene TEXT,
    payload_bytes    INTEGER NOT NULL CHECK(payload_bytes >= 0),
    created_at       DATETIME NOT NULL,
    CHECK((kind='manual' AND label IS NOT NULL) OR (kind='automatic' AND label IS NULL)),
    CHECK(
      (content_type='markdown' AND generation IS NOT NULL AND snapshot_seq IS NOT NULL AND head_seq IS NOT NULL
       AND markdown_snapshot IS NOT NULL AND markdown_text IS NOT NULL AND whiteboard_revision IS NULL AND whiteboard_scene IS NULL)
      OR
      (content_type='whiteboard' AND generation IS NULL AND snapshot_seq IS NULL AND head_seq IS NULL
       AND markdown_snapshot IS NULL AND markdown_text IS NULL AND whiteboard_revision IS NOT NULL AND whiteboard_scene IS NOT NULL)
    )
);
CREATE INDEX idx_item_versions_item_created ON item_versions(item_id, created_at DESC, id DESC);
CREATE INDEX idx_item_versions_workspace_created ON item_versions(workspace_id, created_at DESC);

CREATE TABLE item_version_updates (
    version_id TEXT NOT NULL REFERENCES item_versions(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    update_blob BLOB NOT NULL,
    PRIMARY KEY(version_id, seq)
);

-- Referenced asset metadata and bytes must outlive every version that names
-- them. Deferred NO ACTION permits an explicit Workspace/Item purge transaction
-- to remove both the versions and assets before constraints are checked.
CREATE TABLE item_version_assets (
    version_id TEXT NOT NULL REFERENCES item_versions(id) ON DELETE CASCADE,
    asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
    PRIMARY KEY(version_id, asset_id)
);
CREATE INDEX idx_item_version_assets_asset ON item_version_assets(asset_id);
