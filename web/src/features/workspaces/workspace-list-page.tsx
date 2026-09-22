import { useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronRight as IconChevronRight,
  LogOut as IconLogout,
  Plus as IconPlus,
} from 'lucide-react';
import { api } from '@/api/client';
import { useSession, useWorkspaces, useWorkspaceMutations } from '@/api/hooks';
import { queryClient } from '@/api/query-client';
import { AccountMenu } from '@/features/account/account-menu';
import * as styles from './workspace-list-page.css';

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
        <Loader />
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
  const signOut = async () => {
    await api.signOut();
    queryClient.clear();
    await navigate({ to: '/sign-in' });
  };
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Text c="blue" fw={700}>
            madoc
          </Text>
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
        {workspaces.data?.map((workspace) => (
          <Card
            key={workspace.id}
            withBorder
            radius="lg"
            p="lg"
            className={styles.workspaceCard}
            onClick={() =>
              navigate({
                to: '/workspace/$workspaceId',
                params: { workspaceId: workspace.id },
              })
            }
          >
            <Group justify="space-between">
              <Stack gap={4}>
                <Title order={3}>{workspace.name}</Title>
                <Text size="sm" c="dimmed">
                  {workspace.role}
                </Text>
              </Stack>
              <IconChevronRight size={20} color="var(--mantine-color-gray-5)" />
            </Group>
          </Card>
        ))}
        {workspaces.data?.length === 0 && (
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
