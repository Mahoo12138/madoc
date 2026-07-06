import { io, Socket } from 'socket.io-client';
import type { DocUpdateBroadcast, AwarenessBroadcast, LoadDocResult } from './types';
import { base64ToUint8Array, uint8ArrayToBase64 } from './types';

type BroadcastHandler = (data: DocUpdateBroadcast) => void;
type AwarenessHandler = (data: AwarenessBroadcast) => void;

export class SocketProvider {
  private socket: Socket | null = null;
  private broadcastHandlers: BroadcastHandler[] = [];
  private awarenessHandlers: AwarenessHandler[] = [];
  private ackTimeout = 10000;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io('/', {
        transports: ['polling'],
        upgrade: false,
        withCredentials: true,
        autoConnect: false,
      });

      const timeout = setTimeout(() => {
        reject(new Error('Socket connection timeout'));
      }, this.ackTimeout);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        if (!this.socket?.connected) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.socket.on('space:broadcast-doc-update', (data: DocUpdateBroadcast) => {
        this.broadcastHandlers.forEach(h => h(data));
      });

      this.socket.on('space:broadcast-awareness-update', (data: AwarenessBroadcast) => {
        this.awarenessHandlers.forEach(h => h(data));
      });

      this.socket.connect();
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.broadcastHandlers = [];
    this.awarenessHandlers = [];
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  private ensureConnected(): Socket {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    return this.socket;
  }

  private async emitWithAck<T>(event: string, payload: unknown): Promise<T> {
    const sock = this.ensureConnected();
    const result = await sock.timeout(this.ackTimeout).emitWithAck(event, payload) as
      | T
      | { error?: { message?: string } };

    if (
      result &&
      typeof result === 'object' &&
      'error' in result &&
      result.error
    ) {
      throw new Error(result.error.message ?? `${event} failed`);
    }

    return result as T;
  }

  // Space events

  async joinWorkspace(workspaceId: string): Promise<{ clientId: string }> {
    return this.emitWithAck<{ clientId: string }>('space:join', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      clientVersion: '0.1.0',
    });
  }

  leaveWorkspace(workspaceId: string): void {
    this.socket?.emit('space:leave', {
      spaceType: 'workspace',
      spaceId: workspaceId,
    });
  }

  // Doc events

  async pushDocUpdate(
    workspaceId: string,
    docId: string,
    update: Uint8Array
  ): Promise<{ timestamp: number }> {
    return this.emitWithAck<{ timestamp: number }>('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
      update: uint8ArrayToBase64(update),
    });
  }

  async loadDoc(
    workspaceId: string,
    docId: string
  ): Promise<LoadDocResult> {
    const result = await this.emitWithAck<{
      missing: string;
      snapshot?: string;
      updates?: string[];
      state: string;
      timestamp: number;
    }>('space:load-doc', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
    });

    return {
      missing: result.missing ? base64ToUint8Array(result.missing) : new Uint8Array(),
      snapshot: result.snapshot ? base64ToUint8Array(result.snapshot) : new Uint8Array(),
      updates: Array.isArray(result.updates)
        ? result.updates
            .filter((update): update is string => typeof update === 'string' && update.length > 0)
            .map(base64ToUint8Array)
        : [],
      state: result.state ? base64ToUint8Array(result.state) : new Uint8Array(),
      timestamp: result.timestamp,
    };
  }

  async loadDocTimestamps(workspaceId: string): Promise<Record<string, number>> {
    return this.emitWithAck<Record<string, number>>('space:load-doc-timestamps', {
      spaceType: 'workspace',
      spaceId: workspaceId,
    });
  }

  async deleteDoc(workspaceId: string, docId: string): Promise<{ success: boolean }> {
    return this.emitWithAck<{ success: boolean }>('space:delete-doc', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
    });
  }

  // Broadcast subscriptions

  onBroadcastUpdate(handler: BroadcastHandler): () => void {
    this.broadcastHandlers.push(handler);
    return () => {
      const idx = this.broadcastHandlers.indexOf(handler);
      if (idx >= 0) this.broadcastHandlers.splice(idx, 1);
    };
  }

  // Awareness

  updateAwareness(workspaceId: string, docId: string, update: Uint8Array): void {
    this.socket?.emit('space:update-awareness', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
      awarenessUpdate: uint8ArrayToBase64(update),
    });
  }

  joinAwareness(workspaceId: string, docId: string): void {
    this.socket?.emit('space:join-awareness', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
      clientVersion: '0.1.0',
    });
  }

  leaveAwareness(workspaceId: string, docId: string): void {
    this.socket?.emit('space:leave-awareness', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
    });
  }

  loadAwareness(workspaceId: string, docId: string): void {
    this.socket?.emit('space:load-awarenesses', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
    });
  }

  onBroadcastAwareness(handler: AwarenessHandler): () => void {
    this.awarenessHandlers.push(handler);
    return () => {
      const idx = this.awarenessHandlers.indexOf(handler);
      if (idx >= 0) this.awarenessHandlers.splice(idx, 1);
    };
  }
}
