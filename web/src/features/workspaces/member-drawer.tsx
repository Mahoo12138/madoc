import { useState } from 'react';
import {
  Avatar,
  Button,
  CopyButton,
  Drawer,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  Check as IconCheck,
  Copy as IconCopy,
  Mail as IconMail,
  Trash as IconTrash,
} from 'lucide-react';
import { useInvites, useMembers, useSession, useWorkspaceMutations } from '@/api/hooks';
import type { Role } from '@/api/types';
import { inviteStatusLabel, roleDescriptions, roleLabels } from './role-labels';

const memberRoleOptions = (['owner', 'editor', 'viewer'] as const).map((value) => ({
  value,
  label: roleLabels[value],
}));
const inviteRoleOptions = (['editor', 'viewer'] as const).map((value) => ({
  value,
  label: roleLabels[value],
}));

export function MemberDrawer({
  opened,
  onClose,
  workspaceId,
  currentRole,
}: {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  currentRole: Role;
}) {
  const members = useMembers(workspaceId);
  const invites = useInvites(workspaceId);
  const session = useSession();
  const mutations = useWorkspaceMutations(workspaceId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [link, setLink] = useState('');
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'role'; userId: string; name: string; role: Role }
    | { kind: 'remove'; userId: string; name: string }
    | { kind: 'revoke'; inviteId: string; email: string }
    | null
  >(null);
  const confirmAction = async () => {
    if (!pendingAction) return;
    try {
      if (pendingAction.kind === 'role') {
        await mutations.updateMember.mutateAsync({ userId: pendingAction.userId, role: pendingAction.role });
        notifications.show({ message: '成员角色已更新', color: 'blue' });
      } else if (pendingAction.kind === 'remove') {
        await mutations.removeMember.mutateAsync(pendingAction.userId);
        notifications.show({ message: '成员已移除', color: 'blue' });
      } else {
        await mutations.revokeInvite.mutateAsync(pendingAction.inviteId);
        notifications.show({ message: '邀请已撤销', color: 'blue' });
      }
      setPendingAction(null);
    } catch (error) {
      notifications.show({ message: error instanceof Error ? error.message : '操作失败，请重试', color: 'red' });
    }
  };
  const invite = async () => {
    const result = await mutations.createInvite.mutateAsync({ email, role });
    setLink(`${location.origin}${result.url}`);
    setEmail('');
    notifications.show({ message: '邀请链接已创建', color: 'blue' });
  };
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title="成员与邀请"
      size="md"
    >
      <Modal
        opened={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={pendingAction?.kind === 'role' ? '确认调整角色' : pendingAction?.kind === 'remove' ? '确认移除成员' : '确认撤销邀请'}
        centered
      >
        <Stack>
          <Text>
            {pendingAction?.kind === 'role' && <>将 <b>{pendingAction.name}</b> 的角色调整为<b>{roleLabels[pendingAction.role]}</b>？角色变更会立即生效。</>}
            {pendingAction?.kind === 'remove' && <>移除 <b>{pendingAction.name}</b> 后，对方将立即失去此工作区访问权限。</>}
            {pendingAction?.kind === 'revoke' && <>撤销发给 <b>{pendingAction.email}</b> 的待处理邀请后，原邀请链接将立即失效。</>}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPendingAction(null)}>取消</Button>
            <Button color={pendingAction?.kind === 'role' ? 'blue' : 'red'} loading={mutations.updateMember.isPending || mutations.removeMember.isPending || mutations.revokeInvite.isPending} onClick={confirmAction}>
              {pendingAction?.kind === 'role' ? '确认调整' : pendingAction?.kind === 'remove' ? '移除成员' : '撤销邀请'}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Tabs defaultValue="members">
        <Tabs.List>
          <Tabs.Tab value="members">成员</Tabs.Tab>
          <Tabs.Tab value="invites">邀请</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="members" pt="lg">
          <Stack>
            {members.data?.map((member) => (
              <Paper key={member.userId} withBorder p="sm" radius="md">
                <Group wrap="nowrap">
                  <Avatar src={member.avatarUrl} radius="xl" color="blue">
                    {member.name.slice(0, 1)}
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={600} truncate>
                      {member.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {member.email}
                    </Text>
                  </div>
                  <Select
                    size="xs"
                    w={110}
                    value={member.role}
                    data={memberRoleOptions}
                    disabled={currentRole !== 'owner' || member.userId === session.data?.user?.id}
                    onChange={(value) =>
                      value &&
                      value !== member.role &&
                      setPendingAction({ kind: 'role', userId: member.userId, name: member.name, role: value as Role })
                    }
                  />
                  {currentRole === 'owner' && (
                    <Button
                      size="compact-xs"
                      color="red"
                      variant="subtle"
                      px={6}
                      aria-label={`移除 ${member.name}`}
                      disabled={member.userId === session.data?.user?.id || (member.role === 'owner' && (members.data?.filter((entry) => entry.role === 'owner').length ?? 0) <= 1)}
                      onClick={() => setPendingAction({ kind: 'remove', userId: member.userId, name: member.name })}
                    >
                      <IconTrash size={14} />
                    </Button>
                  )}
                </Group>
                {currentRole === 'owner' && member.userId === session.data?.user?.id && <Text size="xs" c="dimmed" mt="xs">这是你的账号；所有者角色不能自行变更或移除。</Text>}
                {currentRole === 'owner' && member.role === 'owner' && (members.data?.filter((entry) => entry.role === 'owner').length ?? 0) <= 1 && <Text size="xs" c="dimmed" mt="xs">工作区至少需要一位所有者。</Text>}
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="invites" pt="lg">
          <Stack>
            {currentRole === 'owner' && (
              <Paper withBorder p="md" radius="md">
                <Stack>
                  <Text fw={600}>创建邀请链接</Text>
                  <TextInput
                    leftSection={<IconMail size={15} />}
                    placeholder="member@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                  />
                  <Select
                    value={role}
                    onChange={(value) =>
                      setRole((value ?? 'editor') as 'editor' | 'viewer')
                    }
                    data={inviteRoleOptions}
                  />
                  <Text size="xs" c="dimmed" aria-live="polite">
                    {roleDescriptions[role]}
                  </Text>
                  <Button
                    onClick={invite}
                    loading={mutations.createInvite.isPending}
                    disabled={!email.includes('@')}
                  >
                    创建链接
                  </Button>
                  {link && (
                    <Group wrap="nowrap">
                      <TextInput value={link} readOnly style={{ flex: 1 }} />
                      <CopyButton value={link}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? '已复制' : '复制'}>
                            <Button variant="light" onClick={copy}>
                              {copied ? (
                                <IconCheck size={15} />
                              ) : (
                                <IconCopy size={15} />
                              )}
                            </Button>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                  )}
                </Stack>
              </Paper>
            )}
            {invites.data?.map((item) => (
              <Paper key={item.id} withBorder p="sm">
                  <Group justify="space-between">
                  <div>
                    <Text size="sm">{item.email}</Text>
                    <Text size="xs" c="dimmed">
                      {roleLabels[item.role]} · {inviteStatusLabel(item.status)}
                    </Text>
                  </div>
                  {currentRole === 'owner' && item.status === 'pending' && (
                    <Button size="compact-xs" color="red" variant="subtle" onClick={() => setPendingAction({ kind: 'revoke', inviteId: item.id, email: item.email })}>
                      撤销
                    </Button>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  );
}
