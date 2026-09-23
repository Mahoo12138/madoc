-- Explicit live-content references are needed when a restored copy shares an
-- attachment whose original item association may later be removed.
CREATE TABLE item_asset_refs (
    item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
    PRIMARY KEY(item_id, asset_id)
);
CREATE INDEX idx_item_asset_refs_asset ON item_asset_refs(asset_id);
