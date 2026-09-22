import { mergeUpdates } from 'yjs';

export type OutboxRecord = {
  key: string;
  itemScope: string;
  scope: string;
  generation: number;
  id: string;
  update: Uint8Array;
  pending: boolean;
  archived?: boolean;
  title?: string;
  updatedAt?: number;
};

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('madoc-markdown-outbox', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('updates', { keyPath: 'key' });
        store.createIndex('itemScope', 'itemScope');
        store.createIndex('scope', 'scope');
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = undefined; };
        resolve(request.result);
      };
      request.onerror = () => { database = undefined; reject(request.error); };
      request.onblocked = () => { database = undefined; reject(new Error('本地存储升级被其他页面阻止')); };
    }).catch(error => { database = undefined; throw error; });
  }
  return database;
}

function completed(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('本地保存已中止'));
    transaction.onerror = () => reject(transaction.error ?? new Error('本地保存失败'));
  });
}

export class MarkdownOutbox {
  readonly itemScope: string;

  constructor(origin: string, userId: string, workspaceId: string, itemId: string, private title?: string) {
    this.itemScope = JSON.stringify([origin, userId, workspaceId, itemId]);
  }

  private scope(generation: number) {
    return JSON.stringify([this.itemScope, generation]);
  }

  async load(): Promise<OutboxRecord[]> {
    const db = await openDatabase();
    const transaction = db.transaction('updates', 'readonly');
    const done = completed(transaction);
    const request = transaction.objectStore('updates').index('itemScope').getAll(this.itemScope);
    await done;
    const records = request.result as OutboxRecord[];
    if (records.some(record => !(record.update instanceof Uint8Array) || !Number.isSafeInteger(record.generation))) {
      throw new Error('本地恢复记录无法读取');
    }
    return records;
  }

  async append(generation: number, id: string, update: Uint8Array, pending: boolean) {
    const db = await openDatabase();
    const transaction = db.transaction('updates', 'readwrite');
    const done = completed(transaction);
    const scope = this.scope(generation);
    try {
      transaction.objectStore('updates').put({
        key: JSON.stringify([scope, id]), itemScope: this.itemScope, scope,
        generation, id, update, pending, title: this.title, updatedAt: Date.now(),
      } satisfies OutboxRecord);
    } catch (error) {
      transaction.abort();
      await done.catch(() => {});
      throw error;
    }
    await done;
  }

  async saveRecovery(generation: number, snapshot: Uint8Array, pending: { id: string; update: Uint8Array }[]) {
    const db = await openDatabase();
    const transaction = db.transaction('updates', 'readwrite');
    const done = completed(transaction);
    const scope = this.scope(generation);
    const store = transaction.objectStore('updates');
    try {
      for (const entry of [{ id: crypto.randomUUID(), update: snapshot, pending: false }, ...pending.map(entry => ({ ...entry, pending: true }))]) {
        store.put({ key: JSON.stringify([scope, entry.id]), itemScope: this.itemScope, scope, generation, title: this.title, updatedAt: Date.now(), ...entry } satisfies OutboxRecord);
      }
    } catch (error) {
      transaction.abort();
      await done.catch(() => {});
      throw error;
    }
    await done;
  }

  async acknowledge(generation: number, id: string) {
    const db = await openDatabase();
    const transaction = db.transaction('updates', 'readwrite');
    const done = completed(transaction);
    const store = transaction.objectStore('updates');
    const request = store.get(JSON.stringify([this.scope(generation), id]));
    request.onsuccess = () => {
      const record = request.result as OutboxRecord | undefined;
      if (record) store.put({ ...record, pending: false });
    };
    await done;
  }

  // Merge only confirmed recovery records. Outstanding update IDs remain intact.
  async compact(generation: number) {
    const db = await openDatabase();
    const transaction = db.transaction('updates', 'readwrite');
    const done = completed(transaction);
    const store = transaction.objectStore('updates');
    const request = store.index('scope').getAll(this.scope(generation));
    request.onsuccess = () => {
      const confirmed = (request.result as OutboxRecord[]).filter(record => !record.pending && !record.archived);
      if (confirmed.length < 200) return;
      try {
        const update = mergeUpdates(confirmed.map(record => record.update));
        for (const record of confirmed) store.delete(record.key);
        const id = crypto.randomUUID();
        const scope = this.scope(generation);
        store.put({ key: JSON.stringify([scope, id]), itemScope: this.itemScope, scope, generation, id, update, pending: false, title: this.title, updatedAt: Date.now() } satisfies OutboxRecord);
      } catch {
        transaction.abort();
      }
    };
    await done;
  }
}

export type LocalRecovery = {
  scope: string;
  itemScope: string;
  itemId: string;
  workspaceId: string;
  generation: number;
  title: string;
  updatedAt: number;
  pendingIds: string[];
  records: OutboxRecord[];
};

export async function listLocalRecoveries(origin: string, userId: string): Promise<LocalRecovery[]> {
  const db = await openDatabase();
  const transaction = db.transaction('updates', 'readonly');
  const done = completed(transaction);
  const prefix = JSON.stringify([origin, userId]).slice(0, -1) + ',';
  const request = transaction.objectStore('updates').index('itemScope').getAll(IDBKeyRange.bound(prefix, prefix + '\uffff'));
  await done;
  const groups = new Map<string, LocalRecovery>();
  for (const record of request.result as OutboxRecord[]) {
    const [recordOrigin, recordUser, workspaceId, itemId] = JSON.parse(record.itemScope) as string[];
    if (recordOrigin !== origin || recordUser !== userId) continue;
    let group = groups.get(record.scope);
    if (!group) {
      group = { scope: record.scope, itemScope: record.itemScope, workspaceId, itemId, generation: record.generation,
        title: record.title || `文档 ${itemId.slice(0, 8)}`, updatedAt: 0, pendingIds: [], records: [] };
      groups.set(record.scope, group);
    }
    group.records.push(record);
    if (record.pending && !record.archived) group.pendingIds.push(record.id);
    if ((record.updatedAt ?? 0) >= group.updatedAt) {
      group.updatedAt = record.updatedAt ?? 0;
      group.title = record.title || group.title;
    }
  }
  return [...groups.values()].filter(group => group.pendingIds.length || group.records.some(record => record.archived))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Archive only the reviewed IDs, leaving any concurrently added updates pending.
// Callers must first verify that the server has moved to a newer generation.
export async function archiveLocalRecovery(recovery: LocalRecovery) {
  const db = await openDatabase();
  const transaction = db.transaction('updates', 'readwrite');
  const done = completed(transaction);
  const store = transaction.objectStore('updates');
  for (const id of recovery.pendingIds) {
    const request = store.get(JSON.stringify([recovery.scope, id]));
    request.onsuccess = () => {
      const record = request.result as OutboxRecord | undefined;
      if (record) store.put({ ...record, archived: true });
    };
  }
  await done;
}
