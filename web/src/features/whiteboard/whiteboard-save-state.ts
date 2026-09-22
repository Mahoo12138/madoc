// Whiteboard updates are complete scenes. An ACK for a later local version
// confirms earlier versions too; unrelated/duplicate ACKs confirm nothing.
export class WhiteboardSaveState {
  private version = 0;
  private confirmed = 0;
  private latest?: { id: string; version: number };
  private sent = new Map<string, number>();

  get pending() { return this.confirmed < this.version; }
  get requestId() { return this.pending ? this.latest?.id : undefined; }

  changed() {
    this.latest = { id: crypto.randomUUID(), version: ++this.version };
  }

  sending(id: string) {
    if (id === this.latest?.id) this.sent.set(id, this.latest.version);
  }

  acknowledge(id: string | undefined) {
    const version = id ? this.sent.get(id) : undefined;
    if (version === undefined) return false;
    this.confirmed = Math.max(this.confirmed, version);
    for (const [key, value] of this.sent) if (value <= this.confirmed) this.sent.delete(key);
    return true;
  }
}
