import { useRecordVisit } from '@/api/personal-items';
import { useRef, useState } from 'react';
import { Alert, Badge, Button, Menu } from '@mantine/core';
import { Excalidraw, exportToBlob, exportToSvg, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { ChevronDown as IconChevronDown, Download as IconDownload, Wifi as IconWifi, WifiOff as IconWifiOff } from 'lucide-react';
import type { Item, Role, User } from '@/api/types';
import { useWhiteboardSession } from './use-whiteboard-session';
import { WhiteboardImportDialog } from './whiteboard-import-dialog';
import { VersionHistoryDialog } from '@/features/content-versions/version-history-dialog';
import * as styles from './whiteboard-editor.css';

function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }

export function WhiteboardEditor({ item, role, user }: { item: Item; role: Role; user: User }) {
  const { initial, apiRef, onAPIReady, recovery, editorReady, status, presence, failure, storageFailed, retryStorage, onChange, halted, joined, realtimeRef } = useWhiteboardSession(item, role, user);
  const importRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File>();
  const [versionsOpened, setVersionsOpened] = useState(false);
  useRecordVisit(item, editorReady && !failure, user.id);
  if (!initial.data || !recovery) return null;
  const exportScene = async (type: 'png' | 'svg' | 'json', local = false) => { const api = apiRef.current; if (!api) return; const elements = api.getSceneElements(); const appState = api.getAppState(); const files = api.getFiles(); if (type === 'png') return download(await exportToBlob({ elements, appState, files, mimeType: 'image/png' }), `${item.title}.png`); if (type === 'svg') return download(new Blob([(await exportToSvg({ elements, appState, files })).outerHTML], { type: 'image/svg+xml' }), `${item.title}.svg`); download(new Blob([serializeAsJSON(elements, appState, files, 'local')], { type: 'application/json' }), `${item.title}${local ? '-本地副本' : ''}.excalidraw`); };
  return (
    <div className={styles.root}>
      <div className={styles.status}>
        <Badge variant="light" color={status === 'Saved' ? 'green' : status === 'Offline' ? 'red' : 'blue'} leftSection={status === 'Offline' ? <IconWifiOff size={12} /> : <IconWifi size={12} />}>{status === 'Local' ? '已保存到此设备，待同步' : status}</Badge>
        <Badge variant="outline" color="gray">{presence} 在线</Badge>
        <Button size="compact-sm" variant="white" color="gray" onClick={() => setVersionsOpened(true)}>版本历史</Button>
        <Menu>
          <Menu.Target>
            <Button size="compact-sm" variant="white" color="gray" leftSection={<IconDownload size={14} />} rightSection={<IconChevronDown size={13} />}>导出</Button>
          </Menu.Target>
          <Menu.Dropdown>
            {role !== 'viewer' && <Menu.Item onClick={() => importRef.current?.click()}>导入 Excalidraw JSON</Menu.Item>}
            <Menu.Item onClick={() => void exportScene('png')}>PNG</Menu.Item>
            <Menu.Item onClick={() => void exportScene('svg')}>SVG</Menu.Item>
            <Menu.Item onClick={() => void exportScene('json')}>Excalidraw JSON</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
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
          <WhiteboardImportDialog file={importFile} workspaceId={item.workspaceId} parentId={item.parentId ?? null} onClose={() => setImportFile(undefined)} />
        </>
      )}
      {failure && (
        <Alert className={styles.failure} color="orange" title="白板保存已停止">
          {failure}
          {storageFailed && <Button mt="sm" mr="sm" size="xs" onClick={() => void retryStorage()}>重试本地保存</Button>}
          <Button mt="sm" size="xs" onClick={() => void exportScene('json', true)}>下载本地白板副本</Button>
        </Alert>
      )}
      {versionsOpened && <VersionHistoryDialog item={item} role={role} onClose={() => setVersionsOpened(false)} />}
      <Excalidraw
        excalidrawAPI={onAPIReady}
        initialData={{ elements: recovery.scene.elements as never[], appState: recovery.scene.appState as never, files: recovery.scene.files as never }}
        onChange={onChange as never}
        onPointerUpdate={({ pointer, button }) => !halted.current && joined.current && realtimeRef.current?.sendOnline('whiteboard.pointer', item.id, { pointer, button, userId: user.id, userName: user.name })}
        viewModeEnabled={role === 'viewer' || !!failure || !editorReady}
        isCollaborating
      />
    </div>
  );
}
