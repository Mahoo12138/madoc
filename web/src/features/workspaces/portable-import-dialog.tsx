import { useEffect, useRef, useState } from 'react';
import { Alert, Button, FileButton, Group, Modal, Pagination, Progress, Stack, Table, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { readPortablePackageSelection, type PortableImportPreview } from './portable-package-selection';
import * as styles from './portable-import.css';

const pageSize = 30;
const typeLabels = { folder: '文件夹', markdown: '文档', whiteboard: '白板' };

export function PortableImportDialog({ onClose }: { onClose: () => void }) {
  const mobile = useMediaQuery('(max-width: 760px)');
  const [preview, setPreview] = useState<PortableImportPreview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const attempt = useRef<AbortController>();
  const resetInput = useRef<() => void>(null);
  useEffect(
    () => () => {
      attempt.current?.abort();
      attempt.current = undefined;
    },
    [],
  );

  const read = async (files: File[]) => {
    if (!files.length) return;
    attempt.current?.abort();
    const controller = new AbortController();
    attempt.current = controller;
    setPreview(undefined);
    setError('');
    setPage(1);
    setProgress({ done: 0, total: files.length });
    setBusy(true);
    try {
      const result = await readPortablePackageSelection(files, undefined, controller.signal, (done, total) => {
        if (attempt.current === controller) setProgress({ done, total });
      });
      if (attempt.current === controller && !controller.signal.aborted) setPreview(result);
    } catch (failure) {
      if (attempt.current === controller && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : '无法读取导入包，请重新选择。');
    } finally {
      if (attempt.current === controller) {
        attempt.current = undefined;
        setBusy(false);
        resetInput.current?.();
      }
    }
  };
  const cancel = () => {
    attempt.current?.abort();
    attempt.current = undefined;
    setBusy(false);
    setError('已取消读取，可以重新选择文件。');
    resetInput.current?.();
  };

  return (
    <Modal opened title="导入包预览" onClose={onClose} fullScreen={mobile} size="lg">
      <Stack>
        <Text size="sm">
          选择 madoc 导出的文件夹或 Workspace ZIP。若为分包，请同时选择 .package-set.json 清单与全部 ZIP。
        </Text>
        <Text size="sm" c="dimmed">
          整组上限：压缩文件合计 256 MiB、解压合计 512 MiB、5000 个文件和目录（含清单）。
        </Text>
        <Group>
          <FileButton onChange={(files) => void read(files)} accept=".zip,.json" multiple resetRef={resetInput}>
            {(props) => (
              <Button {...props} disabled={busy}>
                {preview ? '重新选择导入包' : '选择导入包'}
              </Button>
            )}
          </FileButton>
          {busy && (
            <Button variant="default" onClick={cancel}>
              取消读取
            </Button>
          )}
        </Group>
        {busy && (
          <>
            <Progress aria-label="读取进度" value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            <Text role="status" size="sm">
              正在校验文件：{progress.done} / {progress.total}
            </Text>
          </>
        )}
        {error && (
          <Alert color="orange" role="alert">
            {error}
          </Alert>
        )}
        {preview && (
          <>
            <Alert color="green" title="导入包校验通过">
              {preview.fileCount} 个文件已完整读取。当前为只读预览，尚未创建任何内容。
            </Alert>
            <Text fw={600}>根目录：{preview.manifest.root.title}</Text>
            <Text size="sm">
              {preview.directoryCount} 个文件夹 · {preview.markdownCount} 篇文档 · {preview.whiteboardCount} 个白板 ·{' '}
              {preview.attachments.length} 个附件
            </Text>
            <Text size="sm" c="dimmed">
              解压合计 {(preview.expandedBytes / 1024 / 1024).toFixed(2)} MiB
            </Text>
            <Table className={styles.table} aria-label="导入目录结构">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>路径</Table.Th>
                  <Table.Th>类型</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {preview.items.slice((page - 1) * pageSize, page * pageSize).map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>{item.path}</Table.Td>
                    <Table.Td>{typeLabels[item.type]}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {preview.items.length > pageSize && (
              <Pagination
                total={Math.ceil(preview.items.length / pageSize)}
                value={page}
                onChange={setPage}
                size="sm"
                siblings={0}
              />
            )}
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            关闭预览
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
