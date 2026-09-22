type Envelope = {
  type: string;
  requestId?: string;
  itemId?: string;
  payload?: unknown;
};
type Handler = (message: Envelope) => void;

class RealtimeConnection {
  private socket?: WebSocket;
  private listeners = new Set<Handler>();
  private queue: string[] = [];
  private reconnectTimer?: number;
  private stopped = false;
  state: 'connecting' | 'online' | 'offline' = 'connecting';

  constructor() {
    this.connect();
  }

  private connect() {
    if (this.stopped) return;
    this.state = 'connecting';
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = new WebSocket(`${scheme}://${location.host}/ws`);
    this.socket.onopen = () => {
      this.state = 'online';
      for (const message of this.queue.splice(0)) this.socket?.send(message);
      this.emit({ type: 'connection.changed', payload: { state: this.state } });
    };
    this.socket.onmessage = (event) => {
      try {
        this.emit(JSON.parse(event.data) as Envelope);
      } catch {
        /* ignore malformed server frames */
      }
    };
    this.socket.onclose = (event) => {
      if (event.code === 1008) {
        this.stopped = true;
        location.assign('/sign-in');
        return;
      }
      this.state = 'offline';
      this.emit({ type: 'connection.changed', payload: { state: this.state } });
      if (!this.stopped)
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1200);
    };
  }

  private emit(message: Envelope) {
    for (const listener of this.listeners) listener(message);
  }
  subscribe(handler: Handler) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }
  send(
    type: string,
    itemId: string,
    payload: unknown = {},
    requestId: string = crypto.randomUUID(),
  ) {
    const message = JSON.stringify({ type, itemId, payload, requestId });
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
    else this.queue.push(message);
    return requestId;
  }
  sendOnline(
    type: string,
    itemId: string,
    payload: unknown = {},
    requestId: string = crypto.randomUUID(),
  ) {
    if (this.stopped || this.socket?.readyState !== WebSocket.OPEN)
      return false;
    this.socket.send(JSON.stringify({ type, itemId, payload, requestId }));
    return true;
  }
  close() {
    this.stopped = true;
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
}

let shared: { connection: RealtimeConnection; leases: number } | undefined;

// Each feature owns its listeners and rooms; closing an editor releases its
// lease without disconnecting workspace metadata or another mounted feature.
export class RealtimeClient {
  private shared = (shared ??= {
    connection: new RealtimeConnection(),
    leases: 0,
  });
  private listeners = new Set<Handler>();
  private rooms = new Set<string>();
  private stopped = false;
  private unsubscribe: () => void;
  constructor() {
    this.shared.leases++;
    this.unsubscribe = this.shared.connection.subscribe((message) => {
      for (const listener of this.listeners) listener(message);
    });
  }
  get state() {
    return this.shared.connection.state;
  }
  subscribe(handler: Handler) {
    this.listeners.add(handler);
    queueMicrotask(() => {
      if (
        !this.stopped &&
        this.listeners.has(handler) &&
        this.state === 'online'
      )
        handler({ type: 'connection.changed', payload: { state: 'online' } });
    });
    return () => this.listeners.delete(handler);
  }
  rejectItem(itemId: string) {
    for (const listener of this.listeners)
      listener({ type: 'error', itemId, payload: { code: 'FORBIDDEN' } });
  }
  send(
    type: string,
    itemId: string,
    payload: unknown = {},
    requestId: string = crypto.randomUUID(),
  ) {
    if (this.stopped) return requestId;
    if (type.endsWith('.join')) this.rooms.add(itemId);
    if (type === 'room.leave') this.rooms.delete(itemId);
    return this.shared.connection.send(type, itemId, payload, requestId);
  }
  sendOnline(
    type: string,
    itemId: string,
    payload: unknown = {},
    requestId: string = crypto.randomUUID(),
  ) {
    if (this.stopped) return false;
    if (type.endsWith('.join')) this.rooms.add(itemId);
    if (type === 'room.leave') this.rooms.delete(itemId);
    return this.shared.connection.sendOnline(type, itemId, payload, requestId);
  }
  close() {
    if (this.stopped) return;
    this.stopped = true;
    for (const itemId of this.rooms)
      this.shared.connection.sendOnline('room.leave', itemId);
    this.rooms.clear();
    this.unsubscribe();
    this.listeners.clear();
    if (--this.shared.leases === 0) {
      this.shared.connection.close();
      if (shared === this.shared) shared = undefined;
    }
  }
}

export function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
