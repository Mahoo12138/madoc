import { Alert, Button, Group, Loader, Text } from '@mantine/core';
import { useWorkspaceActivity } from '@/api/hooks';
import { APIError, type ActivityEvent } from '@/api/types';
import * as styles from './workspace-management.css';

const dayFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
});

function eventDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function groupByDay(events: ActivityEvent[]) {
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  for (const event of events) {
    const label = eventDate(event.createdAt)
      ? dayFormat.format(new Date(event.createdAt))
      : '日期未知';
    const latest = groups[groups.length - 1];
    if (latest?.label === label) latest.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
}

export function WorkspaceActivity({ workspaceId }: { workspaceId: string }) {
  const activity = useWorkspaceActivity(workspaceId);
  const events = activity.data?.pages.flatMap((page) => page.events) ?? [];
  const accessError =
    activity.error instanceof APIError &&
    [401, 403, 404].includes(activity.error.status);
  const showEvents = !accessError && events.length > 0;

  return (
    <div className={styles.pane}>
      <h2 className={styles.pageHeading}>活动记录</h2>
      <p className={styles.lead}>
        记录内容与协作操作；不会显示文档正文或评论内容。
      </p>
      {activity.isPending && (
        <Group justify="center" py="xl">
          <Loader size="sm" aria-label="加载活动记录" />
        </Group>
      )}
      {accessError && (
        <Alert color="red" mt="lg" role="alert">
          你已无法查看此工作区的活动记录。
        </Alert>
      )}
      {activity.isError && !accessError && !activity.isFetchNextPageError && (
        <Alert color="red" mt="lg" role="alert">
          活动记录加载失败。
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => void activity.refetch()}
          >
            重试
          </Button>
        </Alert>
      )}
      {!activity.isPending && !activity.isError && events.length === 0 && (
        <div className={styles.emptyState}>
          <Text fw={600}>还没有活动记录</Text>
          <Text size="sm" c="dimmed" mt={4}>
            新建、编辑或管理内容后，相关操作会显示在这里。
          </Text>
        </div>
      )}
      {showEvents &&
        groupByDay(events).map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3 className={styles.dayHeading}>{group.label}</h3>
            <div className={styles.activityList}>
              {group.events.map((event) => {
                const date = eventDate(event.createdAt);
                return (
                  <div key={event.id} className={styles.activityRow}>
                    <time
                      className={styles.activityTime}
                      dateTime={event.createdAt}
                    >
                      {date ? timeFormat.format(date) : '—'}
                    </time>
                    <div className={styles.activityMeta}>
                      <Text size="sm" fw={600}>
                        {event.summary}
                      </Text>
                      {event.itemTitle && (
                        <Text size="sm" mt={3} lineClamp={2}>
                          {event.itemTitle}
                        </Text>
                      )}
                      <Text size="xs" c="dimmed" mt={5}>
                        {event.actorName}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      {!accessError && activity.isFetchNextPageError && (
        <Alert color="red" mt="lg" role="alert">
          更早的记录加载失败。
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => void activity.fetchNextPage()}
          >
            重试加载
          </Button>
        </Alert>
      )}
      {showEvents && activity.hasNextPage && !activity.isFetchNextPageError && (
        <Button
          variant="default"
          mt="lg"
          loading={activity.isFetchingNextPage}
          onClick={() => void activity.fetchNextPage()}
        >
          加载更早记录
        </Button>
      )}
    </div>
  );
}
