import { useRecordVisit } from '@/api/personal-items';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Alert, Button } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  exportToBlob,
  exportToSvg,
  newElementWith,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { Item, Role, User } from '@/api/types';
import { useWhiteboardSession } from './use-whiteboard-session';
import { WhiteboardImportDialog } from './whiteboard-import-dialog';
import { WhiteboardToolbar } from './whiteboard-toolbar';
import { WhiteboardDialogs, type WhiteboardDialog } from './whiteboard-dialogs';
import { durableBoardAppState } from './whiteboard-scene';
import { VersionHistoryDialog } from '@/features/content-versions/version-history-dialog';
import * as styles from './whiteboard-editor.css';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WhiteboardEditor({
  item,
  role,
  user,
}: {
  item: Item;
  role: Role;
  user: User;
}) {
  const {
    initial,
    apiRef,
    onAPIReady,
    recovery,
    editorReady,
    status,
    presence,
    failure,
    storageFailed,
    retryStorage,
    onChange,
    halted,
    joined,
    realtimeRef,
  } = useWhiteboardSession(item, role, user);
  const importRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [actionsOpened, setActionsOpened] = useState(false);
  useLayoutEffect(() => {
    // The engine listens for its command palette on window in capture phase.
    // Register before its effects so these shortcuts use the project menu too.
    const handlePalette = (event: globalThis.KeyboardEvent) => {
      if (!rootRef.current) return;
      if (
        (event.metaKey || event.ctrlKey) &&
        ((event.shiftKey && event.code === 'KeyP') || event.code === 'Slash')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        // Portal inputs are outside the canvas root, but the vendor listener
        // is global. Consume its shortcuts there without opening another UI.
        if (
          (event.target as HTMLElement).closest(
            'input, textarea, [contenteditable="true"]',
          )
        )
          return;
        setActionsOpened(true);
      }
    };
    window.addEventListener('keydown', handlePalette, true);
    return () => window.removeEventListener('keydown', handlePalette, true);
  }, []);
  const [importFile, setImportFile] = useState<File>();
  const [versionsOpened, setVersionsOpened] = useState(false);
  const [dialog, setDialog] = useState<WhiteboardDialog>(null);
  const [storedTheme, setTheme] = useLocalStorage<'light' | 'dark'>({
    key: `madoc.whiteboard.theme.${user.id}`,
    defaultValue: 'light',
    getInitialValueInEffect: false,
  });
  const theme = storedTheme === 'dark' ? 'dark' : 'light';
  const [background, setBackground] = useState('#ffffff');
  const [hasElements, setHasElements] = useState(false);
  const [exportError, setExportError] = useState('');
  const exporting = useRef(false);
  useRecordVisit(item, editorReady && !failure, user.id);
  if (!initial.data || !recovery) return null;
  const canEdit = role !== 'viewer' && editorReady && !failure;
  const exportScene = async (type: 'png' | 'svg' | 'json', local = false) => {
    const api = apiRef.current;
    if (!api || exporting.current) return;
    exporting.current = true;
    setExportError('');
    try {
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      if (type === 'png')
        download(
          await exportToBlob({
            elements,
            appState,
            files,
            mimeType: 'image/png',
          }),
          `${item.title}.png`,
        );
      else if (type === 'svg')
        download(
          new Blob(
            [(await exportToSvg({ elements, appState, files })).outerHTML],
            { type: 'image/svg+xml' },
          ),
          `${item.title}.svg`,
        );
      else
        download(
          new Blob([serializeAsJSON(elements, appState, files, 'local')], {
            type: 'application/json',
          }),
          `${item.title}${local ? '-本地副本' : ''}.excalidraw`,
        );
    } catch {
      setExportError('导出失败，请重试；空白画布可先导出 Excalidraw JSON。');
    } finally {
      exporting.current = false;
    }
  };
  const changeBackground = (color: string) => {
    if (canEdit)
      apiRef.current?.updateScene({
        appState: { viewBackgroundColor: color },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
  };
  const clearCanvas = () => {
    if (!canEdit) return;
    const api = apiRef.current;
    api?.updateScene({
      elements: api
        .getSceneElementsIncludingDeleted()
        .map((element) =>
          element.isDeleted
            ? element
            : newElementWith(element, { isDeleted: true }),
        ),
      appState: { selectedElementIds: {}, selectedGroupIds: {} },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setDialog(null);
  };
  const handleKey = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement).closest(
        'input, textarea, [contenteditable="true"]',
      )
    )
      return;
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (command && (key === 'delete' || key === 'backspace')) {
      event.preventDefault();
      event.stopPropagation();
      if (canEdit && hasElements) setDialog('clear');
    } else if (command && key === 'f') {
      event.preventDefault();
      event.stopPropagation();
      setDialog('search');
    } else if (event.key === '?') {
      event.preventDefault();
      event.stopPropagation();
      setDialog('help');
    } else if (event.altKey && event.shiftKey && event.code === 'KeyD') {
      event.preventDefault();
      event.stopPropagation();
      setTheme(theme === 'light' ? 'dark' : 'light');
    } else if (command && key === 'o') {
      event.preventDefault();
      event.stopPropagation();
      if (canEdit) importRef.current?.click();
    }
  };
  return (
    <div ref={rootRef} className={styles.root} onKeyDownCapture={handleKey}>
      <WhiteboardToolbar
        status={status}
        presence={presence}
        theme={theme}
        onTheme={setTheme}
        background={background}
        onBackground={changeBackground}
        canEdit={canEdit}
        hasElements={hasElements}
        onHistory={() => setVersionsOpened(true)}
        onExport={(type) => void exportScene(type)}
        onImport={() => importRef.current?.click()}
        onDialog={setDialog}
        actionsOpened={actionsOpened}
        onActionsChange={setActionsOpened}
      />
      {role !== 'viewer' && (
        <>
          <input
            ref={importRef}
            type="file"
            accept=".excalidraw,application/json"
            hidden
            onChange={(event) => {
              setImportFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          <WhiteboardImportDialog
            file={importFile}
            workspaceId={item.workspaceId}
            parentId={item.parentId ?? null}
            onClose={() => setImportFile(undefined)}
          />
        </>
      )}
      {failure && (
        <Alert className={styles.failure} color="orange" title="白板保存已停止">
          {failure}
          {storageFailed && (
            <Button
              mt="sm"
              mr="sm"
              size="xs"
              onClick={() => void retryStorage()}
            >
              重试本地保存
            </Button>
          )}
          <Button
            mt="sm"
            size="xs"
            onClick={() => void exportScene('json', true)}
          >
            下载本地白板副本
          </Button>
        </Alert>
      )}
      {exportError && (
        <Alert
          className={styles.failure}
          color="red"
          withCloseButton
          onClose={() => setExportError('')}
        >
          {exportError}
        </Alert>
      )}
      {versionsOpened && (
        <VersionHistoryDialog
          item={item}
          role={role}
          onClose={() => setVersionsOpened(false)}
        />
      )}
      <WhiteboardDialogs
        dialog={dialog}
        api={apiRef.current}
        onClose={() => setDialog(null)}
        onClear={clearCanvas}
        canEdit={canEdit}
      />
      <div className={styles.canvas}>
        <Excalidraw
          excalidrawAPI={onAPIReady}
          initialData={{
            elements: recovery.scene.elements as never[],
            appState: durableBoardAppState(recovery.scene.appState) as never,
            files: recovery.scene.files as never,
          }}
          onChange={(elements, appState, files) => {
            setBackground(appState.viewBackgroundColor);
            setHasElements(elements.some((element) => !element.isDeleted));
            onChange(elements, appState, files);
          }}
          onPointerUpdate={({ pointer, button }) =>
            !halted.current &&
            joined.current &&
            realtimeRef.current?.sendOnline('whiteboard.pointer', item.id, {
              pointer,
              button,
              userId: user.id,
              userName: user.name,
            })
          }
          viewModeEnabled={role === 'viewer' || !!failure || !editorReady}
          theme={theme}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
              saveAsImage: false,
            },
          }}
          isCollaborating
        >
          <MainMenu />
          <WelcomeScreen>
            <></>
          </WelcomeScreen>
        </Excalidraw>
      </div>
    </div>
  );
}
