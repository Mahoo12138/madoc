import { useState } from 'react';
import { Avatar, Button, CopyButton, Drawer, Group, Paper, Select, Stack, Tabs, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Check as IconCheck, Copy as IconCopy, Mail as IconMail, Trash as IconTrash } from 'lucide-react';
import { useInvites, useMembers, useWorkspaceMutations } from '@/api/hooks';
import type { Role } from '@/api/types';

export function MemberDrawer({ opened, onClose, workspaceId, currentRole }: { opened: boolean; onClose: () => void; workspaceId: string; currentRole: Role }) {
  const members = useMembers(workspaceId); const invites = useInvites(workspaceId); const mutations = useWorkspaceMutations(workspaceId);
  const [email, setEmail] = useState(''); const [role, setRole] = useState<'editor' | 'viewer'>('editor'); const [link, setLink] = useState('');
  const invite = async () => { const result = await mutations.createInvite.mutateAsync({ email, role }); setLink(`${location.origin}${result.url}`); setEmail(''); notifications.show({ message: '邀请链接已创建', color: 'blue' }); };
  return <Drawer opened={opened} onClose={onClose} position="right" title="成员与邀请" size="md">
    <Tabs defaultValue="members"><Tabs.List><Tabs.Tab value="members">成员</Tabs.Tab><Tabs.Tab value="invites">邀请</Tabs.Tab></Tabs.List>
      <Tabs.Panel value="members" pt="lg"><Stack>{members.data?.map((member) => <Paper key={member.userId} withBorder p="sm" radius="md"><Group wrap="nowrap"><Avatar radius="xl" color="blue">{member.name.slice(0, 1)}</Avatar><div style={{ flex: 1, minWidth: 0 }}><Text fw={600} truncate>{member.name}</Text><Text size="xs" c="dimmed" truncate>{member.email}</Text></div><Select size="xs" w={110} value={member.role} data={['owner', 'editor', 'viewer']} disabled={currentRole !== 'owner'} onChange={(value) => value && mutations.updateMember.mutate({ userId: member.userId, role: value as Role })} />{currentRole === 'owner' && <Button size="compact-xs" color="red" variant="subtle" px={6} onClick={() => mutations.removeMember.mutate(member.userId)}><IconTrash size={14} /></Button>}</Group></Paper>)}</Stack></Tabs.Panel>
      <Tabs.Panel value="invites" pt="lg"><Stack>{currentRole === 'owner' && <Paper withBorder p="md" radius="md"><Stack><Text fw={600}>创建邀请链接</Text><TextInput leftSection={<IconMail size={15} />} placeholder="member@example.com" value={email} onChange={(e) => setEmail(e.currentTarget.value)} /><Select value={role} onChange={(value) => setRole((value ?? 'editor') as 'editor' | 'viewer')} data={['editor', 'viewer']} /><Button onClick={invite} loading={mutations.createInvite.isPending} disabled={!email.includes('@')}>创建链接</Button>{link && <Group wrap="nowrap"><TextInput value={link} readOnly style={{ flex: 1 }} /><CopyButton value={link}>{({ copied, copy }) => <Tooltip label={copied ? '已复制' : '复制'}><Button variant="light" onClick={copy}>{copied ? <IconCheck size={15} /> : <IconCopy size={15} />}</Button></Tooltip>}</CopyButton></Group>}</Stack></Paper>}{invites.data?.map((item) => <Paper key={item.id} withBorder p="sm"><Group justify="space-between"><div><Text size="sm">{item.email}</Text><Text size="xs" c="dimmed">{item.role} · {item.status}</Text></div></Group></Paper>)}</Stack></Tabs.Panel>
    </Tabs>
  </Drawer>;
}
