export type SaveStatus = 'Saving' | 'Saved' | 'Offline' | 'Reconnecting';

// Only a matching durable-update ACK can remove an outstanding local change.
export class MarkdownSaveState {
  private pending = new Set<string>();
  private connection: 'connecting' | 'online' | 'offline' = 'connecting';
  private ready = false;

  get hasPendingUpdates() {
    return this.pending.size > 0;
  }

  get status(): SaveStatus {
    if (this.connection === 'offline') return 'Offline';
    if (this.connection !== 'online' || !this.ready) return 'Reconnecting';
    return this.hasPendingUpdates ? 'Saving' : 'Saved';
  }

  connectionChanged(state: 'connecting' | 'online' | 'offline') {
    this.connection = state;
    this.ready = false;
  }

  initialized() {
    this.ready = true;
  }

  add(clientUpdateId: string) {
    this.pending.add(clientUpdateId);
  }

  acknowledge(clientUpdateId: string) {
    return this.pending.delete(clientUpdateId);
  }
}
