import { setPendingChanges } from '@/features/account/pending-changes';
import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Menu } from '@mantine/core';
import { Excalidraw, reconcileElements, exportToBlob, exportToSvg, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { ChevronDown as IconChevronDown, Download as IconDownload, Wifi as IconWifi, WifiOff as IconWifiOff } from 'lucide-react';
import { useWhiteboard } from '@/api/hooks';
import type { BoardScene, Item, Role, User } from '@/api/types';
import { RealtimeClient } from '@/features/realtime/client';
import { WhiteboardSaveState } from './whiteboard-save-state';
import { durableBoardScene } from './whiteboard-scene';
import * as styles from './whiteboard-editor.css';

function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }

export function WhiteboardEditor({ item, role, user }: { item: Item; role: Role; user: User }) {
  const initial = useWhiteboard(item.id); const apiRef = useRef<ExcalidrawImperativeAPI>(); const revisionRef = useRef(0); const [status, setStatus] = useState<'Saving' | 'Saved' | 'Offline' | 'Reconnecting'>('Reconnecting'); const [presence, setPresence] = useState(1);
  const realtimeRef = useRef<RealtimeClient>(); const timerRef = useRef(0); const remoteRef = useRef(false); const collaboratorsRef = useRef(new Map());
  const lastScene = useRef<string>();
  const saveState = useRef(new WhiteboardSaveState());
  const joined = useRef(false);
  const halted = useRef(false);
  const flushRef = useRef(() => {});
  const [failure, setFailure] = useState('');
  useEffect(() => {
    if (!initial.data) return;
    revisionRef.current = initial.data.revision; const realtime = new RealtimeClient(); realtimeRef.current = realtime;
    let disposed = false;
    const flush = () => {
      const api = apiRef.current;
      const id = saveState.current.requestId;
      if (disposed || !api || !id || !joined.current || halted.current || role === 'viewer') return;
      const scene = durableBoardScene(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
      if (realtime.sendOnline('whiteboard.scene.update', item.id, { baseRevision: revisionRef.current, scene }, id)) saveState.current.sending(id);
    };
    flushRef.current = flush;
    const retry = window.setInterval(flush, 3000);
    const unsubscribe = realtime.subscribe((message) => {
      if (halted.current) return;
      if (message.type === 'connection.changed') {
        joined.current = false;
        const state = (message.payload as { state: string }).state;
        setStatus(state === 'offline' ? 'Offline' : 'Reconnecting');
        if (state === 'online' && !halted.current) realtime.sendOnline('whiteboard.join', item.id);
      }
      if (message.type === 'error') {
        halted.current = true;
        setStatus('Offline');
        setFailure('服务器拒绝了白板保存。请先导出 Excalidraw JSON 副本，再重新打开白板；当前内容尚未确认保存。');
        return;
      }
      if (message.itemId !== item.id) return;
      if (message.type === 'whiteboard.init' || message.type === 'whiteboard.scene.remote') {
        const payload = message.payload as { revision: number; scene: BoardScene };
        remoteRef.current = true;
        revisionRef.current = Math.max(revisionRef.current, payload.revision);
        const api = apiRef.current;
        if (api) {
          const elements = reconcileElements(api.getSceneElementsIncludingDeleted(), payload.scene.elements as Parameters<typeof reconcileElements>[1], api.getAppState());
          api.updateScene({ elements, appState: (saveState.current.pending ? durableBoardScene([], api.getAppState(), {}).appState : payload.scene.appState) as never });
        }
        apiRef.current?.addFiles(Object.values(payload.scene.files ?? {}) as never[]);
        window.setTimeout(() => {
          if (disposed) return;
          remoteRef.current = false;
          if (message.type === 'whiteboard.init') { joined.current = true; flush(); }
        }, 0);
        setStatus(saveState.current.pending ? 'Saving' : 'Saved');
      }
      if (message.type === 'whiteboard.scene.ack') {
        const payload = message.payload as { revision: number; clientUpdateId?: string };
        if (!saveState.current.acknowledge(payload.clientUpdateId)) return;
        const pending = saveState.current.pending;
        setPendingChanges(`whiteboard:${item.id}`, pending);
        revisionRef.current = Math.max(revisionRef.current, payload.revision);
        setStatus(pending ? 'Saving' : 'Saved');
      }
      if (message.type === 'whiteboard.pointer') {
        const payload = message.payload as { userId?: string; userName?: string; pointer?: { x: number; y: number; tool: 'pointer' | 'laser' }; button?: 'up' | 'down' };
        if (payload.userId && payload.pointer) {
          collaboratorsRef.current.set(payload.userId, { id: payload.userId, socketId: payload.userId, username: payload.userName, pointer: payload.pointer, button: payload.button, color: { background: '#dbeafe', stroke: '#1f6feb' } });
          apiRef.current?.updateScene({ collaborators: new Map(collaboratorsRef.current) } as never);
        }
      }
      if (message.type === 'presence.changed') {
        const members = (message.payload as { members?: { id: string; name: string }[] }).members ?? [];
        for (const member of members) { const peer = collaboratorsRef.current.get(member.id); if (peer) collaboratorsRef.current.set(member.id, { ...peer, username: member.name }); }
        const active = new Set(members.map((member) => member.id));
        for (const id of collaboratorsRef.current.keys()) if (!active.has(id)) collaboratorsRef.current.delete(id);
        apiRef.current?.updateScene({ collaborators: new Map(collaboratorsRef.current) } as never);
        setPresence(members.length || 1);
      }
    });
    return () => {
      disposed = true;
      joined.current = false;
      flushRef.current = () => {};
      window.clearInterval(retry);
      window.clearTimeout(timerRef.current);
      realtime.sendOnline('room.leave', item.id);
      unsubscribe();
      realtime.close();
      setPendingChanges(`whiteboard:${item.id}`, false);
    };
  }, [item.id, !!initial.data]);
  if (!initial.data) return null;
  const onChange = (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
    const scene = durableBoardScene(elements, appState, files);
    const serialized = JSON.stringify(scene);
    if (lastScene.current === serialized) return;
    lastScene.current = serialized;
    if (remoteRef.current || halted.current || role === 'viewer') return;
    saveState.current.changed();
    setPendingChanges(`whiteboard:${item.id}`, true);
    setStatus(realtimeRef.current?.state === 'online' ? 'Saving' : 'Offline');
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      flushRef.current();
    }, 350);
  };
  const exportScene = async (type: 'png' | 'svg' | 'json', local = false) => { const api = apiRef.current; if (!api) return; const elements = api.getSceneElements(); const appState = api.getAppState(); const files = api.getFiles(); if (type === 'png') return download(await exportToBlob({ elements, appState, files, mimeType: 'image/png' }), `${item.title}.png`); if (type === 'svg') return download(new Blob([(await exportToSvg({ elements, appState, files })).outerHTML], { type: 'image/svg+xml' }), `${item.title}.svg`); download(new Blob([serializeAsJSON(elements, appState, files, 'local')], { type: 'application/json' }), `${item.title}${local ? '-本地副本' : ''}.excalidraw`); };
  return (
    <div className={styles.root}>
      <div className={styles.status}>
        <Badge variant="light" color={status === 'Saved' ? 'green' : status === 'Offline' ? 'red' : 'blue'} leftSection={status === 'Offline' ? <IconWifiOff size={12} /> : <IconWifi size={12} />}>{status}</Badge>
        <Badge variant="outline" color="gray">{presence} 在线</Badge>
        <Menu>
          <Menu.Target>
            <Button size="compact-sm" variant="white" color="gray" leftSection={<IconDownload size={14} />} rightSection={<IconChevronDown size={13} />}>导出</Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => void exportScene('png')}>PNG</Menu.Item>
            <Menu.Item onClick={() => void exportScene('svg')}>SVG</Menu.Item>
            <Menu.Item onClick={() => void exportScene('json')}>Excalidraw JSON</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
      {failure && (
        <Alert className={styles.failure} color="orange" title="白板保存已停止">
          {failure}
          <Button mt="sm" size="xs" onClick={() => void exportScene('json', true)}>下载本地白板副本</Button>
        </Alert>
      )}
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api; }}
        initialData={{ elements: initial.data.scene.elements as never[], appState: initial.data.scene.appState as never, files: initial.data.scene.files as never }}
        onChange={onChange as never}
        onPointerUpdate={({ pointer, button }) => !halted.current && joined.current && realtimeRef.current?.sendOnline('whiteboard.pointer', item.id, { pointer, button, userId: user.id, userName: user.name })}
        viewModeEnabled={role === 'viewer' || !!failure}
        isCollaborating
      />
    </div>
  );
}
