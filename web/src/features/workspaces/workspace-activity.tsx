import { Alert, Button, Group, Loader, Text, VisuallyHidden } from '@mantine/core';
import type { CSSProperties } from 'react';
import {
  Activity,
  FilePlus2 as IconFilePlus,
  History as IconHistory,
  MessageSquare as IconComment,
  Pencil as IconPencil,
  RotateCcw as IconRestore,
  Share2 as IconShare,
  Trash2 as IconTrash,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useWorkspaceActivity } from '@/api/hooks';
import { APIError, type ActivityEvent } from '@/api/types';
import { EmptyState } from '@/features/shared/empty-state';
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

// 事件图标把「发生了什么」提到一眼可扫的层级；未知类型退回通用图标，
// 所以服务端新增事件类型时这里不会漏渲染。
function eventIcon(type: string): LucideIcon {
  const value = type.toLowerCase();
  if (/(trash|delet|revok)/.test(value)) return IconTrash;
  if (/restor/.test(value)) return IconRestore;
  if (/comment/.test(value)) return IconComment;
  if (/share/.test(value)) return IconShare;
  if (/(version|checkpoint)/.test(value)) return IconHistory;
  if (/creat/.test(value)) return IconFilePlus;
  if (/(renam|mov|publish|updat|edit)/.test(value)) return IconPencil;
  return Activity;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// 近两天的记录直接写「今天 / 昨天」——日期分组里最有用的信息是
// 「多久以前」，而不是日历上的数字。
function relativeDayLabel(date: Date | null, fallback: string) {
  if (!date) return fallback;
  const days = Math.round(
    (startOfLocalDay(new Date()).getTime() - startOfLocalDay(date).getTime()) / 86_400_000,
  );
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return fallback;
}

function groupByDay(events: ActivityEvent[]) {
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  // Pagination appends older pages, so the merged list is not guaranteed to be
  // ordered. Sort newest first and group by label rather than only against the
  // previous group, which would otherwise repeat a heading and duplicate keys.
  const ordered = [...events].sort(
    (a, b) => (eventDate(b.createdAt)?.getTime() ?? 0) - (eventDate(a.createdAt)?.getTime() ?? 0),
  );
  for (const event of ordered) {
    const label = eventDate(event.createdAt)
      ? dayFormat.format(new Date(event.createdAt))
      : '日期未知';
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.events.push(event);
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
  const groups = showEvents ? groupByDay(events) : [];
  // 最新一条用信纸蓝标记，并读给屏幕阅读器（不靠颜色单独传达）。
  const newestId = events.reduce<ActivityEvent | null>((newest, event) => {
    const at = eventDate(event.createdAt)?.getTime() ?? -Infinity;
    const current = newest ? eventDate(newest.createdAt)?.getTime() ?? -Infinity : -Infinity;
    return at > current ? event : newest;
  }, null)?.id;
  // 逐条入场的序号，跨分组连续，最长的延迟由 CSS 侧封顶。
  const orderById = new Map<string, number>();
  for (const group of groups) {
    for (const event of group.events) orderById.set(event.id, orderById.size);
  }

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
        <EmptyState
          icon={Activity}
          title="还没有活动记录"
          description="新建、编辑或管理内容后，相关操作会按日期显示在这里，便于回溯谁在什么时候改了什么。"
        />
      )}
      {showEvents &&
        groups.map((group) => {
          const dayDate = eventDate(group.events[0]?.createdAt ?? '');
          return (
            <section key={group.label} className={styles.dayGroup} aria-label={group.label}>
              <h3 className={styles.dayDivider} title={group.label}>
                <span className={styles.dayLabel}>{relativeDayLabel(dayDate, group.label)}</span>
                <span className={styles.dayRule} aria-hidden />
                <span className={styles.dayCount}>{group.events.length} 条</span>
              </h3>
              <div className={styles.activityList}>
                {group.events.map((event) => {
                  const date = eventDate(event.createdAt);
                  const Icon = eventIcon(event.type);
                  const isNewest = event.id === newestId;
                  return (
                    <div
                      key={event.id}
                      className={styles.activityRow}
                      style={
                        {
                          '--madoc-activity-index': Math.min(orderById.get(event.id) ?? 0, 8),
                        } as CSSProperties
                      }
                    >
                      <div className={styles.activityRail}>
                        <span
                          className={
                            isNewest
                              ? `${styles.activityMarker} ${styles.activityMarkerNewest}`
                              : styles.activityMarker
                          }
                        >
                          <Icon size={12} strokeWidth={2} aria-hidden />
                          {isNewest && <VisuallyHidden>最新一条记录</VisuallyHidden>}
                        </span>
                        <time className={styles.activityTime} dateTime={event.createdAt}>
                          {date ? timeFormat.format(date) : '—'}
                        </time>
                      </div>
                      <div className={styles.activityMeta}>
                        <Text size="sm" fw={600} lineClamp={2} title={event.summary}>
                          {event.summary}
                        </Text>
                        {event.itemTitle && (
                          <Text size="sm" mt={2} lineClamp={2} title={event.itemTitle} className={styles.activityItemTitle}>
                            {event.itemTitle}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed" mt={4} truncate title={event.actorName}>
                          {event.actorName}
                        </Text>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
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
