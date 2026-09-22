import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keys, useItems } from '@/api/hooks';
import { trashAPI, trashKey, type TrashBatch } from '@/api/trash';
import { APIError, type Item, type Workspace } from '@/api/types';

function itemPath(item: Item, items: Item[]): string {
  const parts = [item.title];
  const seen = new Set([item.id]);
  let parent = items.find((entry) => entry.id === item.parentId);
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    parts.unshift(parent.title);
    parent = items.find((entry) => entry.id === parent!.parentId);
  }
  return parts.join(' / ');
}
function message(error: Error) {
  if (error instanceof APIError) {
    if (error.status === 403)
      return '当前账号已无权执行此操作，请刷新页面确认权限。';
    if (error.status === 404) return '此批次已不存在或无法访问，请刷新列表。';
    if (error.code === 'RESTORE_DESTINATION_REQUIRED')
      return '原目录不可用，请选择恢复位置。';
  }
  return '操作未完成，请检查网络后重试。';
}
function BatchItems({
  workspaceId,
  batchId,
}: {
  workspaceId: string;
  batchId: string;
}) {
  const query = useQuery({
    queryKey: [...trashKey(workspaceId), batchId],
    queryFn: () => trashAPI.items(workspaceId, batchId),
    retry: false,
  });
  if (query.isPending) return <Loader size="sm" aria-label="加载内容" />;
  if (query.error)
    return (
      <Alert color="red">
        {message(query.error)}
        <Button variant="subtle" onClick={() => void query.refetch()}>
          重试加载内容
        </Button>
      </Alert>
    );
  return (
    <Stack gap={4}>
      {query.data.map((item) => (
        <Text key={item.id} size="sm" style={{ overflowWrap: 'anywhere' }}>
          {itemPath(item, query.data)}
        </Text>
      ))}
    </Stack>
  );
}

export function WorkspaceTrash({
  workspace,
  onClose,
}: {
  workspace: Workspace;
  onClose: () => void;
}) {
  const mobile = useMediaQuery('(max-width: 48em)');
  const client = useQueryClient();
  const items = useItems(workspace.id);
  const list = useQuery({
    queryKey: trashKey(workspace.id),
    queryFn: () => trashAPI.list(workspace.id),
    retry: false,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [action, setAction] = useState<{
    batch: TrashBatch;
    mode: 'restore' | 'purge';
  } | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const mutation = useMutation({
    mutationFn: (input: {
      batch: TrashBatch;
      mode: 'restore' | 'purge';
      parentId?: string | null;
    }) =>
      input.mode === 'purge'
        ? trashAPI.purge(workspace.id, input.batch.id, confirmation)
        : trashAPI.restore(workspace.id, input.batch.id, input.parentId),
    onSuccess: async (_, input) => {
      setAction(null);
      setConfirmation('');
      setDestination(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: trashKey(workspace.id) }),
        client.invalidateQueries({ queryKey: keys.items(workspace.id) }),
      ]);
      notifications.show({
        message: input.mode === 'restore' ? '内容已恢复' : '内容已彻底删除',
      });
    },
    onError: (error, input) => {
      if (
        error instanceof APIError &&
        error.code === 'RESTORE_DESTINATION_REQUIRED'
      ) {
        setAction({ batch: input.batch, mode: 'restore' });
        setDestination(null);
      }
    },
  });
  const busy = mutation.isPending;
  const choose = (batch: TrashBatch, mode: 'restore' | 'purge') => {
    mutation.reset();
    setConfirmation('');
    setDestination(null);
    setAction({ batch, mode });
  };
  return (
    <Modal
      opened
      onClose={() => {
        if (!busy) onClose();
      }}
      title="回收站"
      size="lg"
      fullScreen={mobile}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          已删除内容按批次保留，不会自动清理。恢复文件夹会同时恢复该批次中的内容。
        </Text>
        {mutation.error && (
          <Alert color="red" role="alert">
            {message(mutation.error)}
          </Alert>
        )}
        {action ? (
          <Stack>
            <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
              {action.batch.root.title}
            </Text>
            {action.mode === 'purge' ? (
              <>
                <Text size="sm">
                  将永久删除此批次中的 {action.batch.itemCount}{' '}
                  项内容，无法撤销。其他删除批次不受影响。
                </Text>
                <TextInput
                  autoFocus
                  label="输入完整名称以确认"
                  description={action.batch.root.title}
                  value={confirmation}
                  onChange={(event) =>
                    setConfirmation(event.currentTarget.value)
                  }
                  disabled={busy}
                  autoComplete="off"
                />
              </>
            ) : (
              <>
                <Select
                  label="恢复位置"
                  placeholder="请选择恢复位置"
                  searchable
                  value={destination}
                  onChange={setDestination}
                  disabled={busy || items.isError || items.isPending}
                  data={[
                    { value: 'root', label: 'Workspace 根目录' },
                    ...(items.data ?? [])
                      .filter((item) => item.type === 'folder')
                      .map((item) => ({
                        value: item.id,
                        label: itemPath(item, items.data ?? []),
                      })),
                  ]}
                />
                {items.error && (
                  <Alert color="red">
                    目录加载失败。
                    <Button onClick={() => void items.refetch()}>
                      重试加载目录
                    </Button>
                  </Alert>
                )}
              </>
            )}
            <Group justify="flex-end">
              <Button
                variant="default"
                disabled={busy}
                onClick={() => {
                  setAction(null);
                  mutation.reset();
                }}
              >
                返回列表
              </Button>
              <Button
                color={action.mode === 'purge' ? 'red' : undefined}
                loading={busy}
                disabled={
                  busy ||
                  (action.mode === 'purge'
                    ? confirmation !== action.batch.root.title
                    : destination === null || items.isError || items.isPending)
                }
                onClick={() =>
                  mutation.mutate({
                    ...action,
                    parentId:
                      destination === 'root'
                        ? null
                        : (destination ?? undefined),
                  })
                }
              >
                {action.mode === 'purge' ? '确认永久删除' : '确认恢复'}
              </Button>
            </Group>
          </Stack>
        ) : (
          <>
            <Group justify="space-between">
              <Text size="sm">{list.data?.length ?? 0} 个删除批次</Text>
              <Button
                variant="subtle"
                disabled={busy}
                loading={list.isFetching}
                onClick={() => {
                  mutation.reset();
                  void list.refetch();
                }}
              >
                刷新列表
              </Button>
            </Group>
            {list.isPending && <Loader aria-label="加载回收站" />}
            {list.error && (
              <Alert color="red" role="alert">
                {message(list.error)}
              </Alert>
            )}
            {!list.isPending && !list.error && list.data?.length === 0 && (
              <Text c="dimmed">回收站为空</Text>
            )}
            {list.data?.map((batch) => (
              <Paper
                key={batch.id}
                withBorder
                p="md"
                role="group"
                aria-label={`删除批次：${batch.root.title}`}
              >
                <Stack gap="xs">
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {batch.root.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {batch.itemCount} 项 ·{' '}
                    {new Date(batch.deletedAt).toLocaleString()}
                  </Text>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      aria-expanded={expanded === batch.id}
                      onClick={() =>
                        setExpanded(expanded === batch.id ? null : batch.id)
                      }
                    >
                      {expanded === batch.id ? '收起内容' : '查看内容'}
                    </Button>
                    <Button
                      size="xs"
                      disabled={busy}
                      onClick={() => {
                        mutation.reset();
                        mutation.mutate({ batch, mode: 'restore' });
                      }}
                    >
                      恢复
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      disabled={busy}
                      onClick={() => choose(batch, 'restore')}
                    >
                      恢复到…
                    </Button>
                    {workspace.role === 'owner' && (
                      <Button
                        size="xs"
                        color="red"
                        variant="subtle"
                        disabled={busy}
                        onClick={() => choose(batch, 'purge')}
                      >
                        彻底删除
                      </Button>
                    )}
                  </Group>
                  {expanded === batch.id && (
                    <BatchItems workspaceId={workspace.id} batchId={batch.id} />
                  )}
                </Stack>
              </Paper>
            ))}
          </>
        )}
      </Stack>
    </Modal>
  );
}
