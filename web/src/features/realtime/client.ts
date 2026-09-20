type Envelope = { type: string; requestId?: string; itemId?: string; payload?: unknown };
type Handler = (message: Envelope) => void;

export class RealtimeClient {
  private socket?: WebSocket;
  private listeners = new Set<Handler>();
  private queue: string[] = [];
  private reconnectTimer?: number;
  private stopped = false;
  state: 'connecting' | 'online' | 'offline' = 'connecting';

  constructor() { this.connect(); }

  private connect() {
    if (this.stopped) return;
    this.state = 'connecting';
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = new WebSocket(`${scheme}://${location.host}/ws`);
    this.socket.onopen = () => { this.state = 'online'; for (const message of this.queue.splice(0)) this.socket?.send(message); this.emit({ type: 'connection.changed', payload: { state: this.state } }); };
    this.socket.onmessage = (event) => { try { this.emit(JSON.parse(event.data) as Envelope); } catch { /* ignore malformed server frames */ } };
    this.socket.onclose = () => { this.state = 'offline'; this.emit({ type: 'connection.changed', payload: { state: this.state } }); if (!this.stopped) this.reconnectTimer = window.setTimeout(() => this.connect(), 1200); };
  }

  private emit(message: Envelope) { for (const listener of this.listeners) listener(message); }
  subscribe(handler: Handler) { this.listeners.add(handler); return () => this.listeners.delete(handler); }
  send(type: string, itemId: string, payload: unknown = {}, requestId = crypto.randomUUID()) {
    const message = JSON.stringify({ type, itemId, payload, requestId });
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message); else this.queue.push(message);
    return requestId;
  }
  close() { this.stopped = true; window.clearTimeout(this.reconnectTimer); this.socket?.close(); }
}

export function toBase64(bytes: Uint8Array) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary);
}
export function fromBase64(value: string) {
  const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
