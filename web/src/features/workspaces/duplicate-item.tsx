import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { request } from '@/api/client';
import { keys } from '@/api/hooks';
import { APIError, type Item } from '@/api/types';
import { prepareContentSave } from '@/features/content/content-save';

export function DuplicateItem({
  item,
  active,
  onClose,
  onOpen,
}: {
  item: Item;
  active: boolean;
  onClose: () => void;
  onOpen?: () => void;
}) {
  const [title, setTitle] = useState(`${item.title} 副本`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Item>();
  const attempt = useRef<AbortController>();
  const navigate = useNavigate();
  const queries = useQueryClient();
  useEffect(() => () => attempt.current?.abort(), []);
  const copy = async () => {
    if (attempt.current || created || !title.trim()) return;
    const controller = new AbortController();
    attempt.current = controller;
    setBusy(true);
    setError('');
    let timedOut = false;
    let timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 8000);
    let submitted = false;
    try {
      await prepareContentSave(item.id, active, controller.signal);
      window.clearTimeout(timer);
      submitted = true;
      timer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15000);
      const result = await request<Item>(`/items/${item.id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ title }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setCreated(result);
      void queries.invalidateQueries({
        queryKey: keys.items(item.workspaceId),
      });
    } catch (failure) {
      if (timedOut && !submitted)
        setError('等待保存超时，尚未创建副本。请确认网络和保存状态后重试。');
      else if (timedOut || !controller.signal.aborted)
        setError(
          failure instanceof APIError
            ? failure.message
            : submitted
              ? '复制结果未确认，请先检查目录，再决定是否重试。'
              : failure instanceof Error
                ? failure.message
                : '无法确认保存，请重试。',
        );
    } finally {
      window.clearTimeout(timer);
      attempt.current = undefined;
      setBusy(false);
    }
  };
  return (
    <Modal
      opened
      title="复制内容"
      onClose={onClose}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
    >
      <Stack>
        <Text size="sm">
          在原目录创建独立副本，保留附件引用。
          {active
            ? '当前修改会先等待保存确认。'
            : '使用服务器已保存内容，其他窗口未同步的修改不包含在内。'}
        </Text>
        <TextInput
          label="副本名称"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          disabled={busy || !!created}
          autoFocus
        />
        {busy && (
          <Text role="status" size="sm">
            正在确认保存并复制…
          </Text>
        )}
        {error && <Alert color="red">{error}</Alert>}
        {created ? (
          <>
            <Alert color="green">副本已创建。</Alert>
            <Group>
              <Button
                onClick={async () => {
                  await navigate({
                    to: '/workspace/$workspaceId/$itemId',
                    params: {
                      workspaceId: created.workspaceId,
                      itemId: created.id,
                    },
                  });
                  onOpen?.();
                  onClose();
                }}
              >
                打开副本
              </Button>
              <Button variant="default" onClick={onClose}>
                关闭
              </Button>
            </Group>
          </>
        ) : (
          <Button
            loading={busy}
            disabled={!title.trim()}
            onClick={() => void copy()}
          >
            创建副本
          </Button>
        )}
      </Stack>
    </Modal>
  );
}
