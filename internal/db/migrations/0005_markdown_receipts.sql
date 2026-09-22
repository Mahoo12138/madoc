-- ACK identities outlive the update blobs removed by snapshot compaction.
CREATE TABLE markdown_update_receipts (
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    client_update_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    PRIMARY KEY(item_id, client_update_id)
);

INSERT INTO markdown_update_receipts(item_id, client_update_id, seq)
SELECT item_id, client_update_id, id FROM markdown_updates;
