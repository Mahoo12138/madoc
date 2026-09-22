export type SaveStatus = 'Saving' | 'Saved' | 'Offline' | 'Reconnecting' | 'Error' | 'Local';

// Only a matching durable-update ACK can remove an outstanding local change.
export class MarkdownSaveState {
  private pending = new Set<string>();
  private unpersisted = new Set<string>();
  private connection: 'connecting' | 'online' | 'offline' = 'connecting';
  private ready = false;
  private failed = false;

  get hasPendingUpdates() {
    return this.pending.size > 0;
  }

  get status(): SaveStatus {
    if (this.failed) return 'Error';
    if (this.connection === 'offline') return this.hasPendingUpdates && this.unpersisted.size === 0 ? 'Local' : 'Offline';
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

  resume() { this.failed = false; }

  fail() {
    this.failed = true;
  }

  get hasUnpersistedUpdates() { return this.unpersisted.size > 0; }

  persisted(clientUpdateId: string) { this.unpersisted.delete(clientUpdateId); }

  add(clientUpdateId: string, persisted = false) {
    this.pending.add(clientUpdateId);
    if (!persisted) this.unpersisted.add(clientUpdateId);
  }

  acknowledge(clientUpdateId: string) {
    this.unpersisted.delete(clientUpdateId);
    return this.pending.delete(clientUpdateId);
  }
}
