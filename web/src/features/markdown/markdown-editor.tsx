import { useEffect, useRef, useState } from 'react';
import { Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '@/api/client';
import { useMarkdown, useWorkspaceMutations } from '@/api/hooks';
import type { Item, Role, User } from '@/api/types';
import type { RealtimeClient } from '@/features/realtime/client';
import { MarkdownEditorControls } from './markdown-editor-controls';
import { startMarkdownSession, type SaveStatus } from './markdown-session';
import { getMarkdownStats } from './markdown-stats';
import { MarkdownMathPreview } from './markdown-math-preview';
import type { InlineMathPreview } from './markdown-inline-presentation';
import * as styles from './markdown-editor.css';

const preferenceKeys = {
  focusMode: 'madoc.editor.focus-mode',
  typewriterMode: 'madoc.editor.typewriter-mode',
} as const;

function readPreference(key: string) {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writePreference(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Editor preferences are optional when storage is unavailable.
  }
}

export function MarkdownEditor({ item, role, user }: { item: Item; role: Role; user: User }) {
  const initial = useMarkdown(item.id);
  const mutations = useWorkspaceMutations(item.workspaceId);
  const rootRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const realtimeRef = useRef<RealtimeClient>();
  const typewriterModeRef = useRef(false);
  const [status, setStatus] = useState<SaveStatus>('Reconnecting');
  const [presence, setPresence] = useState(1);
  const [inlinePreview, setInlinePreview] = useState<InlineMathPreview | null>(null);
  const [title, setTitle] = useState(item.title);
  const [stats, setStats] = useState(() => getMarkdownStats(''));
  const [focusMode, setFocusMode] = useState(() => readPreference(preferenceKeys.focusMode));
  const [typewriterMode, setTypewriterMode] = useState(() => readPreference(preferenceKeys.typewriterMode));

  typewriterModeRef.current = typewriterMode;

  const toggleFocusMode = () => {
    setFocusMode((current) => {
      const next = !current;
      writePreference(preferenceKeys.focusMode, next);
      return next;
    });
  };

  const toggleTypewriterMode = () => {
    setTypewriterMode((current) => {
      const next = !current;
      typewriterModeRef.current = next;
      writePreference(preferenceKeys.typewriterMode, next);
      return next;
    });
  };

  useEffect(() => {
    setTitle(item.title);
  }, [item.id, item.title]);

  useEffect(() => {
    if (!rootRef.current || !initial.data) return;
    return startMarkdownSession({
      root: rootRef.current,
      item,
      role,
      user,
      initialMarkdown: initial.data.markdown ?? '',
      initialCacheSeq: initial.data.cacheSeq ?? 0,
      isTypewriterMode: () => typewriterModeRef.current,
      onFocusModeShortcut: toggleFocusMode,
      onPresenceChange: setPresence,
      onRealtimeChange: (client) => { realtimeRef.current = client; },
      onStatsChange: setStats,
      onStatusChange: setStatus,
      onInlinePreviewChange: setInlinePreview,
    });
  }, [item.id, item.workspaceId, initial.data?.cacheSeq, initial.data?.markdown, role, user.id, user.name]);

  const rename = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === item.title || role === 'viewer') return;
    try {
      await mutations.renameItem.mutateAsync({ id: item.id, title: nextTitle });
    } catch (error) {
      setTitle(item.title);
      notifications.show({ color: 'red', message: error instanceof Error ? error.message : '重命名失败' });
    }
  };

  const importMarkdown = async (file?: File) => {
    if (!file) return;
    try {
      const markdown = await file.text();
      realtimeRef.current?.close();
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      await api.resetMarkdown(item.id, '', markdown);
      location.reload();
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : '导入失败。请关闭其他协作窗口后重试。',
      });
    }
  };

  if (initial.isLoading) return <div className={styles.page}><Loader size="sm" /></div>;

  const editorClassName = [styles.editor, focusMode ? styles.focusMode : '', typewriterMode ? styles.typewriterMode : '']
    .filter(Boolean)
    .join(' ');

  return (
    <article className={styles.page}>
      <input
        className={styles.title}
        value={title}
        readOnly={role === 'viewer'}
        placeholder="无标题文档"
        onChange={(event) => setTitle(event.currentTarget.value)}
        onBlur={() => void rename()}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          event.currentTarget.blur();
          rootRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
        }}
        aria-label="文档标题"
      />
      <div className={styles.meta}>
        <MarkdownEditorControls
          status={status}
          presence={presence}
          stats={stats}
          readonly={role === 'viewer'}
          focusMode={focusMode}
          typewriterMode={typewriterMode}
          exportHref={`/api/items/${item.id}/export.md`}
          exportName={`${item.title}.md`}
          onImport={() => importRef.current?.click()}
          onToggleFocus={toggleFocusMode}
          onToggleTypewriter={toggleTypewriterMode}
        />
        <input
          ref={importRef}
          type="file"
          accept=".md,text/markdown"
          hidden
          onChange={(event) => void importMarkdown(event.target.files?.[0])}
        />
      </div>
      <div
        ref={rootRef}
        className={editorClassName}
        data-focus-mode={focusMode || undefined}
        data-typewriter-mode={typewriterMode || undefined}
      />
      <MarkdownMathPreview preview={inlinePreview} />
    </article>
  );
}
