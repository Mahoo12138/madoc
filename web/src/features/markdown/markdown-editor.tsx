import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Group, Loader, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Crepe } from '@milkdown/crepe';
import { inlineCodeSchema } from '@milkdown/kit/preset/commonmark';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import { collab, collabServiceCtx } from '@milkdown/plugin-collab';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { Download as IconDownload, FileInput as IconFileImport, Wifi as IconWifi, WifiOff as IconWifiOff } from 'lucide-react';
import { api } from '@/api/client';
import { useMarkdown, useWorkspaceMutations } from '@/api/hooks';
import type { Item, Role, User } from '@/api/types';
import { fromBase64, RealtimeClient, toBase64 } from '@/features/realtime/client';
import * as styles from './markdown-editor.css';

type InitPayload = { snapshot?: string | null; updates?: { seq: number; update: string }[]; headSeq: number; markdown: string };
type Collaborator = { color?: string; name?: string };

// Keep the single-backtick input rule from consuming a literal backtick inside a double-delimited span.
const doubleBacktickInput = $prose((ctx) => {
  const inlineCodeMark = inlineCodeSchema.type(ctx);
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== '`' || from !== to) return false;
        const $from = view.state.doc.resolve(from);
        if ($from.parent.type.spec.code) return false;
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n');
        const openingIndex = textBefore.indexOf('``');
        if (openingIndex < 0) return false;

        const transaction = view.state.tr.insertText(text, from, to);
        const cursor = transaction.selection.from;
        const $cursor = transaction.doc.resolve(cursor);
        const blockText = $cursor.parent.textBetween(0, $cursor.parentOffset, '\n', '\n');
        if (!blockText.endsWith('``')) {
          view.dispatch(transaction);
          return true;
        }

        const content = blockText.slice(openingIndex + 2, -2);
        if (!content.trim()) {
          view.dispatch(transaction);
          return true;
        }

        const blockStart = $cursor.start($cursor.depth);
        const spanFrom = blockStart + openingIndex;
        const spanTo = cursor;
        transaction.replaceWith(spanFrom, spanTo, transaction.doc.type.schema.text(content, [inlineCodeMark.create()]));
        transaction.setSelection(TextSelection.create(transaction.doc, spanFrom + content.length));
        view.dispatch(transaction);
        return true;
      },
    },
  });
});

// Crepe's virtual cursor can decouple browser selection from ProseMirror state, so this stays DOM-driven.
function updateActiveMarkDecorations(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.madoc-active-mark').forEach((element) => {
    element.classList.remove('madoc-active-mark');
    element.removeAttribute('data-mark-name');
  });

  const selection = document.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode || !root.contains(selection.anchorNode)) return;

  const activeMarks = new Set<HTMLElement>();
  const addMarksFromNode = (node: Node | null) => {
    let element = node instanceof Element ? node : node?.parentElement;
    while (element && element !== root) {
      if (element.matches('strong, em')) activeMarks.add(element as HTMLElement);
      element = element.parentElement;
    }
  };

  addMarksFromNode(selection.anchorNode);
  if (activeMarks.size === 0) {
    const container = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
    if (container) {
      addMarksFromNode(container.childNodes[selection.anchorOffset - 1] ?? null);
      addMarksFromNode(container.childNodes[selection.anchorOffset] ?? null);
    }
  }

  activeMarks.forEach((element) => {
    element.classList.add('madoc-active-mark');
    element.dataset.markName = element.tagName.toLowerCase();
  });
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

export function MarkdownEditor({ item, role, user }: { item: Item; role: Role; user: User }) {
  const initial = useMarkdown(item.id); const mutations = useWorkspaceMutations(item.workspaceId);
  const rootRef = useRef<HTMLDivElement>(null); const importRef = useRef<HTMLInputElement>(null);
  const realtimeRef = useRef<RealtimeClient>();
  const [status, setStatus] = useState<'Saving' | 'Saved' | 'Offline' | 'Reconnecting'>('Reconnecting');
  const [presence, setPresence] = useState(1); const [title, setTitle] = useState(item.title);

  useEffect(() => {
    if (!rootRef.current || !initial.data) return;
    const root = rootRef.current; root.replaceChildren();
    const doc = new Y.Doc(); const awareness = new Awareness(doc); const realtime = new RealtimeClient(); realtimeRef.current = realtime;
    awareness.setLocalStateField('user', { id: user.id, name: user.name, color: '#1f6feb' });
    let headSeq = initial.data.cacheSeq ?? 0; let cacheTimer = 0; let destroyed = false;
    let resolveInitial!: (payload: InitPayload) => void; let initialResolved = false;
    const initialReady = new Promise<InitPayload>((resolve) => { resolveInitial = resolve; });
    const crepe = new Crepe({ root, defaultValue: '', featureConfigs: { [Crepe.Feature.ImageBlock]: { onUpload: (file) => api.uploadAsset(item.workspaceId, file, item.id).then((r) => r.url), inlineOnUpload: (file) => api.uploadAsset(item.workspaceId, file, item.id).then((r) => r.url), blockOnUpload: (file) => api.uploadAsset(item.workspaceId, file, item.id).then((r) => r.url) } }, features: { [Crepe.Feature.Latex]: true } });
    crepe.editor.use(doubleBacktickInput);
    let activeMarkFrame = 0;
    const onSelectionChange = () => {
      window.cancelAnimationFrame(activeMarkFrame);
      activeMarkFrame = window.requestAnimationFrame(() => {
        activeMarkFrame = window.requestAnimationFrame(() => updateActiveMarkDecorations(root));
      });
    };
    const markObserver = new MutationObserver(onSelectionChange);
    markObserver.observe(root, { childList: true, subtree: true });
    document.addEventListener('selectionchange', onSelectionChange);
    root.addEventListener('keyup', onSelectionChange);
    root.addEventListener('mouseup', onSelectionChange);
    crepe.editor.use(collab);
    crepe.on((listener) => listener.markdownUpdated((_ctx, markdown, previous) => {
      if (markdown === previous || role === 'viewer') return;
      setStatus(realtime.state === 'online' ? 'Saving' : 'Offline'); window.clearTimeout(cacheTimer);
      cacheTimer = window.setTimeout(() => realtime.send('markdown.cache.update', item.id, { markdown, seenSeq: headSeq }), 1200);
    }));
    const unsubscribe = realtime.subscribe((message) => {
      if (message.type === 'connection.changed') {
        const state = (message.payload as { state: string }).state; setStatus(state === 'online' ? 'Reconnecting' : state === 'connecting' ? 'Reconnecting' : 'Offline');
        if (state === 'online') realtime.send('markdown.join', item.id);
      }
      if (message.itemId !== item.id) return;
      if (message.type === 'markdown.init') {
        const payload = message.payload as InitPayload;
        if (payload.snapshot) Y.applyUpdate(doc, fromBase64(payload.snapshot), 'remote');
        for (const update of payload.updates ?? []) Y.applyUpdate(doc, fromBase64(update.update), 'remote');
        headSeq = payload.headSeq ?? 0;
        if (!initialResolved) { initialResolved = true; resolveInitial(payload); }
        setStatus('Saved');
      }
      if (message.type === 'markdown.update.remote') { const p = message.payload as { seq: number; update: string }; headSeq = Math.max(headSeq, p.seq); Y.applyUpdate(doc, fromBase64(p.update), 'remote'); }
      if (message.type === 'markdown.update.ack') { const p = message.payload as { seq: number }; headSeq = Math.max(headSeq, p.seq); setStatus('Saved'); }
      if (message.type === 'markdown.cache.ack') setStatus('Saved');
      if (message.type === 'markdown.snapshot.request' && role !== 'viewer') { const p = message.payload as { baseSeq: number }; realtime.send('markdown.snapshot.commit', item.id, { baseSeq: p.baseSeq, snapshot: toBase64(Y.encodeStateAsUpdate(doc)), markdown: crepe.getMarkdown() }); }
      if (message.type === 'markdown.awareness') { const p = message.payload as { update?: string }; if (p.update) applyAwarenessUpdate(awareness, fromBase64(p.update), 'remote'); }
      if (message.type === 'presence.changed') { const p = message.payload as { members?: unknown[] }; setPresence(p.members?.length ?? 1); }
    });
    const onDocUpdate = (update: Uint8Array, origin: unknown) => { if (origin !== 'remote' && role !== 'viewer') realtime.send('markdown.update', item.id, { clientUpdateId: crypto.randomUUID(), update: toBase64(update) }); };
    const onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => { if (origin !== 'remote') realtime.send('markdown.awareness', item.id, { update: toBase64(encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])) }); };
    doc.on('update', onDocUpdate); awareness.on('update', onAwareness);
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
      crepe.setReadonly(role === 'viewer');
    });
    return () => { destroyed = true; window.clearTimeout(cacheTimer); window.cancelAnimationFrame(activeMarkFrame); markObserver.disconnect(); document.removeEventListener('selectionchange', onSelectionChange); root.removeEventListener('keyup', onSelectionChange); root.removeEventListener('mouseup', onSelectionChange); realtime.send('room.leave', item.id); unsubscribe(); realtime.close(); doc.off('update', onDocUpdate); awareness.off('update', onAwareness); awareness.destroy(); doc.destroy(); void crepe.destroy(); };
  }, [item.id, initial.data?.markdown, role, user.id]);

  const rename = async () => { if (title.trim() && title !== item.title && role !== 'viewer') await mutations.renameItem.mutateAsync({ id: item.id, title }); };
  const importMarkdown = async (file?: File) => { if (!file) return; try { const markdown = await file.text(); realtimeRef.current?.close(); await new Promise((resolve) => window.setTimeout(resolve, 150)); await api.resetMarkdown(item.id, '', markdown); location.reload(); } catch (error) { notifications.show({ color: 'red', message: error instanceof Error ? error.message : '导入失败。请关闭其他协作窗口后重试。' }); } };
  if (initial.isLoading) return <div className={styles.page}><Loader size="sm" /></div>;
  return <article className={styles.page}><input className={styles.title} value={title} readOnly={role === 'viewer'} onChange={(e) => setTitle(e.currentTarget.value)} onBlur={rename} aria-label="文档标题" /><div className={styles.meta}><Group gap="xs"><Badge variant="light" color={status === 'Saved' ? 'green' : status === 'Offline' ? 'red' : 'blue'} leftSection={status === 'Offline' ? <IconWifiOff size={12} /> : <IconWifi size={12} />}>{status}</Badge><Text size="xs">{presence} 人在线</Text></Group><Group gap={4}>{role !== 'viewer' && <Tooltip label="导入 Markdown"><ActionIcon onClick={() => importRef.current?.click()}><IconFileImport size={17} /></ActionIcon></Tooltip>}<Tooltip label="导出 Markdown"><ActionIcon component="a" href={`/api/items/${item.id}/export.md`} download={`${item.title}.md`}><IconDownload size={17} /></ActionIcon></Tooltip><input ref={importRef} type="file" accept=".md,text/markdown" hidden onChange={(e) => void importMarkdown(e.target.files?.[0])} /></Group></div><div ref={rootRef} className={styles.editor} /></article>;
}
