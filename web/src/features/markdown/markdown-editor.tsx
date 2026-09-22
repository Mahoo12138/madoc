import { useBlocker } from '@tanstack/react-router';
import { usePreferences } from '@/features/account/preferences-provider';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Loader } from '@mantine/core';
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
import type { MarkdownOutline } from './markdown-outline-model';
import * as styles from './markdown-editor.css';

type Props = {
  item: Item;
  role: Role;
  user: User;
  onOutlineChange: (outline: MarkdownOutline | null) => void;
};

export function MarkdownEditor({ item, role, user, onOutlineChange }: Props) {
  const initial = useMarkdown(item.id);
  const mutations = useWorkspaceMutations(item.workspaceId);
  const rootRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const realtimeRef = useRef<RealtimeClient>();
  const typewriterModeRef = useRef(false);
  const [status, setStatus] = useState<SaveStatus>('Reconnecting');
  const [failure, setFailure] = useState<{ message: string; download: () => void; retry?: () => void } | null>(null);
  const leaveGuard = useRef<{ unsafe: () => boolean; settle: () => Promise<void> }>({ unsafe: () => false, settle: async () => {} });
  useBlocker({
    shouldBlockFn: async () => {
      await leaveGuard.current.settle();
      return leaveGuard.current.unsafe() && !window.confirm('修改尚未保存到此设备。离开会丢失这些修改，仍要离开吗？');
    },
    enableBeforeUnload: () => leaveGuard.current.unsafe(),
  });
  const [presence, setPresence] = useState(1);
  const [inlinePreview, setInlinePreview] = useState<InlineMathPreview | null>(null);
  const [title, setTitle] = useState(item.title);
  const [stats, setStats] = useState(() => getMarkdownStats(''));
  const { values: preferences, set: setPreferences } = usePreferences();
  const { focusMode, typewriterMode } = preferences;
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  typewriterModeRef.current = typewriterMode;

  const toggleFocusMode = () => setPreferences({focusMode: !preferencesRef.current.focusMode});
  const toggleTypewriterMode = () => setPreferences({typewriterMode: !preferencesRef.current.typewriterMode});

  useEffect(() => {
    setTitle(item.title);
  }, [item.id, item.title]);

  useEffect(() => {
    if (!rootRef.current || !initial.data) return;
    let active = true;
    onOutlineChange(null);
    setFailure(null);
    const stop = startMarkdownSession({
      root: rootRef.current,
      onFailure: (message, download, retry) => { if (active) setFailure({ message, download, retry }); },
      onRecovered: () => { if (active) setFailure(null); },
      onLeaveGuardChange: (guard) => { leaveGuard.current = guard; },
      onOutlineChange: (outline) => {
        if (active) onOutlineChange(outline);
      },
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
    return () => {
      active = false;
      stop();
    };
  }, [item.id, item.workspaceId, initial.data?.cacheSeq, initial.data?.markdown, role, user.id, onOutlineChange]);

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
    <article className={styles.page} style={{
      '--madoc-font-size': `${preferences.fontSize}px`,
      '--madoc-line-height': preferences.lineHeight,
      '--madoc-content-width': `${preferences.contentWidth}px`,
    } as CSSProperties}>
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
      {failure && (
        <Alert color="red" title="保存已停止" role="alert">
          {failure.message}
          <Button variant="light" onClick={failure.download}>下载本地副本</Button>
          {failure.retry && <Button variant="light" onClick={failure.retry}>重试本地保存</Button>}
        </Alert>
      )}
      <div
        ref={rootRef}
        className={editorClassName}
        data-auto-pair={preferences.autoPair}
        data-code-line-numbers={preferences.codeLineNumbers}
        data-focus-mode={focusMode || undefined}
        data-typewriter-mode={typewriterMode || undefined}
      />
      <MarkdownMathPreview preview={inlinePreview} />
    </article>
  );
}
