import * as Y from 'yjs';
import { SocketProvider } from './socket-provider';
import { IDBDocStorage } from './idb-storage';
import type { DocUpdateBroadcast } from './types';

const NBSTORE_ORIGIN = 'madoc:doc-frontend';

export type DocSyncStatus =
  | 'connecting'
  | 'loading'
  | 'syncing'
  | 'saved'
  | 'error';

interface DocFrontendOptions {
  onSyncStatusChange?: (status: DocSyncStatus) => void;
}

export class DocFrontend {
  private provider: SocketProvider;
  private idb: IDBDocStorage;
  private options: DocFrontendOptions;
  private workspaceId = '';
  private docs = new Map<string, Y.Doc>();
  private unsubBroadcast: (() => void) | null = null;
  private unsubs = new Map<string, () => void>();
  private started = false;

  constructor(
    provider: SocketProvider,
    idb: IDBDocStorage,
    options: DocFrontendOptions = {}
  ) {
    this.provider = provider;
    this.idb = idb;
    this.options = options;
  }

  get connected(): boolean {
    return this.provider.connected;
  }

  async start(workspaceId: string): Promise<void> {
    if (this.started) return;
    this.workspaceId = workspaceId;
    this.setSyncStatus('connecting');

    await this.idb.init();
    await this.provider.connect();

    const result = await this.provider.joinWorkspace(workspaceId);
    console.log('[DocFrontend] joined workspace:', result.clientId);

    this.unsubBroadcast = this.provider.onBroadcastUpdate((data) => {
      this.handleBroadcast(data);
    });

    this.started = true;
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    for (const [, unsub] of this.unsubs) {
      unsub();
    }
    this.unsubs.clear();
    this.docs.clear();

    if (this.unsubBroadcast) {
      this.unsubBroadcast();
      this.unsubBroadcast = null;
    }

    this.provider.leaveWorkspace(this.workspaceId);
    this.provider.disconnect();
  }

  async connectDoc(docId: string, yDoc: Y.Doc): Promise<number | null> {
    if (!this.started) throw new Error('DocFrontend not started');

    this.setSyncStatus('loading');
    this.docs.set(docId, yDoc);

    // Load doc from server
    const { missing, snapshot, updates, timestamp } = await this.provider.loadDoc(
      this.workspaceId,
      docId
    );

    if (snapshot.length > 0) {
      Y.applyUpdate(yDoc, snapshot, NBSTORE_ORIGIN);
    }

    for (const update of updates) {
      Y.applyUpdate(yDoc, update, NBSTORE_ORIGIN);
    }

    // Compatibility with older servers that only return one encoded update.
    if (snapshot.length === 0 && updates.length === 0 && missing.length > 0) {
      Y.applyUpdate(yDoc, missing, NBSTORE_ORIGIN);
    }

    const serverState = Y.encodeStateVector(yDoc);
    const cached = await this.idb.getMergedDoc(this.workspaceId, docId);
    let appliedCache = false;
    if (cached && cached.length > 0) {
      Y.applyUpdate(yDoc, cached, NBSTORE_ORIGIN);
      appliedCache = true;
    }

    const pendingLocalUpdate = Y.encodeStateAsUpdate(yDoc, serverState);
    if (appliedCache && pendingLocalUpdate.length > 0) {
      await this.provider.pushDocUpdate(
        this.workspaceId,
        docId,
        pendingLocalUpdate
      );
    }

    await this.idb.clearDoc(this.workspaceId, docId);
    await this.idb.saveSnapshot(
      this.workspaceId,
      docId,
      Y.encodeStateAsUpdate(yDoc)
    );
    this.setSyncStatus('saved');

    // Subscribe to local Yjs updates
    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === NBSTORE_ORIGIN) return;
      this.setSyncStatus('syncing');
      void (async () => {
        await this.idb.saveUpdate(this.workspaceId, docId, update);
        await this.provider.pushDocUpdate(this.workspaceId, docId, update);
        this.setSyncStatus('saved');
      })().catch(error => {
        this.setSyncStatus('error');
        console.error('[DocFrontend] failed to push doc update:', error);
      });
    };

    yDoc.on('update', handleUpdate);
    this.unsubs.set(docId, () => {
      yDoc.off('update', handleUpdate);
    });

    return timestamp;
  }

  disconnectDoc(docId: string): void {
    const unsub = this.unsubs.get(docId);
    if (unsub) {
      unsub();
      this.unsubs.delete(docId);
    }
    this.docs.delete(docId);
  }

  private handleBroadcast(data: DocUpdateBroadcast): void {
    if (data.spaceId !== this.workspaceId) return;

    const yDoc = this.docs.get(data.docId);
    if (!yDoc) return;

    const updateBinary = Uint8Array.from(atob(data.update), c => c.charCodeAt(0));

    // Apply to Yjs doc
    Y.applyUpdate(yDoc, updateBinary, NBSTORE_ORIGIN);

    // Cache in IDB
    void this.idb.saveUpdate(this.workspaceId, data.docId, updateBinary);
  }

  private setSyncStatus(status: DocSyncStatus): void {
    this.options.onSyncStatusChange?.(status);
  }
}
