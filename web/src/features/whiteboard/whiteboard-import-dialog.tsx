import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { request } from '@/api/client';
import { keys } from '@/api/hooks';
import { APIError, type Item } from '@/api/types';

type ImportedBoard = { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> };
const maxCreateRequestBytes = 2 * 1024 * 1024 - 1;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function WhiteboardImportDialog({
  file,
  workspaceId,
  parentId,
  onClose,
}: {
  file?: File;
  workspaceId: string;
  parentId: string | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [scene, setScene] = useState<ImportedBoard>();
  const [reading, setReading] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const created = useRef<Item>();
  const queries = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    created.current = undefined;
    setError('');
    setScene(undefined);
    setReady(false);
    setTitle(file?.name.replace(/\.excalidraw$/i, '') ?? '');
    if (!file) { setReading(false); return; }
    if (!/\.excalidraw$/i.test(file.name)) {
      setError('目前只支持 Excalidraw 文件（.excalidraw）。');
      setReading(false);
      return;
    }
    if (file.size > maxCreateRequestBytes) {
      setError('文件超过当前 2 MiB 请求上限，尚未读取或创建。');
      setReading(false);
      return;
    }
    setReading(true);
    void file.text().then((text) => {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.type !== 'excalidraw' || parsed.version !== 2 || !Array.isArray(parsed.elements) || !isRecord(parsed.appState) || !isRecord(parsed.files)) {
        throw new Error('文件结构无效或版本不受支持。');
      }
      const next: ImportedBoard = { elements: parsed.elements, appState: parsed.appState, files: parsed.files };
      const defaultTitle = file.name.replace(/\.excalidraw$/i, '');
      const bodySize = new TextEncoder().encode(JSON.stringify({ type: 'whiteboard', title: defaultTitle, parentId, initialWhiteboard: next })).byteLength;
      if (bodySize > maxCreateRequestBytes) throw new Error('白板转换后的内容超过当前 2 MiB 请求上限。');
      if (active) { setScene(next); setReady(true); }
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : '无法读取这个 Excalidraw 文件。');
    }).finally(() => {
      if (active) setReading(false);
    });
    return () => { active = false; };
  }, [file, parentId]);

  const save = async () => {
    if (!file || !scene || !ready || !title.trim() || reading || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    let posting = false;
    try {
      if (!created.current) {
        const body = { type: 'whiteboard', title: title.trim(), parentId, initialWhiteboard: scene };
        if (new TextEncoder().encode(JSON.stringify(body)).byteLength > maxCreateRequestBytes) {
          throw new Error('白板转换后的内容超过当前 2 MiB 请求上限。');
        }
        posting = true;
        created.current = await request<Item>(`/workspaces/${workspaceId}/items`, { method: 'POST', body: JSON.stringify(body) });
        void queries.invalidateQueries({ queryKey: keys.items(workspaceId) });
      }
      await navigate({ to: '/workspace/$workspaceId/$itemId', params: { workspaceId, itemId: created.current.id } });
      onClose();
    } catch (failure) {
      setError(created.current
        ? '白板已创建，但打开失败。可重试打开，也可以从目录中选择。'
        : failure instanceof APIError
          ? failure.message
          : posting
            ? '创建结果未确认，请先检查目录；确认未创建后再重试。'
            : failure instanceof Error
              ? failure.message
              : '导入失败，请重试。');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal opened={Boolean(file)} title="导入 Excalidraw 预览" onClose={onClose} closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack>
        <TextInput label="新白板名称" value={title} onChange={(event) => setTitle(event.currentTarget.value)} disabled={busy || !!created.current} autoFocus />
        <Text size="sm" c="dimmed">文件：{file?.name ?? ''}</Text>
        {reading ? <Text size="sm">正在读取文件…</Text> : scene && (
          <Stack gap={4}>
            <Text size="sm">元素：{scene.elements.length}</Text>
            <Text size="sm">嵌入文件：{Object.keys(scene.files).length}</Text>
          </Stack>
        )}
        <Text size="sm" c="blue.7">导入会在当前文件夹中新建白板，不会覆盖当前白板；Excalidraw 文件中的元素和嵌入文件会一并保留。</Text>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Button loading={busy} disabled={reading || !ready || !title.trim()} onClick={() => void save()}>
          {created.current ? '重新打开白板' : '创建为新白板'}
        </Button>
      </Stack>
    </Modal>
  );
}
