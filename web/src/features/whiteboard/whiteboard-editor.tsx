import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Group, Menu } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Excalidraw, exportToBlob, exportToSvg, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { ChevronDown as IconChevronDown, Download as IconDownload, Wifi as IconWifi, WifiOff as IconWifiOff } from 'lucide-react';
import { useWhiteboard } from '@/api/hooks';
import type { BoardScene, Item, Role, User } from '@/api/types';
import { RealtimeClient } from '@/features/realtime/client';
import * as styles from './whiteboard-editor.css';

function durableAppState(state: Record<string, unknown>) {
  const keys = ['viewBackgroundColor', 'gridSize', 'gridStep', 'gridModeEnabled', 'objectsSnapModeEnabled', 'theme', 'name'];
  return Object.fromEntries(keys.filter((key) => key in state).map((key) => [key, state[key]]));
}
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }

export function WhiteboardEditor({ item, role, user }: { item: Item; role: Role; user: User }) {
  const initial = useWhiteboard(item.id); const apiRef = useRef<ExcalidrawImperativeAPI>(); const [revision, setRevision] = useState(0); const [status, setStatus] = useState<'Saving' | 'Saved' | 'Offline' | 'Reconnecting'>('Reconnecting'); const [presence, setPresence] = useState(1);
  const realtimeRef = useRef<RealtimeClient>(); const timerRef = useRef(0); const remoteRef = useRef(false); const collaboratorsRef = useRef(new Map());
  useEffect(() => {
    if (!initial.data) return;
    setRevision(initial.data.revision); const realtime = new RealtimeClient(); realtimeRef.current = realtime;
    const unsubscribe = realtime.subscribe((message) => {
      if (message.type === 'connection.changed') { const state = (message.payload as { state: string }).state; setStatus(state === 'online' ? 'Reconnecting' : state === 'offline' ? 'Offline' : 'Reconnecting'); if (state === 'online') realtime.send('whiteboard.join', item.id); }
      if (message.itemId !== item.id) return;
      if (message.type === 'whiteboard.init' || message.type === 'whiteboard.scene.remote') { const payload = message.payload as { revision: number; scene: BoardScene }; remoteRef.current = true; setRevision(payload.revision); apiRef.current?.updateScene({ elements: payload.scene.elements as never[], appState: payload.scene.appState as never }); apiRef.current?.addFiles(Object.values(payload.scene.files ?? {}) as never[]); window.setTimeout(() => { remoteRef.current = false; }, 0); setStatus('Saved'); }
      if (message.type === 'whiteboard.scene.ack') { setRevision((message.payload as { revision: number }).revision); setStatus('Saved'); }
      if (message.type === 'whiteboard.pointer') {
        const payload = message.payload as { userId?: string; userName?: string; pointer?: { x: number; y: number; tool: 'pointer' | 'laser' }; button?: 'up' | 'down' };
        if (payload.userId && payload.pointer) {
          collaboratorsRef.current.set(payload.userId, { id: payload.userId, socketId: payload.userId, username: payload.userName, pointer: payload.pointer, button: payload.button, color: { background: '#dbeafe', stroke: '#1f6feb' } });
          apiRef.current?.updateScene({ collaborators: new Map(collaboratorsRef.current) } as never);
        }
      }
      if (message.type === 'presence.changed') {
        const members = (message.payload as { members?: { id: string }[] }).members ?? [];
        const active = new Set(members.map((member) => member.id));
        for (const id of collaboratorsRef.current.keys()) if (!active.has(id)) collaboratorsRef.current.delete(id);
        apiRef.current?.updateScene({ collaborators: new Map(collaboratorsRef.current) } as never);
        setPresence(members.length || 1);
      }
      if (message.type === 'error') { setStatus('Offline'); notifications.show({ color: 'red', message: (message.payload as { message?: string }).message ?? '白板同步失败' }); }
    });
    return () => { window.clearTimeout(timerRef.current); realtime.send('room.leave', item.id); unsubscribe(); realtime.close(); };
  }, [item.id, initial.data?.revision]);
  if (!initial.data) return null;
  const onChange = (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
    if (remoteRef.current || role === 'viewer') return; setStatus(realtimeRef.current?.state === 'online' ? 'Saving' : 'Offline'); window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => realtimeRef.current?.send('whiteboard.scene.update', item.id, { baseRevision: revision, scene: { elements, appState: durableAppState(appState), files } }), 350);
  };
  const exportScene = async (type: 'png' | 'svg' | 'json') => { const api = apiRef.current; if (!api) return; const elements = api.getSceneElements(); const appState = api.getAppState(); const files = api.getFiles(); if (type === 'png') return download(await exportToBlob({ elements, appState, files, mimeType: 'image/png' }), `${item.title}.png`); if (type === 'svg') return download(new Blob([(await exportToSvg({ elements, appState, files })).outerHTML], { type: 'image/svg+xml' }), `${item.title}.svg`); download(new Blob([serializeAsJSON(elements, appState, files, 'local')], { type: 'application/json' }), `${item.title}.excalidraw`); };
  return <div className={styles.root}><div className={styles.status}><Badge variant="light" color={status === 'Saved' ? 'green' : status === 'Offline' ? 'red' : 'blue'} leftSection={status === 'Offline' ? <IconWifiOff size={12} /> : <IconWifi size={12} />}>{status}</Badge><Badge variant="outline" color="gray">{presence} 在线</Badge><Menu><Menu.Target><Button size="compact-sm" variant="white" color="gray" leftSection={<IconDownload size={14} />} rightSection={<IconChevronDown size={13} />}>导出</Button></Menu.Target><Menu.Dropdown><Menu.Item onClick={() => void exportScene('png')}>PNG</Menu.Item><Menu.Item onClick={() => void exportScene('svg')}>SVG</Menu.Item><Menu.Item onClick={() => void exportScene('json')}>Excalidraw JSON</Menu.Item></Menu.Dropdown></Menu></div><Excalidraw excalidrawAPI={(api) => { apiRef.current = api; }} initialData={{ elements: initial.data.scene.elements as never[], appState: initial.data.scene.appState as never, files: initial.data.scene.files as never }} onChange={onChange as never} onPointerUpdate={({ pointer, button }) => realtimeRef.current?.send('whiteboard.pointer', item.id, { pointer, button, userId: user.id, userName: user.name })} viewModeEnabled={role === 'viewer'} isCollaborating /></div>;
}
