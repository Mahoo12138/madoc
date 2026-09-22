import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate } from '@tanstack/react-router';
import { useWorkspaceSettings } from '@/api/workspace-settings-hooks';
import { APIError, type Workspace } from '@/api/types';

function errorMessage(error: Error | null) {
  if (!error) return null;
  if (error instanceof APIError && error.code === 'CSRF_INVALID')
    return '会话校验已失效，请刷新页面后重试。';
  if (error instanceof APIError && error.code === 'FORBIDDEN')
    return '当前账号已无权管理此 Workspace，请刷新页面确认权限。';
  if (error instanceof APIError && error.status === 404)
    return '此 Workspace 已不存在或你已无法访问，请返回 Workspace 列表。';
  return '操作未完成，请检查网络后重试。';
}

export function WorkspaceSettings({
  opened,
  workspace,
  onClose,
}: {
  opened: boolean;
  workspace: Workspace;
  onClose: () => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const { rename, remove } = useWorkspaceSettings(workspace.id);
  const navigate = useNavigate();
  const busy = rename.isPending || remove.isPending;
  const error = errorMessage(confirming ? remove.error : rename.error);
  const canRename = name.trim() !== '' && name.trim() !== workspace.name;
  const canDelete = confirmation === workspace.name;

  const resetRename = rename.reset;
  const resetRemove = remove.reset;
  useEffect(() => {
    if (!opened) {
      setName(workspace.name);
      setConfirming(false);
      setConfirmation('');
      resetRename();
      resetRemove();
    }
  }, [opened, workspace.name, resetRename, resetRemove]);

  if (workspace.role !== 'owner') return null;

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={confirming ? '删除 Workspace' : 'Workspace 设置'}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
    >
      <Stack>
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        {confirming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!canDelete || busy) return;
              remove.mutate(undefined, {
                onSuccess: () => {
                  onClose();
                  void navigate({ to: '/workspaces', replace: true });
                  notifications.show({
                    message: 'Workspace 已删除',
                    color: 'blue',
                  });
                },
              });
            }}
          >
            <Stack>
              <Text size="sm">
                将永久删除“{workspace.name}
                ”及其全部文档、白板和成员关系。此操作无法撤销，请先确认已备份需要保留的内容。
              </Text>
              <TextInput
                autoFocus
                label="输入 Workspace 名称以确认"
                description={workspace.name}
                value={confirmation}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
                disabled={busy}
                autoComplete="off"
              />
              <Group justify="flex-end">
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    setConfirmation('');
                    remove.reset();
                  }}
                >
                  取消删除
                </Button>
                <Button
                  type="submit"
                  color="red"
                  disabled={!canDelete || busy}
                  loading={remove.isPending}
                >
                  永久删除
                </Button>
              </Group>
            </Stack>
          </form>
        ) : (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!canRename || busy) return;
                rename.mutate(name.trim(), {
                  onSuccess: () => {
                    onClose();
                    notifications.show({
                      message: 'Workspace 名称已更新',
                      color: 'blue',
                    });
                  },
                });
              }}
            >
              <Stack>
                <TextInput
                  autoFocus
                  label="Workspace 名称"
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  disabled={busy}
                />
                <Group justify="flex-end">
                  <Button variant="default" onClick={onClose} disabled={busy}>
                    取消
                  </Button>
                  <Button
                    type="submit"
                    disabled={!canRename || busy}
                    loading={rename.isPending}
                  >
                    保存名称
                  </Button>
                </Group>
              </Stack>
            </form>
            <Divider />
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                删除 Workspace
              </Text>
              <Text size="sm" c="dimmed">
                删除后，所有成员都将无法访问其中的文档和白板。
              </Text>
              <Group>
                <Button
                  color="red"
                  variant="light"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                >
                  删除 Workspace
                </Button>
              </Group>
            </Stack>
          </>
        )}
      </Stack>
    </Modal>
  );
}
