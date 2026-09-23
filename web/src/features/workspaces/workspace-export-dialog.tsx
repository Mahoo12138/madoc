import { useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Item, Workspace } from '@/api/types';
import { downloadPortablePackage, exportWorkspacePackage } from './folder-portable-export';

export function WorkspaceExportDialog({ workspace, items, onClose }: { workspace: Workspace; items: Item[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const attempt = useRef<AbortController>();

  const run = async () => {
    if (attempt.current) return;
    const controller = new AbortController();
    attempt.current = controller;
    setBusy(true);
    setError('');
    setProgress({ done: 0, total: items.filter((item) => item.type !== 'folder').length });
    try {
      const result = await exportWorkspacePackage(workspace, items, controller.signal, (done, total) => setProgress({ done, total }));
      if (controller.signal.aborted) return;
      downloadPortablePackage(result.data, result.fileName);
      notifications.show({ message: `Workspace 导出完成：${result.itemCount} 个内容、${result.attachmentCount} 个附件；${result.externalImageCount} 个外部图片仍使用原地址。` });
      onClose();
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Workspace 导出失败，请重试。');
    } finally {
      if (attempt.current === controller) attempt.current = undefined;
      setBusy(false);
    }
  };

  return (
    <Modal opened title={`导出 Workspace：${workspace.name}`} onClose={busy ? () => {} : onClose} closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack>
        <Text size="sm">将按每篇内容分别捕获服务端已保存版本，并记录各自水位和时间。未确认修改不会包含；这不是 Workspace 同一时刻的快照。</Text>
        {busy && <Progress value={progress.total ? progress.done / progress.total * 100 : 0} aria-label="导出进度" />}
        {busy && <Text size="sm">正在捕获内容：{progress.done} / {progress.total}</Text>}
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          {busy && <Button variant="default" onClick={() => attempt.current?.abort()}>取消</Button>}
          <Button loading={busy} onClick={() => void run()} disabled={busy}>{busy ? '正在打包…' : '生成 ZIP'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
