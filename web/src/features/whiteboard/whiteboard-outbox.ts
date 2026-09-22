import type { BoardScene } from '@/api/types';

export type WhiteboardDraft = {
  key: string;
  scope: string;
  account: string;
  id: string;
  baseRevision: number;
  title: string;
  updatedAt: number;
  scene: BoardScene;
};

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('madoc-whiteboard-outbox', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('drafts', { keyPath: 'key' });
      store.createIndex('scope', 'scope');
      store.createIndex('account', 'account');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('本地白板存储被其他页面阻止'));
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
  }).catch(error => { database = undefined; throw error; });
  return database;
}

function completed(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('本地白板保存已中止'));
    transaction.onerror = () => reject(transaction.error ?? new Error('本地白板保存失败'));
  });
}

function validate(records: WhiteboardDraft[]) {
  for (const record of records) {
    if (!record.id || !Number.isSafeInteger(record.baseRevision) || record.baseRevision < 0 ||
        !record.scene || !Array.isArray(record.scene.elements) || !record.scene.appState || !record.scene.files) {
      throw new Error('本地白板恢复记录无法读取，请保留站点数据');
    }
  }
  return records;
}

// Each tab owns one slot. A full scene replaces only that tab's previous draft;
// drafts from other tabs remain independent until the merged scene is ACKed.
export class WhiteboardOutbox {
  readonly scope: string;
  readonly account: string;
  readonly key: string;

  constructor(origin: string, userId: string, workspaceId: string, itemId: string, writerId: string, private title: string) {
    this.account = JSON.stringify([origin, userId]);
    this.scope = JSON.stringify([origin, userId, workspaceId, itemId]);
    this.key = JSON.stringify([this.scope, writerId]);
  }

  async load() {
    const db = await openDatabase();
    const transaction = db.transaction('drafts', 'readonly');
    const done = completed(transaction);
    const request = transaction.objectStore('drafts').index('scope').getAll(this.scope);
    await done;
    return validate(request.result as WhiteboardDraft[]);
  }

  async save(id: string, baseRevision: number, scene: BoardScene) {
    // Capture now, before opening the asynchronous transaction. Excalidraw may
    // replace/mutate its scene references while storage is being opened.
    const record: WhiteboardDraft = structuredClone({ key: this.key, scope: this.scope, account: this.account, id, baseRevision, title: this.title, updatedAt: Date.now(), scene });
    validate([record]);
    const db = await openDatabase();
    const transaction = db.transaction('drafts', 'readwrite');
    const done = completed(transaction);
    try { transaction.objectStore('drafts').put(record); }
    catch (error) { transaction.abort(); await done.catch(() => {}); throw error; }
    await done;
    return record;
  }

  async confirm(records: Pick<WhiteboardDraft, 'key' | 'id'>[]) {
    if (!records.length) return;
    const db = await openDatabase();
    const transaction = db.transaction('drafts', 'readwrite');
    const done = completed(transaction);
    const store = transaction.objectStore('drafts');
    for (const record of records) {
      const request = store.get(record.key);
      request.onsuccess = () => {
        const current = request.result as WhiteboardDraft | undefined;
        // A late ACK must not delete a newer draft, including one concurrently
        // saved by another tab after the caller captured its recovery list.
        if (current?.scope === this.scope && current.id === record.id) store.delete(record.key);
      };
    }
    await done;
  }
}

export async function listWhiteboardDrafts(origin: string, userId: string) {
  const db = await openDatabase();
  const transaction = db.transaction('drafts', 'readonly');
  const done = completed(transaction);
  const request = transaction.objectStore('drafts').index('account').getAll(JSON.stringify([origin, userId]));
  await done;
  return validate(request.result as WhiteboardDraft[]);
}
