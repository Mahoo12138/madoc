import { io, Socket } from 'socket.io-client';
import type { DocUpdateBroadcast, LoadDocResult } from './types';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class SyncClient {
  private socket: Socket | null = null;
  private broadcastHandlers: Array<(data: DocUpdateBroadcast) => void> = [];

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io('/', {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
      });

      this.socket.on('connect', () => {
        console.log('[SyncClient] Connected');
        resolve();
      });

      this.socket.on('connect_error', (err: Error) => {
        console.error('[SyncClient] Connection error:', err);
        reject(err);
      });

      this.socket.on('space:broadcast-doc-update', (data: DocUpdateBroadcast) => {
        this.broadcastHandlers.forEach(handler => handler(data));
      });

      this.socket.on('disconnect', () => {
        console.log('[SyncClient] Disconnected');
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.broadcastHandlers = [];
  }

  async joinWorkspace(workspaceId: string): Promise<{ clientId: string }> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit(
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspaceId,
          clientVersion: '0.1.0',
        },
        (response: { clientId: string }) => {
          resolve(response);
        }
      );

      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Join workspace timeout')), 5000);
    });
  }

  async leaveWorkspace(workspaceId: string): Promise<void> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    this.socket.emit('space:leave', {
      spaceType: 'workspace',
      spaceId: workspaceId,
    });
  }

  async pushDocUpdate(
    workspaceId: string,
    docId: string,
    update: Uint8Array
  ): Promise<{ timestamp: number }> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit(
        'space:push-doc-update',
        {
          spaceType: 'workspace',
          spaceId: workspaceId,
          docId,
          update: uint8ArrayToBase64(update),
        },
        (response: { timestamp: number }) => {
          resolve(response);
        }
      );

      setTimeout(() => reject(new Error('Push doc update timeout')), 10000);
    });
  }

  async loadDoc(
    workspaceId: string,
    docId: string,
    stateVector?: Uint8Array
  ): Promise<LoadDocResult> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const payload: Record<string, unknown> = {
        spaceType: 'workspace',
        spaceId: workspaceId,
        docId,
      };

      if (stateVector) {
        payload.stateVector = uint8ArrayToBase64(stateVector);
      }

      this.socket!.emit(
        'space:load-doc',
        payload,
        (response: { missing: string; state: string; timestamp: number }) => {
          resolve({
            missing: response.missing ? base64ToUint8Array(response.missing) : new Uint8Array(),
            state: response.state ? base64ToUint8Array(response.state) : new Uint8Array(),
            timestamp: response.timestamp,
          });
        }
      );

      setTimeout(() => reject(new Error('Load doc timeout')), 10000);
    });
  }

  async loadDocTimestamps(workspaceId: string): Promise<Record<string, number>> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit(
        'space:load-doc-timestamps',
        {
          spaceType: 'workspace',
          spaceId: workspaceId,
        },
        (response: Record<string, number>) => {
          resolve(response);
        }
      );

      setTimeout(() => reject(new Error('Load doc timestamps timeout')), 5000);
    });
  }

  async deleteDoc(workspaceId: string, docId: string): Promise<{ success: boolean }> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit(
        'space:delete-doc',
        {
          spaceType: 'workspace',
          spaceId: workspaceId,
          docId,
        },
        (response: { success: boolean }) => {
          resolve(response);
        }
      );

      setTimeout(() => reject(new Error('Delete doc timeout')), 5000);
    });
  }

  onBroadcastUpdate(handler: (data: DocUpdateBroadcast) => void): () => void {
    this.broadcastHandlers.push(handler);
    return () => {
      const index = this.broadcastHandlers.indexOf(handler);
      if (index !== -1) {
        this.broadcastHandlers.splice(index, 1);
      }
    };
  }
}
