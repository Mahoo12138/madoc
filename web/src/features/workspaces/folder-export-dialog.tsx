import { useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Item } from '@/api/types';
import { downloadPortableExport, exportFolderPackage } from './folder-portable-export';

function folderContentCount(folder: Item, items: Item[]) {
  const children = new Map<string | null, Item[]>();
  for (const item of items) children.set(item.parentId, [...(children.get(item.parentId) ?? []), item]);
  let count = 0;
  const visited = new Set<string>();
  const visit = (parentId: string) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    for (const child of children.get(parentId) ?? []) {
      if (child.type === 'folder') visit(child.id);
      else count++;
    }
  };
  visit(folder.id);
  return count;
}

export function FolderExportDialog({ folder, items, onClose }: { folder: Item; items: Item[]; onClose: () => void }) {
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
    setProgress({ done: 0, total: folderContentCount(folder, items) });
    try {
      const result = await exportFolderPackage(folder, items, controller.signal, (done, total) => setProgress({ done, total }));
      if (controller.signal.aborted) return;
      downloadPortableExport(result);
      const packageCount = result.mode === 'set' ? result.packages.length : 1;
      notifications.show({ message: `文件夹导出完成：${packageCount} 个 ZIP、${result.itemCount} 个内容、${result.attachmentCount} 个附件；${result.externalImageCount} 个外部图片仍使用原地址。` });
      onClose();
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '文件夹导出失败，请重试。');
    } finally {
      if (attempt.current === controller) attempt.current = undefined;
      setBusy(false);
    }
  };

  return (
    <Modal opened title={`导出文件夹：${folder.title}`} onClose={busy ? () => {} : onClose} closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack>
        <Text size="sm">将按每篇内容分别捕获服务端已保存版本，并记录各自水位和时间。未确认修改不会包含；这不是文件夹同一时刻的快照。附件总量不超过 50 MiB 时导出单个 ZIP；超过时拆成内容包和附件包，并附包集清单。分包需解压到同一目录；浏览器可能询问是否允许下载多个文件。</Text>
        {busy && <Progress value={progress.total ? progress.done / progress.total * 100 : 0} aria-label="导出进度" />}
        {busy && <Text size="sm">正在捕获内容：{progress.done} / {progress.total}</Text>}
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          {busy && <Button variant="default" onClick={() => attempt.current?.abort()}>取消</Button>}
          <Button loading={busy} onClick={() => void run()} disabled={busy}>{busy ? '正在打包…' : '生成导出包'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
