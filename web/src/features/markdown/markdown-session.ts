import type { MarkdownExportSource } from './markdown-export';
import { MarkdownOutbox } from './markdown-outbox';
import { MarkdownSaveState, type SaveStatus } from './markdown-save-state';
import { createMarkdownCrepe } from './markdown-session-editor';
import { setPendingChanges } from '@/features/account/pending-changes';
import { collabServiceCtx } from '@milkdown/plugin-collab';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { api } from '@/api/client';
import type { Item, Role, User } from '@/api/types';
import { fromBase64, RealtimeClient, toBase64 } from '@/features/realtime/client';
import { getMarkdownStats, type MarkdownStats } from './markdown-stats';
import type { InlineMathPreview } from './markdown-inline-presentation';
import type { MarkdownOutline } from './markdown-outline-model';

type InitPayload = {
  generation: number;
  snapshot?: string | null;
  updates?: { seq: number; update: string }[];
  headSeq: number;
  markdown: string;
};

type Collaborator = { color?: string; name?: string };
export type { SaveStatus } from './markdown-save-state';

type MarkdownSessionOptions = {
  onReady: () => void;
  onExportReady: (source?: MarkdownExportSource) => void;
  onFailure: (message: string, download: () => void, retry?: () => void) => void;
  onRecovered: () => void;
  onLeaveGuardChange: (guard: { unsafe: () => boolean; settle: () => Promise<void> }) => void;
  onOutlineChange: (outline: MarkdownOutline | null) => void;
  root: HTMLElement;
  item: Item;
  role: Role;
  user: User;
  initialMarkdown: string;
  initialCacheSeq: number;
  isTypewriterMode: () => boolean;
  onFocusModeShortcut: () => void;
  onPresenceChange: (presence: number) => void;
  onRealtimeChange: (client?: RealtimeClient) => void;
  onStatsChange: (stats: MarkdownStats) => void;
  onStatusChange: (status: SaveStatus) => void;
  onInlinePreviewChange: (preview: InlineMathPreview | null) => void;
};

function findActiveBlock(root: HTMLElement) {
  const selection = document.getSelection();
  if (!selection?.anchorNode || !root.contains(selection.anchorNode)) return null;
  const editor = root.querySelector<HTMLElement>('.ProseMirror');
  if (!editor) return null;

  let element = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement;
  while (element && element.parentElement !== editor) element = element.parentElement;
  return element?.parentElement === editor ? element as HTMLElement : null;
}

function buildRemoteCursor(user: Collaborator) {
  const cursor = document.createElement('span');
  cursor.className = 'madoc-remote-cursor';
  cursor.style.setProperty('--madoc-remote-color', user.color ?? '#1f6feb');
  cursor.setAttribute('aria-label', `${user.name ?? '协作者'} 的光标`);
  const label = document.createElement('span');
  label.className = 'madoc-remote-cursor-label';
  label.textContent = user.name ?? '协作者';
  cursor.append(label);
  return cursor;
}

function buildRemoteSelection(user: Collaborator) {
  return {
    class: 'madoc-remote-selection',
    style: `--madoc-remote-color: ${user.color ?? '#1f6feb'};`,
  };
}

export function startMarkdownSession(options: MarkdownSessionOptions) {
  const {
    root,
    item,
    role,
    user,
    initialMarkdown,
    initialCacheSeq,
    isTypewriterMode,
    onFocusModeShortcut,
    onPresenceChange,
    onRealtimeChange,
    onStatsChange,
    onStatusChange,
    onInlinePreviewChange,
    onOutlineChange,
    onFailure,
    onExportReady,
    onRecovered,
    onLeaveGuardChange,
  } = options;

  root.replaceChildren();
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const saveState = new MarkdownSaveState();
  const outbox = new MarkdownOutbox(location.origin, user.id, item.workspaceId, item.id, item.title);
  const pending = new Map<string, { update: Uint8Array; persisted: boolean; sentAt: number }>();
  let storageChain = Promise.resolve();
  let messageChain = Promise.resolve();
  let persistUpdates = false;
  let joined = false;
  let storedCount = 0;
  const pendingKey = `markdown:${item.id}`;
  const updateIdentity = (event: Event) => {
    const next = (event as CustomEvent<User>).detail;
    if (next.id === user.id) awareness.setLocalStateField('user', { id: next.id, name: next.name, color: '#1f6feb' });
  };
  window.addEventListener('madoc-profile-changed', updateIdentity);
  const realtime = new RealtimeClient();
  onRealtimeChange(realtime);
  const publishSaveStatus = () => {
    if (!destroyed) setPendingChanges(pendingKey, saveState.hasPendingUpdates);
    if (!destroyed) onStatusChange(saveState.status);
  };
  awareness.setLocalStateField('user', { id: user.id, name: user.name, color: '#1f6feb' });

  let generation: number | undefined;
  let halted = false;
  let headSeq = initialCacheSeq;
  let cacheTimer = 0;
  let activeMarkFrame = 0;
  let centerCursor = false;
  let latestMarkdown = initialMarkdown;
  let destroyed = false;
  let editorReady = false;
  let resolveInitial!: (payload: InitPayload) => void;
  let initialResolved = false;
  const initialReady = new Promise<InitPayload>((resolve) => { resolveInitial = resolve; });

  const uploadImage = (file: File) => api.uploadAsset(item.workspaceId, file, item.id).then((result) => result.url);
  const crepe = createMarkdownCrepe({ root, itemId: item.id, uploadImage, onInlinePreviewChange, onOutlineChange });

  const updateEditorAffordances = () => {
    const activeBlock = root.querySelector<HTMLElement>('.madoc-current-block') ?? findActiveBlock(root);
    if (activeBlock && centerCursor && isTypewriterMode()) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      activeBlock.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    centerCursor = false;
  };
  const scheduleEditorAffordances = (shouldCenter = false) => {
    centerCursor ||= shouldCenter;
    window.cancelAnimationFrame(activeMarkFrame);
    activeMarkFrame = window.requestAnimationFrame(() => {
      activeMarkFrame = window.requestAnimationFrame(updateEditorAffordances);
    });
  };
  const onSelectionChange = () => scheduleEditorAffordances();
  const onTyping = () => scheduleEditorAffordances(true);
  const onEditorKeyDown = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'f') return;
    event.preventDefault();
    onFocusModeShortcut();
    scheduleEditorAffordances();
  };

  const markObserver = new MutationObserver(() => scheduleEditorAffordances());
  markObserver.observe(root, { childList: true, subtree: true });
  document.addEventListener('selectionchange', onSelectionChange);
  root.addEventListener('keyup', onTyping);
  root.addEventListener('input', onTyping);
  root.addEventListener('mouseup', onSelectionChange);
  root.addEventListener('keydown', onEditorKeyDown);

  const flushMarkdownCache = () => {
    if (role === 'viewer' || !editorReady || halted || generation === undefined || !joined || saveState.hasPendingUpdates) return;
    window.clearTimeout(cacheTimer);
    realtime.sendOnline('markdown.cache.update', item.id, { markdown: crepe.getMarkdown(), seenSeq: headSeq, generation });
  };
  onExportReady({
    state: () => ({ ready: editorReady && !destroyed, online: joined && realtime.state === 'online', stopped: halted || destroyed, pending: saveState.hasPendingUpdates, generation, seq: headSeq }),
    flush: flushMarkdownCache,
    markdown: () => {
      if (!editorReady || destroyed) throw new Error('本地正文尚未准备完成。');
      return crepe.getMarkdown();
    },
  });
  const onPageHide = () => flushMarkdownCache();
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flushMarkdownCache();
  };
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);

  crepe.on((listener) => listener.markdownUpdated((_ctx, markdown, previous) => {
    latestMarkdown = markdown;
    onStatsChange(getMarkdownStats(markdown));
    if (markdown === previous || role === 'viewer') return;
    publishSaveStatus();
    window.clearTimeout(cacheTimer);
    cacheTimer = window.setTimeout(flushMarkdownCache, 1200);
  }));

  const halt = (message: string, retry?: () => void) => {
    halted = true;
    saveState.fail();
    crepe.setReadonly(true);
    publishSaveStatus();
    onFailure(message, () => {
      const markdown = editorReady ? crepe.getMarkdown() : latestMarkdown;
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${item.title}-本地副本.md`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, retry);
  };

  const sendPending = () => {
    if (destroyed || halted || !joined || generation === undefined || role === 'viewer') return;
    for (const [clientUpdateId, entry] of pending) {
      if (!entry.persisted || Date.now() - entry.sentAt < 2500) continue;
      if (realtime.sendOnline('markdown.update', item.id, { clientUpdateId, update: toBase64(entry.update), generation })) {
        entry.sentAt = Date.now();
      }
    }
  };
  const retryPersistence = async () => {
    if (destroyed || generation === undefined) return;
    try {
      if (!initialResolved) {
        halted = false;
        saveState.resume();
        onRecovered();
        realtime.sendOnline('markdown.join', item.id);
        return;
      }
      await storageChain;
      await outbox.saveRecovery(generation, Y.encodeStateAsUpdate(doc), [...pending].map(([id, entry]) => ({ id, update: entry.update })));
      for (const [id, entry] of pending) {
        entry.persisted = true;
        saveState.persisted(id);
      }
      halted = false;
      saveState.resume();
      crepe.setReadonly(role === 'viewer');
      onRecovered();
      joined = false;
      publishSaveStatus();
      realtime.sendOnline('markdown.join', item.id);
    } catch {
      storageFailed();
    }
  };
  const storageFailed = () => {
    if (!destroyed) halt('无法将修改保存到此设备。请重试本地保存，或下载本地副本；关闭页面可能丢失尚未保存的修改。', () => { void retryPersistence(); });
  };
  const persist = (update: Uint8Array, id: string, local: boolean) => {
    const targetGeneration = generation!;
    storageChain = storageChain.then(async () => {
      await outbox.append(targetGeneration, id, update, local);
      if (local) {
        const entry = pending.get(id);
        if (entry) entry.persisted = true;
        saveState.persisted(id);
        publishSaveStatus();
        sendPending();
      }
      if (++storedCount % 200 === 0) await outbox.compact(targetGeneration);
    }).catch(storageFailed);
  };
  onLeaveGuardChange({
    unsafe: () => saveState.hasUnpersistedUpdates,
    settle: () => storageChain,
  });
  const retryTimer = window.setInterval(sendPending, 1000);

  const unsubscribe = realtime.subscribe((message) => {
    messageChain = messageChain.then(async () => {
      if (destroyed) return;

      if (message.type === 'error' && (!message.itemId || message.itemId === item.id)) {
        const error = message.payload as { code: string };
        if (['FORBIDDEN', 'NOT_FOUND', 'INVALID_UPDATE', 'INVALID_REQUEST'].includes(error.code)) {
          halt('服务器拒绝了保存，可能是权限已变更、文档已删除或修改超过大小限制。请下载本地副本后重新打开文档。');
        }
        if (error.code === 'GENERATION_CHANGED' || error.code === 'GENERATION_REQUIRED') {
          halt('文档内容已被替换或服务已升级，保存已停止。请先下载本地副本，再刷新页面。');
        }
      }
      if (message.type === 'connection.changed') {
        const state = (message.payload as { state: 'online' | 'connecting' | 'offline' }).state;
        joined = false;
        saveState.connectionChanged(state);
        publishSaveStatus();
        if (state === 'online') realtime.send('markdown.join', item.id);
      }
      if (message.itemId !== item.id) return;
      if (message.type === 'markdown.init') {
        const payload = message.payload as InitPayload;
        if (!Number.isSafeInteger(payload.generation) || (generation !== undefined && generation !== payload.generation)) {
          halt('文档内容已被替换，保存已停止。请先下载本地副本，再刷新页面。');
          return;
        }
        if (halted) return;
        generation = payload.generation;
        if (!initialResolved) {
          const records = await outbox.load();
          if (destroyed) return;
          const stale = records.find(record => record.pending && !record.archived && record.generation !== generation);
          if (stale) {
            for (const record of records.filter(record => record.generation === stale.generation)) {
              Y.applyUpdate(doc, record.update, 'remote');
            }
            initialResolved = true;
            resolveInitial({ ...payload, markdown: '' });
            halt('此设备还有旧版本的未提交修改。文档已被替换，旧修改不会自动合并；请先下载本地副本。');
            return;
          }
          for (const record of records.filter(record => record.generation === generation && (role !== 'viewer' || records.some(entry => entry.generation === generation && entry.pending && !entry.archived)))) {
            Y.applyUpdate(doc, record.update, 'remote');
            if (record.pending && !record.archived) {
              pending.set(record.id, { update: record.update, persisted: true, sentAt: 0 });
              saveState.add(record.id, true);
            }
          }
          if (role === 'viewer' && pending.size > 0) {
            initialResolved = true;
            resolveInitial({ ...payload, markdown: '' });
            halt('此设备有未提交修改，但当前账号没有编辑权限。请下载本地副本。');
            return;
          }
        }
        if (!editorReady) persistUpdates = false;
        const serverUpdates = [
          ...(payload.snapshot ? [fromBase64(payload.snapshot)] : []),
          ...(payload.updates ?? []).map(update => fromBase64(update.update)),
        ];
        const serverSnapshot = Y.mergeUpdates(serverUpdates);
        Y.applyUpdate(doc, serverSnapshot, 'remote');
        headSeq = payload.headSeq ?? 0;
        if (!editorReady) latestMarkdown = payload.markdown ?? latestMarkdown;
        else latestMarkdown = crepe.getMarkdown();
        await storageChain;
        if (role !== 'viewer') await outbox.append(generation, crypto.randomUUID(), serverSnapshot, false);
        if (destroyed) return;
        persistUpdates = true;
        joined = true;
        for (const entry of pending.values()) entry.sentAt = 0;
        onStatsChange(getMarkdownStats(latestMarkdown));
        if (!initialResolved) {
          initialResolved = true;
          resolveInitial(payload);
        }
        saveState.initialized();
        publishSaveStatus();
        sendPending();
      }
      if (message.type === 'markdown.update.remote' && !halted) {
        const payload = message.payload as { seq: number; update: string; generation: number };
        if (payload.generation !== generation) {
          halt('文档内容已被替换，保存已停止。请先下载本地副本，再刷新页面。');
          return;
        }
        headSeq = Math.max(headSeq, payload.seq);
        Y.applyUpdate(doc, fromBase64(payload.update), 'remote');
      }
      if (message.type === 'markdown.update.ack') {
        const payload = message.payload as { clientUpdateId: string; seq: number; generation: number };
        if (payload.generation !== generation || halted) return;
        if (pending.has(payload.clientUpdateId)) {
          await storageChain;
          await outbox.acknowledge(generation!, payload.clientUpdateId);
          pending.delete(payload.clientUpdateId);
        }
        if (saveState.acknowledge(payload.clientUpdateId)) {
          headSeq = Math.max(headSeq, payload.seq);
        }
        publishSaveStatus();
      }
      if (message.type === 'markdown.update.ack' && !saveState.hasPendingUpdates) flushMarkdownCache();
      // Cache acknowledgements never confirm canonical Yjs updates.
      if (message.type === 'markdown.snapshot.request' && role !== 'viewer' && !halted && editorReady && !saveState.hasPendingUpdates) {
        const payload = message.payload as { baseSeq: number; generation: number };
        if (payload.generation !== generation || payload.baseSeq !== headSeq) return;
        realtime.sendOnline('markdown.snapshot.commit', item.id, {
          generation,
          baseSeq: payload.baseSeq,
          snapshot: toBase64(Y.encodeStateAsUpdate(doc)),
          markdown: crepe.getMarkdown(),
        });
      }
      if (message.type === 'markdown.awareness') {
        const payload = message.payload as { update?: string };
        if (payload.update) applyAwarenessUpdate(awareness, fromBase64(payload.update), 'remote');
      }
      if (message.type === 'presence.changed') {
        const payload = message.payload as { members?: { id: string; name: string }[] };
        const identity = payload.members?.find(member => member.id === user.id);
        const local = awareness.getLocalState()?.user;
        if (identity && identity.name !== local?.name) awareness.setLocalStateField('user', { ...local, name: identity.name });
        onPresenceChange(payload.members?.length ?? 1);
      }
    }).catch(storageFailed);
  });

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (!persistUpdates || halted || generation === undefined || role === 'viewer') return;
    const id = crypto.randomUUID();
    const local = origin !== 'remote';
    if (local) {
      pending.set(id, { update, persisted: false, sentAt: 0 });
      saveState.add(id);
      publishSaveStatus();
    }
    persist(update, id, local);
  };
  const onAwareness = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin !== 'remote') {
      realtime.sendOnline('markdown.awareness', item.id, {
        update: toBase64(encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])),
      });
    }
  };
  doc.on('update', onDocUpdate);
  awareness.on('update', onAwareness);

  void crepe.create().then(async () => {
    const payload = await initialReady;
    if (destroyed) return;
    crepe.editor.action((ctx) => {
      const service = ctx.get(collabServiceCtx)
        .setOptions({ yCursorOpts: { cursorBuilder: buildRemoteCursor, selectionBuilder: buildRemoteSelection } })
        .bindDoc(doc)
        .setAwareness(awareness);
      service.connect();
      if (doc.getXmlFragment('prosemirror').length === 0 && payload.markdown) service.applyTemplate(payload.markdown);
    });
    crepe.setReadonly(role === 'viewer' || halted);
    editorReady = true;
    options.onReady();
    latestMarkdown = crepe.getMarkdown();
    onStatsChange(getMarkdownStats(latestMarkdown));
    scheduleEditorAffordances();
  });

  return () => {
    destroyed = true;
    onExportReady(undefined);
    window.clearInterval(retryTimer);
    setPendingChanges(pendingKey, false);
    window.removeEventListener('madoc-profile-changed', updateIdentity);
    window.clearTimeout(cacheTimer);
    window.cancelAnimationFrame(activeMarkFrame);
    markObserver.disconnect();
    document.removeEventListener('selectionchange', onSelectionChange);
    root.removeEventListener('keyup', onTyping);
    root.removeEventListener('input', onTyping);
    root.removeEventListener('mouseup', onSelectionChange);
    root.removeEventListener('keydown', onEditorKeyDown);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    realtime.send('room.leave', item.id);
    unsubscribe();
    realtime.close();
    onRealtimeChange(undefined);
    doc.off('update', onDocUpdate);
    awareness.off('update', onAwareness);
    // Remove Yjs plugin bindings while Milkdown's editor context still exists.
    // Deferred awareness transactions must not target a destroyed editor.
    if (editorReady) crepe.editor.action((ctx) => ctx.get(collabServiceCtx).disconnect());
    awareness.destroy();
    doc.destroy();
    void crepe.destroy();
  };
}
