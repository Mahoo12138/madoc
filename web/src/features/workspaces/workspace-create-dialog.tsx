import { useRef, useState } from 'react';
import { Alert, Button, Modal, Stack, TextInput } from '@mantine/core';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { useWorkspaceMutations } from '@/api/hooks';
import { APIError } from '@/api/types';
import { touchAction, touchRow } from '@/styles/interaction.css';
import * as styles from './workspace-list-page.css';

export function CreateWorkspaceDialog({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { createWorkspace } = useWorkspaceMutations();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [preventedLeave, setPreventedLeave] = useState(false);
  const submitting = useRef(false);
  const allowLeave = useRef(false);
  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      const blocked =
        current.pathname !== next.pathname &&
        submitting.current &&
        !allowLeave.current;
      if (blocked) setPreventedLeave(true);
      return blocked;
    },
    enableBeforeUnload: createWorkspace.isPending,
  });
  const close = () => {
    if (submitting.current) return;
    setName('');
    setPreventedLeave(false);
    createWorkspace.reset();
    onClose();
  };
  const create = async () => {
    if (!name.trim() || submitting.current) return;
    submitting.current = true;
    setPreventedLeave(false);
    try {
      const workspace = await createWorkspace.mutateAsync(name.trim());
      allowLeave.current = true;
      setName('');
      onClose();
      await navigate({
        to: '/workspace/$workspaceId',
        params: { workspaceId: workspace.id },
      });
    } catch {
      // The mutation error remains visible and the draft can be retried.
    } finally {
      submitting.current = false;
      allowLeave.current = false;
      setPreventedLeave(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="新建工作区"
      closeButtonProps={{
        'aria-label': '关闭新建工作区',
        className: touchAction,
      }}
      closeOnEscape={!createWorkspace.isPending}
      closeOnClickOutside={!createWorkspace.isPending}
      withCloseButton={!createWorkspace.isPending}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Stack gap="lg">
          <TextInput
            data-autofocus
            label="名称"
            description="为文档和白板准备一个共同的空间。"
            placeholder="例如：我的工作区"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            disabled={createWorkspace.isPending}
            required
            autoComplete="off"
            classNames={{ input: touchRow }}
          />
          {createWorkspace.error && (
            <Alert color="red" title="创建工作区失败" role="alert">
              {createWorkspace.error instanceof APIError
                ? '请检查名称和网络连接后重试，输入内容已保留。'
                : '无法确认创建结果，请先刷新工作区列表确认，再重试。'}
            </Alert>
          )}
          {preventedLeave && createWorkspace.isPending && (
            <Alert color="blue" role="status">
              正在创建工作区，请等待操作完成。
            </Alert>
          )}
          <div className={styles.dialogActions}>
            <Button
              className={touchRow}
              variant="default"
              onClick={close}
              disabled={createWorkspace.isPending}
            >
              取消
            </Button>
            <Button
              className={touchRow}
              type="submit"
              loading={createWorkspace.isPending}
              disabled={!name.trim() || createWorkspace.isPending}
            >
              创建
            </Button>
          </div>
        </Stack>
      </form>
    </Modal>
  );
}
