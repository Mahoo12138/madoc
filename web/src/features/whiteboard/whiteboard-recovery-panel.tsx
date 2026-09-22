import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { listWhiteboardDrafts, type WhiteboardDraft } from './whiteboard-outbox';

export default function WhiteboardRecoveryPanel({ userId }: { userId: string }) {
  const [records, setRecords] = useState<WhiteboardDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  const load = async () => {
    const id = ++request.current;
    setLoading(true);
    setError('');
    try {
      const drafts = await listWhiteboardDrafts(location.origin, userId);
      if (request.current === id) setRecords(drafts.sort((a, b) => b.updatedAt - a.updatedAt || a.key.localeCompare(b.key)));
    } catch {
      if (request.current === id) setError('无法读取本地白板草稿，请重试并保留站点数据。');
    } finally {
      if (request.current === id) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [userId]);

  const download = (record: WhiteboardDraft) => {
    try {
      // Keep the captured draft intact, including deleted elements and embedded
      // files. Downloading is not a server ACK and must never clear the outbox.
      const contents = JSON.stringify({ type: 'excalidraw', version: 2, source: 'madoc', ...record.scene }, null, 2);
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${record.title || '白板'}-本地副本.excalidraw`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError('无法下载此白板副本，请重试。原始草稿仍保留在此设备。');
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>白板本地恢复</Title>
        <Button variant="subtle" onClick={() => void load()} loading={loading}>刷新白板列表</Button>
      </Group>
      <Text size="sm" c="dimmed">
        当前账号在此浏览器的未确认草稿。原白板已删除或无法访问时仍可下载；同一白板的多个标签页副本分别保留。文件包含草稿内的图片数据，可用兼容 Excalidraw 的编辑器打开。下载不会清除记录或写入服务器。
      </Text>
      {error && <Alert color="red">{error}</Alert>}
      {loading ? <Loader size="sm" aria-label="正在读取白板草稿" /> : !error && records.length === 0 ? (
        <Text size="sm">此设备没有需要恢复的白板。</Text>
      ) : records.map((record, index) => (
        <Paper key={record.key} withBorder p="sm">
          <Stack gap="xs">
            <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{record.title || '未命名白板'}</Text>
            <Text size="xs" c="dimmed">{new Date(record.updatedAt).toLocaleString()} · 副本 {index + 1}</Text>
            <Group justify="space-between">
              <Badge variant="light">待确认草稿</Badge>
              <Button size="xs" variant="light" onClick={() => download(record)}>下载白板本地副本</Button>
            </Group>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
