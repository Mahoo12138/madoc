import { useEffect, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { reconcileElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useWhiteboard } from '@/api/hooks';
import type { BoardScene, Item, Role, User } from '@/api/types';
import { setPendingChanges } from '@/features/account/pending-changes';
import { RealtimeClient } from '@/features/realtime/client';
import { WhiteboardOutbox } from './whiteboard-outbox';
import { WhiteboardDrafts } from './whiteboard-drafts';
import { WhiteboardSaveState } from './whiteboard-save-state';
import { durableBoardScene } from './whiteboard-scene';

export function useWhiteboardSession(item: Item, role: Role, user: User) {
  const initial = useWhiteboard(item.id); const apiRef = useRef<ExcalidrawImperativeAPI>(); const revisionRef = useRef(0); const [status, setStatus] = useState<'Saving' | 'Saved' | 'Offline' | 'Reconnecting' | 'Local'>('Reconnecting'); const [presence, setPresence] = useState(1);
  const realtimeRef = useRef<RealtimeClient>(); const timerRef = useRef(0); const remoteRef = useRef(false); const collaboratorsRef = useRef(new Map());
  const lastScene = useRef<string>();
  const waitingScene = useRef<BoardScene>();
  const saveState = useRef(new WhiteboardSaveState());
  const joined = useRef(false);
  const halted = useRef(false);
  const flushRef = useRef(() => {});
  const [failure, setFailure] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const hydrating = useRef(true);
  const [editorReady, setEditorReady] = useState(false);
  const [drafts] = useState(() => new WhiteboardDrafts(new WhiteboardOutbox(location.origin, user.id, item.workspaceId, item.id, crypto.randomUUID(), item.title)));
  const [recovery, setRecovery] = useState<{ scene: BoardScene }>();
  const publishRef = useRef(() => {});
  const loadRef = useRef(() => {});
  useBlocker({
    shouldBlockFn: async () => {
      await drafts.settle();
      return !drafts.safe(saveState.current.requestId) && !window.confirm('白板修改尚未保存到此设备。离开会丢失这些修改，仍要离开吗？');
    },
    enableBeforeUnload: () => !drafts.safe(saveState.current.requestId),
  });
  const failStorage = () => {
    halted.current = true;
    setStorageFailed(true);
    setStatus('Offline');
    setFailure('无法将白板修改保存到此设备。请重试本地保存，或下载副本；关闭页面可能丢失尚未保存的修改。');
  };
  const persist = (id: string, scene: BoardScene) => {
    void drafts.persist(id, revisionRef.current, scene).then(() => {
      publishRef.current();
      if (id === saveState.current.requestId) {
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => flushRef.current(), 350);
      }
    }).catch(failStorage);
  };
  const finishHydration = () => {
    const api = apiRef.current;
    if (!hydrating.current || !joined.current || !api || halted.current) return;
    const scene = durableBoardScene(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
    lastScene.current = JSON.stringify(scene);
    const id = saveState.current.requestId;
    if (id) persist(id, scene);
    hydrating.current = false;
    setEditorReady(true);
  };
  const onAPIReady = (api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    const scene = waitingScene.current;
    if (scene) {
      waitingScene.current = undefined;
      remoteRef.current = true;
      const elements = reconcileElements(api.getSceneElementsIncludingDeleted(), scene.elements as never[], api.getAppState());
      api.updateScene({ elements, appState: (saveState.current.pending ? durableBoardScene([], api.getAppState(), {}).appState : scene.appState) as never });
      api.addFiles(Object.values(scene.files ?? {}) as never[]);
      window.setTimeout(() => { remoteRef.current = false; finishHydration(); publishRef.current(); }, 0);
    } else { finishHydration(); publishRef.current(); }
  };
  useEffect(() => {
    if (!initial.data) return;
    let disposed = false;
    const load = async () => {
      hydrating.current = true;
      setEditorReady(false);
      let rescue = initial.data!.scene;
      try {
        const loaded = await drafts.load(initial.data!, role === 'viewer');
        if (disposed) return;
        rescue = loaded.scene;
        revisionRef.current = initial.data!.revision;
        if (loaded.requestId) {
          saveState.current.changed(loaded.requestId);
          setPendingChanges(`whiteboard:${item.id}`, true);
        }
        lastScene.current = JSON.stringify(durableBoardScene(loaded.scene.elements, loaded.scene.appState, loaded.scene.files));
        if (loaded.failure) { halted.current = true; setStatus('Offline'); setFailure(loaded.failure); }
        else if (loaded.requestId) await drafts.persist(loaded.requestId, revisionRef.current, loaded.scene);
        if (disposed) return;
        const api = apiRef.current;
        if (api) {
          remoteRef.current = true;
          api.updateScene({ elements: loaded.scene.elements as never[], appState: loaded.scene.appState as never });
          api.addFiles(Object.values(loaded.scene.files) as never[]);
          window.setTimeout(() => { if (!disposed) remoteRef.current = false; }, 0);
        }
        setRecovery({ scene: loaded.scene });
      } catch { if (!disposed) { failStorage(); setFailure('无法读取或准备本地白板草稿，请重试并保留站点数据；当前画布可能尚未包含本地修改。'); setRecovery({ scene: rescue }); } }
    };
    loadRef.current = () => { void load(); };
    void load();
    return () => { disposed = true; };
  }, [item.id, !!initial.data]);
  useEffect(() => {
    if (!initial.data || !recovery || halted.current) return;
    revisionRef.current = initial.data.revision; const realtime = new RealtimeClient(); realtimeRef.current = realtime;
    let disposed = false;
    const flush = () => {
      const api = apiRef.current;
      const id = saveState.current.requestId;
      if (disposed || !api || !id || !drafts.safe(id) || !joined.current || halted.current || role === 'viewer') return;
      const scene = durableBoardScene(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
      if (realtime.sendOnline('whiteboard.scene.update', item.id, { baseRevision: revisionRef.current, scene }, id)) {
        saveState.current.sending(id);
        drafts.sending(id);
      }
    };
    flushRef.current = flush;
    const publish = () => {
      if (halted.current) return;
      if (realtime.state !== 'online') setStatus(saveState.current.pending && drafts.safe(saveState.current.requestId) ? 'Local' : 'Offline');
      else setStatus(!joined.current || hydrating.current ? 'Reconnecting' : saveState.current.pending ? 'Saving' : 'Saved');
    };
    publishRef.current = publish;
    const retry = window.setInterval(flush, 3000);
    const unsubscribe = realtime.subscribe((message) => {
      if (halted.current) return;
      if (message.type === 'connection.changed') {
        joined.current = false;
        const state = (message.payload as { state: string }).state;
        publish();
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
        } else waitingScene.current = payload.scene;
        apiRef.current?.addFiles(Object.values(payload.scene.files ?? {}) as never[]);
        window.setTimeout(() => {
          if (disposed) return;
          remoteRef.current = false;
          if (message.type === 'whiteboard.init') {
            joined.current = true;
            finishHydration();
            flush();
          }
          publish();
        }, 0);
        publish();
      }
      if (message.type === 'whiteboard.scene.ack') {
        const payload = message.payload as { revision: number; clientUpdateId?: string };
        if (!saveState.current.acknowledge(payload.clientUpdateId)) return;
        void drafts.acknowledge(payload.clientUpdateId!).catch(failStorage);
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
      publishRef.current = () => {};
      window.clearInterval(retry);
      window.clearTimeout(timerRef.current);
      realtime.sendOnline('room.leave', item.id);
      unsubscribe();
      realtime.close();
      setPendingChanges(`whiteboard:${item.id}`, false);
    };
  }, [item.id, recovery]);
  const retryStorage = async () => {
    await drafts.settle();
    const id = saveState.current.requestId;
    const api = apiRef.current;
    if (!realtimeRef.current || !id || !api) { halted.current = false; setFailure(''); setStorageFailed(false); loadRef.current(); return; }
    try {
      await drafts.persist(id, revisionRef.current, durableBoardScene(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles()));
      halted.current = false;
      setFailure('');
      setStorageFailed(false);
      joined.current = false;
      realtimeRef.current?.sendOnline('whiteboard.join', item.id);
      publishRef.current();
    } catch { failStorage(); }
  };
  const onChange = (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
    const scene = durableBoardScene(elements, appState, files);
    const serialized = JSON.stringify(scene);
    if (lastScene.current === serialized) return;
    lastScene.current = serialized;
    if (hydrating.current || remoteRef.current || halted.current || role === 'viewer') return;
    saveState.current.changed();
    setPendingChanges(`whiteboard:${item.id}`, true);
    setStatus(realtimeRef.current?.state === 'online' ? 'Saving' : 'Offline');
    persist(saveState.current.requestId!, scene);
  };
  return { initial, apiRef, onAPIReady, recovery, editorReady, status, presence, failure, storageFailed, retryStorage, onChange, halted, joined, realtimeRef };
}
