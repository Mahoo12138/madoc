import { setPendingChanges } from '@/features/account/pending-changes';
import { configureFootnotes, footnotes, preserveFootnoteReferences } from './markdown-footnote';
import { footnoteDefinitionView } from './markdown-footnote-view';
import { blockMathNavigation } from './markdown-block-math';
import { codeHighlights, codeHighlightSchema } from './markdown-code-highlights';
import { configureEscapes, escapedText, preserveEscapes } from './markdown-escape';
import { Crepe } from '@milkdown/crepe';
import { inlineCodeSchema, remarkInlineLinkPlugin, remarkLineBreak } from '@milkdown/kit/preset/commonmark';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import { collab, collabServiceCtx } from '@milkdown/plugin-collab';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { api } from '@/api/client';
import type { Item, Role, User } from '@/api/types';
import { fromBase64, RealtimeClient, toBase64 } from '@/features/realtime/client';
import { activeBlockDecoration, comfortableMarkdownInput } from './markdown-input';
import { inlineSourceEditing } from './markdown-inline-source';
import type { InlineMathPreview } from './markdown-inline-presentation';
import { getMarkdownStats, type MarkdownStats } from './markdown-stats';
import './markdown-code-block.css';
import { markdownOutline } from './markdown-outline-plugin';
import type { MarkdownOutline } from './markdown-outline-model';
import { hardbreakIndicators } from './markdown-break';
import { asymmetricEmphasisInput } from './markdown-emphasis';
import { configureReferences, preserveReferences, referenceDefinition, resolveReferences } from './markdown-reference';
import { blockImageSource, inlineImageSource, configureImageSource } from './markdown-image-source';

type InitPayload = {
  snapshot?: string | null;
  updates?: { seq: number; update: string }[];
  headSeq: number;
  markdown: string;
};

type Collaborator = { color?: string; name?: string };
export type SaveStatus = 'Saving' | 'Saved' | 'Offline' | 'Reconnecting';

type MarkdownSessionOptions = {
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
        if (view.state.doc.rangeHasMark($from.start() + openingIndex, from, escapedText.type(ctx))) return false;

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
        transaction.replaceWith(spanFrom, cursor, transaction.doc.type.schema.text(content, [inlineCodeMark.create()]));
        transaction.setSelection(TextSelection.create(transaction.doc, spanFrom + content.length));
        view.dispatch(transaction);
        return true;
      },
    },
  });
});

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
  } = options;

  root.replaceChildren();
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  let pendingUpdates = 0;
  const pendingKey = `markdown:${item.id}`;
  const updateIdentity = (event: Event) => {
    const next = (event as CustomEvent<User>).detail;
    if (next.id === user.id) awareness.setLocalStateField('user', { id: next.id, name: next.name, color: '#1f6feb' });
  };
  window.addEventListener('madoc-profile-changed', updateIdentity);
  const realtime = new RealtimeClient();
  onRealtimeChange(realtime);
  awareness.setLocalStateField('user', { id: user.id, name: user.name, color: '#1f6feb' });

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
  const crepe = new Crepe({
    root,
    defaultValue: '',
    featureConfigs: {
      [Crepe.Feature.Cursor]: { virtual: false },
      [Crepe.Feature.CodeMirror]: {
        copyText: '复制代码',
        searchPlaceholder: '搜索语言',
        noResultText: '没有匹配的语言',
      },
      [Crepe.Feature.ImageBlock]: {
        onUpload: uploadImage,
        inlineOnUpload: uploadImage,
        blockOnUpload: uploadImage,
      },
      [Crepe.Feature.Placeholder]: { text: '输入 / 插入内容…', mode: 'block' },
      [Crepe.Feature.Toolbar]: {
        boldLabel: '加粗',
        italicLabel: '斜体',
        strikethroughLabel: '删除线',
        codeLabel: '行内代码',
        latexLabel: '行内公式',
        linkLabel: '链接',
      },
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          label: '文本',
          text: { label: '正文' },
          h1: { label: '一级标题' },
          h2: { label: '二级标题' },
          h3: { label: '三级标题' },
          h4: { label: '四级标题' },
          h5: { label: '五级标题' },
          h6: { label: '六级标题' },
          quote: { label: '引用' },
          divider: { label: '分隔线' },
        },
        listGroup: {
          label: '列表',
          bulletList: { label: '无序列表' },
          orderedList: { label: '有序列表' },
          taskList: { label: '任务列表' },
        },
        advancedGroup: {
          label: '插入',
          image: { label: '图片' },
          codeBlock: { label: '代码块' },
          table: { label: '表格' },
          math: { label: '公式' },
        },
      },
    },
  });
  void crepe.editor.remove(remarkInlineLinkPlugin);
  // Preserve escapes before line-break normalization discards text positions.
  void crepe.editor.remove(remarkLineBreak);
  crepe.editor
    .use(codeHighlightSchema)
    .use(codeHighlights)
    .use(blockMathNavigation)
    .config(configureEscapes)
    .use(escapedText)
    .use(preserveFootnoteReferences)
    .use(preserveEscapes)
    .use(remarkLineBreak)
    .config(configureFootnotes)
    .use(footnotes)
    .use(footnoteDefinitionView)
    .config(configureReferences)
    .config(configureImageSource)
    .use(referenceDefinition)
    .use(preserveReferences)
    .use(resolveReferences)
    .use(hardbreakIndicators)
    .use(blockImageSource)
    .use(inlineImageSource)
    // Keep Crepe's math schema and renderer, replacing only its floating editor.
    .config((ctx) => {
      ctx.set('INLINE_LATEX_TOOLTIP_SPEC', {});
      // Existing links edit in place; keep the toolbar's add-link dialog.
      ctx.set('LINK_PREVIEW_TOOLTIP_SPEC', {});
    })
    .use(comfortableMarkdownInput)
    .use(asymmetricEmphasisInput)
    .use(inlineSourceEditing(onInlinePreviewChange))
    .use(markdownOutline(item.id, onOutlineChange))
    .use(activeBlockDecoration)
    .use(doubleBacktickInput)
    .use(collab);

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
    if (role === 'viewer' || !editorReady) return;
    window.clearTimeout(cacheTimer);
    realtime.send('markdown.cache.update', item.id, { markdown: latestMarkdown, seenSeq: headSeq });
  };
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
    onStatusChange(realtime.state === 'online' ? 'Saving' : 'Offline');
    window.clearTimeout(cacheTimer);
    cacheTimer = window.setTimeout(flushMarkdownCache, 1200);
  }));

  const unsubscribe = realtime.subscribe((message) => {
    if (message.type === 'connection.changed') {
      const state = (message.payload as { state: string }).state;
      onStatusChange(state === 'online' || state === 'connecting' ? 'Reconnecting' : 'Offline');
      if (state === 'online') realtime.send('markdown.join', item.id);
    }
    if (message.itemId !== item.id) return;
    if (message.type === 'markdown.init') {
      const payload = message.payload as InitPayload;
      if (payload.snapshot) Y.applyUpdate(doc, fromBase64(payload.snapshot), 'remote');
      for (const update of payload.updates ?? []) Y.applyUpdate(doc, fromBase64(update.update), 'remote');
      headSeq = payload.headSeq ?? 0;
      latestMarkdown = payload.markdown ?? latestMarkdown;
      onStatsChange(getMarkdownStats(latestMarkdown));
      if (!initialResolved) {
        initialResolved = true;
        resolveInitial(payload);
      }
      onStatusChange('Saved');
    }
    if (message.type === 'markdown.update.remote') {
      const payload = message.payload as { seq: number; update: string };
      headSeq = Math.max(headSeq, payload.seq);
      Y.applyUpdate(doc, fromBase64(payload.update), 'remote');
    }
    if (message.type === 'markdown.update.ack') {
      pendingUpdates = Math.max(0, pendingUpdates - 1);
      setPendingChanges(pendingKey, pendingUpdates > 0);
      const payload = message.payload as { seq: number };
      headSeq = Math.max(headSeq, payload.seq);
      onStatusChange('Saved');
    }
    if (message.type === 'markdown.cache.ack') onStatusChange('Saved');
    if (message.type === 'markdown.snapshot.request' && role !== 'viewer') {
      const payload = message.payload as { baseSeq: number };
      realtime.send('markdown.snapshot.commit', item.id, {
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
  });

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote' && role !== 'viewer') {
      pendingUpdates += 1;
      setPendingChanges(pendingKey, true);
      realtime.send('markdown.update', item.id, { clientUpdateId: crypto.randomUUID(), update: toBase64(update) });
    }
  };
  const onAwareness = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin !== 'remote') {
      realtime.send('markdown.awareness', item.id, {
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
    crepe.setReadonly(role === 'viewer');
    editorReady = true;
    latestMarkdown = crepe.getMarkdown();
    onStatsChange(getMarkdownStats(latestMarkdown));
    scheduleEditorAffordances();
  });

  return () => {
    destroyed = true;
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
    awareness.destroy();
    doc.destroy();
    void crepe.destroy();
  };
}
