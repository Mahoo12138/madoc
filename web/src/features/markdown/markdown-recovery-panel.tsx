import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Modal, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { api } from '@/api/client';
import { APIError } from '@/api/types';
import { archiveLocalRecovery, listLocalRecoveries, type LocalRecovery } from './markdown-outbox';

export default function MarkdownRecoveryPanel({ userId }: { userId: string }) {
  const [records, setRecords] = useState<LocalRecovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<{ record: LocalRecovery; markdown: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const request = useRef(0);
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRecords(await listLocalRecoveries(location.origin, userId));
    } catch {
      setError('无法读取此设备的恢复记录，请重试。记录未被删除。');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [userId]);

  const preview = async (record: LocalRecovery) => {
    const id = ++request.current;
    setBusy(true);
    setError('');
    setSelected(null);
    try {
      const { recoverMarkdown } = await import('./markdown-recovery');
      const markdown = await recoverMarkdown(record.records.map(value => value.update));
      if (request.current === id) setSelected({ record, markdown });
    } catch {
      if (request.current === id) setError('无法重建这份正文，原始恢复记录仍保留在此设备。');
    } finally {
      if (request.current === id) setBusy(false);
    }
  };
  const archive = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const current = await api.markdown(selected.record.itemId);
      if (!Number.isSafeInteger(current.generation) || current.generation <= selected.record.generation) {
        throw new Error('这份记录仍属于当前文档，不能停止重试。请重新打开文档完成同步。');
      }
      await archiveLocalRecovery(selected.record);
      setConfirm(false);
      setSelected(null);
      await load();
    } catch (error) {
      setError(error instanceof APIError ? '无法确认服务器上的文档版本，记录未被处理。你仍可以下载本地副本。' : error instanceof Error ? error.message : '处理失败，记录未被删除。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>本地恢复</Title>
        <Button variant="subtle" onClick={() => void load()} disabled={busy} loading={loading}>刷新列表</Button>
      </Group>
      <Text size="sm" c="dimmed">
        仅显示当前账号在此浏览器留下的待提交或已处理记录。即使原文档已删除或无法访问，仍可下载本地正文；附件不会随副本下载。
      </Text>
      {error && <Alert color="red" role="alert">{error}</Alert>}
      {loading ? <Loader size="sm" /> : records.length === 0 ? (
        <Text size="sm">此设备没有需要恢复的文档。</Text>
      ) : records.map(record => (
        <Paper key={record.scope} withBorder p="sm">
          <Stack gap="xs">
            <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{record.title}</Text>
            <Text size="xs" c="dimmed">
              {record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '早期本地记录'}
            </Text>
            <Group justify="space-between">
              <Badge variant="light">{record.pendingIds.length ? `${record.pendingIds.length} 项待提交` : '已处理，副本保留'}</Badge>
              <Button size="xs" variant="light" disabled={busy} onClick={() => void preview(record)}>查看本地副本</Button>
            </Group>
          </Stack>
        </Paper>
      ))}
      {busy && <Loader size="sm" aria-label="正在读取本地副本" />}
      {selected && (
        <Stack gap="sm">
          <Text size="sm">以下是选择时重建的 Markdown 正文，不会写入服务器。</Text>
          <Textarea label="本地 Markdown 副本" value={selected.markdown} readOnly autosize minRows={5} maxRows={14} />
          <Group>
            <Button onClick={async () => {
              const { downloadRecovery } = await import('./markdown-recovery');
              downloadRecovery(selected.markdown, selected.record.title);
            }}>下载本地副本</Button>
            {selected.record.pendingIds.length > 0 && (
              <Button variant="default" disabled={busy} onClick={() => setConfirm(true)}>处理旧版本记录</Button>
            )}
          </Group>
        </Stack>
      )}
      <Modal opened={confirm} onClose={() => !busy && setConfirm(false)} title="处理旧版本记录？" closeOnClickOutside={!busy} closeOnEscape={!busy}>
        <Stack>
          <Text size="sm">请先下载需要保留的副本。只有服务器已替换的旧版本才能标记处理；完成后可重新打开服务器文档，旧副本仍保留在本地恢复列表中。</Text>
          {error && <Alert color="red" role="alert">{error}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" disabled={busy} onClick={() => setConfirm(false)}>取消</Button>
            <Button loading={busy} onClick={() => void archive()}>标记已处理</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
