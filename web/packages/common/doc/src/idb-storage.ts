import { openDB, IDBPDatabase } from 'idb';
import * as Y from 'yjs';

const DB_NAME = 'madoc-cache';
const DB_VERSION = 1;

interface DocUpdateRecord {
  workspaceId: string;
  docId: string;
  blob: ArrayBuffer;
  createdAt: number;
}

interface DocSnapshotRecord {
  workspaceId: string;
  docId: string;
  blob: ArrayBuffer;
  updatedAt: number;
}

export class IDBDocStorage {
  private db: IDBPDatabase | null = null;
  private static lastUpdateCreatedAt = 0;

  private static nextUpdateCreatedAt(): number {
    const now = Date.now();
    const next = Math.max(now, IDBDocStorage.lastUpdateCreatedAt + 1);
    IDBDocStorage.lastUpdateCreatedAt = next;
    return next;
  }

  private static toArrayBuffer(blob: Uint8Array): ArrayBuffer {
    if (blob.byteOffset === 0 && blob.byteLength === blob.buffer.byteLength) {
      return blob.buffer as ArrayBuffer;
    }
    return blob.slice().buffer as ArrayBuffer;
  }

  async init(): Promise<void> {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('updates')) {
          const store = db.createObjectStore('updates', {
            keyPath: ['workspaceId', 'docId', 'createdAt'],
          });
          store.createIndex('byDoc', ['workspaceId', 'docId']);
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', {
            keyPath: ['workspaceId', 'docId'],
          });
        }
      },
    });
  }

  private async getDb(): Promise<IDBPDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  async saveUpdate(workspaceId: string, docId: string, blob: Uint8Array): Promise<void> {
    const db = await this.getDb();
    await db.add('updates', {
      workspaceId,
      docId,
      blob: IDBDocStorage.toArrayBuffer(blob),
      createdAt: IDBDocStorage.nextUpdateCreatedAt(),
    });
  }

  async getUpdates(workspaceId: string, docId: string): Promise<Uint8Array[]> {
    const db = await this.getDb();
    const records = await db.getAllFromIndex('updates', 'byDoc', [workspaceId, docId]);
    return records.map(r => new Uint8Array(r.blob));
  }

  async clearDoc(workspaceId: string, docId: string): Promise<void> {
    const db = await this.getDb();
    const records = await db.getAllFromIndex('updates', 'byDoc', [workspaceId, docId]);
    for (const r of records) {
      await db.delete('updates', [r.workspaceId, r.docId, r.createdAt]);
    }
    await db.delete('snapshots', [workspaceId, docId]);
  }

  async saveSnapshot(workspaceId: string, docId: string, blob: Uint8Array): Promise<void> {
    const db = await this.getDb();
    await db.put('snapshots', {
      workspaceId,
      docId,
      blob: IDBDocStorage.toArrayBuffer(blob),
      updatedAt: Date.now(),
    });
  }

  async getSnapshot(workspaceId: string, docId: string): Promise<Uint8Array | null> {
    const db = await this.getDb();
    const record = await db.get('snapshots', [workspaceId, docId]);
    return record ? new Uint8Array(record.blob) : null;
  }

  async getMergedDoc(workspaceId: string, docId: string): Promise<Uint8Array | null> {
    const snap = await this.getSnapshot(workspaceId, docId);
    const updates = await this.getUpdates(workspaceId, docId);

    if (!snap && updates.length === 0) return null;

    return Y.mergeUpdates(snap ? [snap, ...updates] : updates);
  }

  async getDocTimestamps(workspaceId: string): Promise<Record<string, number>> {
    const db = await this.getDb();
    const records = await db.getAll('snapshots');
    const timestamps: Record<string, number> = {};
    for (const r of records) {
      if (r.workspaceId === workspaceId) {
        timestamps[r.docId] = r.updatedAt;
      }
    }
    return timestamps;
  }

  async destroy(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
