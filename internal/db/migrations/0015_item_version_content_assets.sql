-- Exact assets referenced by a captured version's content. This is separate
-- from item_version_assets, which protects every retained historical asset.
CREATE TABLE item_version_content_assets (
    version_id TEXT NOT NULL REFERENCES item_versions(id) ON DELETE CASCADE,
    asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
    PRIMARY KEY(version_id, asset_id)
);
CREATE INDEX idx_item_version_content_assets_asset ON item_version_content_assets(asset_id);
