import { reconcileElements } from '@excalidraw/excalidraw';
import type { BoardScene, WhiteboardState } from '@/api/types';
import { WhiteboardOutbox, type WhiteboardDraft } from './whiteboard-outbox';

type Reference = Pick<WhiteboardDraft, 'key' | 'id'>;

export class WhiteboardDrafts {
  private chain = Promise.resolve();
  private recovered: Reference[] = [];
  private current?: WhiteboardDraft;
  private confirmed = new Map<string, Reference[]>();
  private persistedId?: string;
  private writeVersion = 0;

  constructor(private outbox: WhiteboardOutbox) {}

  async load(server: WhiteboardState, readonly: boolean) {
    const records = (await this.outbox.load()).sort((a, b) => a.updatedAt - b.updatedAt || a.key.localeCompare(b.key));
    this.recovered = records;
    const rollback = records.some(record => record.baseRevision > server.revision);
    let scene: BoardScene = rollback ? { elements: [], appState: {}, files: {} } : structuredClone(server.scene);
    for (const record of records) {
      scene = {
        elements: reconcileElements(scene.elements as never[], record.scene.elements as never[], {} as never),
        appState: { ...scene.appState, ...record.scene.appState },
        files: { ...scene.files, ...record.scene.files },
      };
    }
    const failure = rollback ? '服务器白板版本早于本地草稿，已停止自动合并。请先下载本地副本。' : readonly && records.length ? '此设备有未提交白板修改，但当前账号没有编辑权限。请下载本地副本。' : undefined;
    const requestId = records.length === 1 ? records[0].id : records.length ? crypto.randomUUID() : undefined;
    this.persistedId = requestId;
    return { scene, requestId, failure };
  }

  safe(id: string | undefined) { return !id || id === this.persistedId; }
  settle() { return this.chain; }

  persist(id: string, revision: number, scene: BoardScene) {
    const captured = structuredClone(scene);
    const ticket = ++this.writeVersion;
    this.persistedId = undefined;
    const task = this.chain.then(async () => {
      this.current = await this.outbox.save(id, revision, captured);
      if (ticket === this.writeVersion) this.persistedId = id;
    });
    this.chain = task.catch(() => {});
    return task;
  }

  sending(id: string) {
    if (this.current?.id === id) this.confirmed.set(id, [...this.recovered, { key: this.current.key, id }]);
  }

  acknowledge(id: string) {
    const references = this.confirmed.get(id);
    if (!references) return Promise.resolve();
    const task = this.chain.then(async () => {
      await this.outbox.confirm(references);
      this.recovered = this.recovered.filter(record => !references.some(ref => ref.key === record.key && ref.id === record.id));
      this.confirmed.delete(id);
    });
    this.chain = task.catch(() => {});
    return task;
  }
}
