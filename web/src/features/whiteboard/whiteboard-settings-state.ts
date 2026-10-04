import { durableBoardAppState } from './whiteboard-scene';

type SettingChange = { value: unknown; requestId: string };
type SettingsBatch = { order: number; changes: Map<string, SettingChange> };

/** Scene settings need field-level ACK tracking independent of element edits. */
export class WhiteboardSettingsState {
  private changes = new Map<string, SettingChange>();
  private sent = new Map<string, SettingsBatch>();
  private sendOrder = 0;

  changed(previous: object, current: object, requestId: string) {
    const before = durableBoardAppState(previous);
    const after = durableBoardAppState(current);
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      const present = Object.hasOwn(after, key);
      if (
        Object.hasOwn(before, key) === present &&
        Object.is(before[key], after[key])
      )
        continue;
      this.changes.set(key, { value: after[key], requestId });
    }
  }

  merge(remote: object, current: object) {
    const merged = durableBoardAppState(remote);
    const local = durableBoardAppState(current);
    for (const key of this.changes.keys()) {
      if (Object.hasOwn(local, key)) merged[key] = local[key];
      else delete merged[key];
    }
    return merged;
  }

  sending(requestId: string) {
    // Repeating a complete-scene request keeps its original confirmation batch.
    if (!this.sent.has(requestId)) {
      this.sent.set(requestId, {
        order: ++this.sendOrder,
        changes: new Map(this.changes),
      });
    }
  }

  acknowledge(requestId: string | undefined) {
    const batch = requestId ? this.sent.get(requestId) : undefined;
    if (!batch) return false;
    for (const [key, confirmed] of batch.changes) {
      if (this.changes.get(key)?.requestId === confirmed.requestId)
        this.changes.delete(key);
    }
    for (const [id, sent] of this.sent) {
      if (sent.order <= batch.order) this.sent.delete(id);
    }
    return true;
  }
}
