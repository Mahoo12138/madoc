import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Group, Modal, Paper, Stack, Text, Textarea } from '@mantine/core';
import { Trash2 as IconTrash } from 'lucide-react';
import { api } from '@/api/client';
import type { Item, ItemComment, Role } from '@/api/types';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ItemCommentsDrawer({ opened, onClose, item, role }: { opened: boolean; onClose: () => void; item: Item; role: Role }) {
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [nextBefore, setNextBefore] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ItemComment>();
  const writable = role === 'owner' || role === 'editor';

  useEffect(() => {
    if (!opened) return;
    let active = true;
    setLoading(true); setError(''); setComments([]); setNextBefore('');
    void api.itemComments(item.id).then((result) => {
      if (active) { setComments(result.comments); setNextBefore(result.nextBefore); }
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : '无法读取评论。');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [opened, item.id]);

  const addComment = async () => {
    if (!body.trim() || busy || !writable) return;
    setBusy(true); setError('');
    try {
      const result = await api.createItemComment(item.id, body);
      setComments((current) => [result.comment, ...current]);
      setBody('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '评论未发送，内容仍保留。'); }
    finally { setBusy(false); }
  };

  const loadOlder = async () => {
    if (!nextBefore || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api.itemComments(item.id, nextBefore);
      setComments((current) => [...current, ...result.comments]);
      setNextBefore(result.nextBefore);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '无法加载更早评论。'); }
    finally { setBusy(false); }
  };

  const removeComment = async () => {
    if (!pendingDelete || busy) return;
    setBusy(true); setError('');
    try {
      await api.deleteItemComment(item.id, pendingDelete.id);
      setComments((current) => current.filter((comment) => comment.id !== pendingDelete.id));
      setPendingDelete(undefined);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '删除评论失败。'); }
    finally { setBusy(false); }
  };

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="min(520px, 100vw)" title={`评论 · ${item.title}`}>
      <Stack h="100%" gap="md">
        <Text size="sm" c="dimmed">评论绑定整篇内容，按时间倒序显示。暂不支持段落锚点、回复和提醒。</Text>
        {error && <Alert color="red" title="操作未完成">{error}</Alert>}
        {writable ? (
          <Stack gap="xs">
            <Textarea label="添加评论" placeholder="写下需要异步讨论的内容" value={body} onChange={(event) => setBody(event.currentTarget.value)} maxLength={4000} minRows={3} maxRows={8} autosize disabled={busy} />
            <Group justify="space-between"><Text size="xs" c="dimmed">{Array.from(body).length} / 4000</Text><Button onClick={() => void addComment()} disabled={!body.trim() || busy} loading={busy}>发送评论</Button></Group>
          </Stack>
        ) : <Alert color="gray">查看者可以阅读评论，但不能新增或删除评论。</Alert>}
        <Stack style={{ overflowY: 'auto', flex: 1 }} gap="sm">
          {loading ? <Text size="sm" c="dimmed">正在读取评论…</Text> : comments.length === 0 ? <Text size="sm" c="dimmed">还没有评论。</Text> : comments.map((comment) => (
            <Paper key={comment.id} withBorder p="sm" radius="md">
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" fw={600} lineClamp={1}>{comment.authorName}</Text>
                  <Group gap="xs" wrap="nowrap"><Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{formatDate(comment.createdAt)}</Text>{comment.canDelete && <Button size="compact-xs" color="red" variant="subtle" aria-label="删除评论" onClick={() => setPendingDelete(comment)}><IconTrash size={14} /></Button>}</Group>
                </Group>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{comment.body}</Text>
              </Stack>
            </Paper>
          ))}
          {nextBefore && <Button variant="default" onClick={() => void loadOlder()} loading={busy}>加载更早评论</Button>}
        </Stack>
      </Stack>
      <Modal opened={Boolean(pendingDelete)} onClose={() => !busy && setPendingDelete(undefined)} title="删除评论？" centered>
        <Stack><Text size="sm">删除后评论将从这篇内容中移除，其他 Workspace 成员也无法再查看。</Text><Group justify="flex-end"><Button variant="default" onClick={() => setPendingDelete(undefined)} disabled={busy}>取消</Button><Button color="red" onClick={() => void removeComment()} loading={busy}>删除评论</Button></Group></Stack>
      </Modal>
    </Drawer>
  );
}
