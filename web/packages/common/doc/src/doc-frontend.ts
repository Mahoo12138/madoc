import * as Y from 'yjs';
import { SocketProvider } from './socket-provider';
import { IDBDocStorage } from './idb-storage';
import type { DocUpdateBroadcast } from './types';

const NBSTORE_ORIGIN = 'madoc:doc-frontend';

export class DocFrontend {
  private provider: SocketProvider;
  private idb: IDBDocStorage;
  private workspaceId = '';
  private docs = new Map<string, Y.Doc>();
  private unsubBroadcast: (() => void) | null = null;
  private unsubs = new Map<string, () => void>();
  private started = false;

  constructor(provider: SocketProvider, idb: IDBDocStorage) {
    this.provider = provider;
    this.idb = idb;
  }

  get connected(): boolean {
    return this.provider.connected;
  }

  async start(workspaceId: string): Promise<void> {
    if (this.started) return;
    this.workspaceId = workspaceId;

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

    this.docs.set(docId, yDoc);

    // Load doc from server
    const { missing, timestamp } = await this.provider.loadDoc(this.workspaceId, docId);

    // Apply server state to Yjs doc
    if (missing.length > 0) {
      Y.applyUpdate(yDoc, missing, NBSTORE_ORIGIN);
    }

    // Cache in IDB
    if (missing.length > 0) {
      await this.idb.saveSnapshot(this.workspaceId, docId, missing);
    }

    // Subscribe to local Yjs updates
    const handleUpdate = (update: Uint8Array, origin: any) => {
      if (origin === NBSTORE_ORIGIN) return;
      this.idb.saveUpdate(this.workspaceId, docId, update);
      this.provider.pushDocUpdate(this.workspaceId, docId, update);
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
    this.idb.saveUpdate(this.workspaceId, data.docId, updateBinary);
  }
}
