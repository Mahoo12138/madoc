import { Button, Center, Drawer, Loader, Paper, Stack, Text } from '@mantine/core';
import { useWorkspaceActivity } from '@/api/hooks';

const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

export function WorkspaceActivityDrawer({
  opened,
  onClose,
  workspaceId,
  workspaceName,
}: {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
}) {
  const activity = useWorkspaceActivity(workspaceId);
  const events = activity.data?.pages.flatMap((page) => page.events) ?? [];
  return (
    <Drawer opened={opened} onClose={onClose} position="right" title={`活动记录 · ${workspaceName}`} size="md">
      <Stack>
        <Text size="sm" c="dimmed">记录内容与协作操作，不包含正文或评论内容。</Text>
        {activity.isLoading && <Center py="xl"><Loader size="sm" /></Center>}
        {activity.isError && (
          <Stack align="center" py="xl">
            <Text c="red" size="sm">活动记录加载失败。</Text>
            <Button variant="light" onClick={() => void activity.refetch()}>重试</Button>
          </Stack>
        )}
        {!activity.isLoading && !activity.isError && events.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="xl">还没有活动记录</Text>
        )}
        {events.map((event) => (
          <Paper key={event.id} withBorder p="sm" radius="md">
            <Stack gap={4}>
              <Text size="sm" fw={600}>{event.summary}</Text>
              {event.itemTitle && <Text size="sm" c="dimmed" lineClamp={1}>{event.itemTitle}</Text>}
              <Text size="xs" c="dimmed">{event.actorName} · {dateTime.format(new Date(event.createdAt))}</Text>
            </Stack>
          </Paper>
        ))}
        {activity.hasNextPage && (
          <Button variant="default" loading={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>
            加载更早记录
          </Button>
        )}
      </Stack>
    </Drawer>
  );
}
