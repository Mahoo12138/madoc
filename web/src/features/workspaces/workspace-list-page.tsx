import { useState } from 'react';
import {
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ChevronRight as IconChevronRight,
  Plus as IconPlus,
} from 'lucide-react';
import { useSession, useWorkspaces, useWorkspaceMutations } from '@/api/hooks';
import { AccountMenu } from '@/features/account/account-menu';
import * as styles from './workspace-list-page.css';
import { roleLabels } from './role-labels';
import { WorkspaceLoadNotice } from './workspace-load-notice';

export function WorkspaceListPage() {
  const session = useSession();
  const workspaces = useWorkspaces();
  const { createWorkspace } = useWorkspaceMutations();
  const navigate = useNavigate();
  const [opened, modal] = useDisclosure(false);
  const [name, setName] = useState('');
  if (session.isLoading || workspaces.isLoading)
    return (
      <Center mih="100vh">
        <Stack align="center" role="status">
          <Loader aria-hidden />
          <Text>正在加载工作区列表…</Text>
        </Stack>
      </Center>
    );
  if (!session.data?.user) {
    void navigate({ to: '/sign-in', replace: true });
    return null;
  }
  const create = async () => {
    const workspace = await createWorkspace.mutateAsync(name);
    setName('');
    modal.close();
    await navigate({
      to: '/workspace/$workspaceId',
      params: { workspaceId: workspace.id },
    });
  };
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Group gap={8} wrap="nowrap">
            <img src="/logo.svg" width={20} height={20} alt="" aria-hidden />
            <Text c="blue" fw={700}>
              madoc
            </Text>
          </Group>
          <Title order={1} mt={6}>
            Workspaces
          </Title>
          <Text c="dimmed" mt={4}>
            选择一个空间，继续整理文档与白板。
          </Text>
        </div>
        <Group>
          <Button leftSection={<IconPlus size={16} />} onClick={modal.open}>
            新建 Workspace
          </Button>
          <AccountMenu user={session.data.user} compact />
        </Group>
      </header>
      <section className={styles.grid}>
        {workspaces.error && (
          <WorkspaceLoadNotice
            resource="工作区列表"
            error={workspaces.error}
            cached={false}
            pending={workspaces.isFetching}
            onRetry={() => {
              void workspaces.refetch();
            }}
            showReturn={false}
          />
        )}
        {workspaces.data?.map((workspace) => (
          <Card
            renderRoot={(props) => (
              <Link
                {...props}
                to="/workspace/$workspaceId"
                params={{ workspaceId: workspace.id }}
              />
            )}
            aria-label={`打开工作区 ${workspace.name}`}
            key={workspace.id}
            withBorder
            radius="lg"
            p="lg"
            className={styles.workspaceCard}
          >
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={4} className={styles.workspaceName}>
                <Title order={3}>
                  <bdi>{workspace.name}</bdi>
                </Title>
                <Text size="sm" c="dimmed">
                  {roleLabels[workspace.role]}
                </Text>
              </Stack>
              <IconChevronRight
                size={20}
                className={styles.chevron}
                aria-hidden
              />
            </Group>
          </Card>
        ))}
        {!workspaces.error && workspaces.data?.length === 0 && (
          <Card withBorder radius="lg" p="xl">
            <Title order={3}>你的第一个 Workspace</Title>
            <Text c="dimmed" mt="xs">
              从一个干净的空间开始。
            </Text>
            <Button mt="lg" variant="light" onClick={modal.open}>
              创建 Workspace
            </Button>
          </Card>
        )}
      </section>
      <Modal opened={opened} onClose={modal.close} title="新建 Workspace">
        <Stack>
          <TextInput
            autoFocus
            label="名称"
            placeholder="例如：产品团队"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Button
            onClick={create}
            loading={createWorkspace.isPending}
            disabled={!name.trim()}
          >
            创建
          </Button>
        </Stack>
      </Modal>
    </main>
  );
}
