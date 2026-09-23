import { MarkdownSource } from './markdown-source';
import { MarkdownFindReplace } from './markdown-find-replace';
import { MarkdownImportDialog } from './markdown-import-dialog';
import type { MarkdownFindController } from './markdown-find';
import { registerContentSave } from '@/features/content/content-save';
import { exportConfirmedMarkdown } from './markdown-export';
import { useRecordVisit } from '@/api/personal-items';
import { useMarkdownExport } from './use-markdown-export';
import { localMadocAssetID } from './asset-reference';
import { useBlocker } from '@tanstack/react-router';
import { usePreferences } from '@/features/account/preferences-provider';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMarkdown, useWorkspaceMutations } from '@/api/hooks';
import type { Item, Role, User } from '@/api/types';
import type { RealtimeClient } from '@/features/realtime/client';
import { MarkdownEditorControls } from './markdown-editor-controls';
import { startMarkdownSession, type SaveStatus } from './markdown-session';
import { getMarkdownStats } from './markdown-stats';
import { MarkdownMathPreview } from './markdown-math-preview';
import { VersionHistoryDialog } from '@/features/content-versions/version-history-dialog';
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
  const initialRole = useRef(role);
  useEffect(() => { if (role === 'viewer' && initialRole.current !== 'viewer') realtimeRef.current?.rejectItem(item.id); }, [role, item.id]);
  const exporter = useMarkdownExport(item.id, item.title);
  const mutations = useWorkspaceMutations(item.workspaceId);
  const rootRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const realtimeRef = useRef<RealtimeClient>();
  const typewriterModeRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [sourceOpened, setSourceOpened] = useState(false);
  const [importFile, setImportFile] = useState<File>();
  const [findOpened, setFindOpened] = useState(false);
  const [versionsOpened, setVersionsOpened] = useState(false);
  const findControllerRef = useRef<MarkdownFindController>();
  const [readingMode, setReadingMode] = useState(role === 'viewer');
  const readingModeRef = useRef(readingMode);
  const readingModeControllerRef = useRef<(reading: boolean) => void>();
  const [status, setStatus] = useState<SaveStatus>('Reconnecting');
  const [failure, setFailure] = useState<{ message: string; download: () => void; retry?: () => void } | null>(null);
  useRecordVisit(item, ready && !failure, user.id);
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
  readingModeRef.current = readingMode;
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  typewriterModeRef.current = typewriterMode;

  const toggleFocusMode = () => setPreferences({focusMode: !preferencesRef.current.focusMode});
  const toggleTypewriterMode = () => setPreferences({typewriterMode: !preferencesRef.current.typewriterMode});

  useEffect(() => {
    setTitle(item.title);
  }, [item.id, item.title]);

  useEffect(() => {
    setReadingMode(role === 'viewer');
    readingModeRef.current = role === 'viewer';
    readingModeControllerRef.current?.(role === 'viewer');
  }, [item.id, role]);

  useEffect(() => {
    if (!rootRef.current || !initial.data) return;
    let active = true;
    let unregisterCopy: (() => void) | undefined;
    onOutlineChange(null);
    setFailure(null);
    setReady(false);
    const stop = startMarkdownSession({
      onReady: () => { if (active) setReady(true); },
      root: rootRef.current,
      onExportReady: (source) => {
        exporter.register(source);
        unregisterCopy?.();
        if (source) unregisterCopy = registerContentSave(item.id, async (signal) => {
          await exportConfirmedMarkdown(item.id, source, signal);
        });
      },
      onFindReady: (controller) => { findControllerRef.current = controller; },
      onReadingModeReady: (controller) => {
        readingModeControllerRef.current = controller;
        controller?.(readingModeRef.current);
      },
      onFailure: (message, download, retry) => { if (active) setFailure({ message, download, retry }); },
      onRecovered: () => { if (active) setFailure(null); },
      onLeaveGuardChange: (guard) => { leaveGuard.current = guard; },
      onOutlineChange: (outline) => {
        if (active) onOutlineChange(outline);
      },
      item,
      role: initialRole.current,
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
      unregisterCopy?.();
      stop();
    };
  }, [item.id, item.workspaceId, initial.data?.cacheSeq, initial.data?.markdown, user.id, onOutlineChange]);

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

  if (initial.isLoading) return <div className={styles.page}><Loader size="sm" /></div>;

  const editorClassName = [styles.editor, !readingMode && focusMode ? styles.focusMode : '', !readingMode && typewriterMode ? styles.typewriterMode : '']
    .filter(Boolean)
    .join(' ');

  return (
    <article className={styles.page} style={{
      '--madoc-font-size': `${preferences.fontSize}px`,
      '--madoc-line-height': preferences.lineHeight,
      '--madoc-content-width': `${preferences.contentWidth}px`,
    } as CSSProperties}>
      {readingMode ? (
        <h1 className={styles.title} data-testid="markdown-title">{title || '无标题文档'}</h1>
      ) : (
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
      )}
      <div className={styles.meta}>
        <MarkdownEditorControls
          status={status}
          presence={presence}
          stats={stats}
          readonly={role === 'viewer'}
          readingMode={readingMode}
          focusMode={focusMode}
          typewriterMode={typewriterMode}
          onExport={() => void exporter.run()}
          onPackageExport={() => void exporter.runPackage()}
          onSource={() => setSourceOpened(true)}
          onFind={() => setFindOpened(true)}
          onToggleReading={() => {
            const next = !readingMode;
            readingModeRef.current = next;
            setReadingMode(next);
            readingModeControllerRef.current?.(next);
          }}
          onPrint={() => window.print()}
          exporting={exporter.busy && !exporter.packageBusy}
          exportingPackage={exporter.packageBusy}
          onImport={() => importRef.current?.click()}
          onToggleFocus={toggleFocusMode}
          onToggleTypewriter={toggleTypewriterMode}
          onVersions={() => setVersionsOpened(true)}
        />
        <input
          ref={importRef}
          type="file"
          accept=".md,.markdown,text/markdown"
          hidden
          onChange={(event) => {
            setImportFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </div>
      {role !== 'viewer' && (
        <MarkdownImportDialog
          file={importFile}
          workspaceId={item.workspaceId}
          parentId={item.parentId ?? null}
          onClose={() => setImportFile(undefined)}
        />
      )}
      {exporter.busy && <div role="status">{exporter.packageBusy ? '正在确认修改并打包附件…' : '正在确认修改并准备导出…'}</div>}
      {exporter.error && (
        <Alert color="orange" title="导出尚未完成" role="alert">
          {exporter.error}
          <Button variant="light" onClick={() => void exporter.retry()}>重试导出</Button>
          <Button variant="light" onClick={exporter.local}>下载本地副本</Button>
        </Alert>
      )}
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
        data-reading-mode={readingMode || undefined}
        data-auto-pair={preferences.autoPair}
        data-code-line-numbers={preferences.codeLineNumbers}
        data-focus-mode={focusMode || undefined}
        data-typewriter-mode={typewriterMode || undefined}
      />
      <MarkdownMathPreview preview={inlinePreview} />
      {sourceOpened && <MarkdownSource title={item.title} read={exporter.inspect} onClose={() => setSourceOpened(false)} />}
      {findOpened && <MarkdownFindReplace controller={findControllerRef.current} readonly={role === 'viewer'} onClose={() => setFindOpened(false)} />}
      {versionsOpened && <VersionHistoryDialog item={item} role={role} onClose={() => setVersionsOpened(false)} assetIds={() => [...new Set(exporter.assetReferences(exporter.inspect().markdown).map((source) => localMadocAssetID(source, window.location.origin)).filter((id): id is string => id !== undefined))]} />}
    </article>
  );
}
