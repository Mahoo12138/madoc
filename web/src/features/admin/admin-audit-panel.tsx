import { useState } from 'react';
import { Alert, Button, Loader, Select } from '@mantine/core';
import type { CSSProperties } from 'react';
import {
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  ScrollText as IconScrollText,
} from 'lucide-react';
import { useAuditEvents } from '@/api/hooks';
import {
  APIError,
  type AuditActionFilter,
  type AuditEvent,
  type AuditTargetTypeFilter,
} from '@/api/types';
import { EmptyState } from '@/features/shared/empty-state';
import {
  actionIcon,
  actionLabel,
  actorText,
  changeLines,
  targetText,
  targetTypeLabel,
} from './admin-audit-labels';
import { AdminUnauthorized } from './admin-shell';
import * as styles from './admin.css';

/** 首屏 20 条，按游标继续翻，不一次加载全部记录。 */
const PAGE_SIZE = 20;

const ACTION_OPTIONS: { value: AuditActionFilter; label: string }[] = [
  { value: 'all', label: '全部动作' },
  { value: 'site.settings_changed', label: '修改站点设置' },
  { value: 'user.disabled', label: '停用账号' },
  { value: 'user.enabled', label: '启用账号' },
  { value: 'user.admin_role_changed', label: '调整管理员身份' },
  { value: 'user.workspace_creation_changed', label: '调整创建工作区权限' },
  { value: 'user.sessions_revoked', label: '撤销账号全部会话' },
];

const TARGET_OPTIONS: { value: AuditTargetTypeFilter; label: string }[] = [
  { value: 'all', label: '全部对象' },
  { value: 'site_settings', label: '站点设置' },
  { value: 'user', label: '账号' },
];

const dayFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
});

function eventDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// 近两天的记录直接写「今天 / 昨天」：日期分组里最有用的信息是「多久以前」。
function relativeDayLabel(date: Date | null, fallback: string): string {
  if (!date) return fallback;
  const days = Math.round((startOfLocalDay(new Date()) - startOfLocalDay(date)) / 86_400_000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return fallback;
}

/**
 * 按天分组。分页是往尾部追加的，合并后的列表不保证有序，所以先整体排序再按
 * 标签归组——只跟上一组比较会重复标题并产生重复 key。
 */
function groupByDay(events: AuditEvent[]): { label: string; events: AuditEvent[] }[] {
  const groups: { label: string; events: AuditEvent[] }[] = [];
  const ordered = [...events].sort((a, b) => b.id - a.id);
  for (const event of ordered) {
    const date = eventDate(event.createdAt);
    const label = date ? dayFormat.format(date) : '日期未知';
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
}

function isAdminRequired(error: unknown): boolean {
  return error instanceof APIError && (error.code === 'ADMIN_REQUIRED' || error.status === 403);
}

/**
 * 操作记录：只读的审计时间轴。
 *
 * 列表语言沿用工作区活动记录的「日期分隔线 + 竖脊 + 逐条事件标记」，不另发明
 * 一套。每条记录默认只给一行摘要，完整 `changes` 按需展开——常驻容器展示结论，
 * 细节进折叠层，避免把页面铺成一张表格式的审计日志。
 */
export function AdminAuditPanel() {
  const [action, setAction] = useState<AuditActionFilter>('all');
  const [targetType, setTargetType] = useState<AuditTargetTypeFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const audit = useAuditEvents({ action, targetType, limit: PAGE_SIZE });
  const events = audit.data?.pages.flatMap((page) => page.events) ?? [];
  const filtering = action !== 'all' || targetType !== 'all';
  const showEvents = events.length > 0;

  // 403：不展示任何记录，也不提供重试——重试改变不了授权结果。
  if (isAdminRequired(audit.error)) return <AdminUnauthorized />;

  const toggle = (id: number) => setExpanded((current) => (current === id ? null : id));

  return (
    <>
      <h2 className={styles.sectionTitle}>操作记录</h2>
      <p className={styles.pageLead}>
        站点设置与账号管理的每一次改动都会留在这里，用于回溯谁在什么时候改了什么。记录只包含业务字段的前后值，不记录密码、会话内容或请求信息。
      </p>

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel} id="admin-audit-action-label">
            操作类型
          </span>
          <Select
            aria-labelledby="admin-audit-action-label"
            // 选项本身就是中文标签；值是服务端白名单里的 action。
            data={ACTION_OPTIONS}
            value={action}
            allowDeselect={false}
            size="sm"
            w={220}
            onChange={(value) => setAction((value ?? 'all') as AuditActionFilter)}
            classNames={{ input: styles.auditFilterInput }}
          />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel} id="admin-audit-target-label">
            操作对象
          </span>
          <Select
            aria-labelledby="admin-audit-target-label"
            data={TARGET_OPTIONS}
            value={targetType}
            allowDeselect={false}
            size="sm"
            w={180}
            onChange={(value) => setTargetType((value ?? 'all') as AuditTargetTypeFilter)}
            classNames={{ input: styles.auditFilterInput }}
          />
        </div>
      </div>

      {audit.isPending && (
        <div className={styles.loadState} role="status">
          <Loader size="sm" aria-label="加载操作记录" />
        </div>
      )}

      {!audit.isPending && !!audit.error && (
        <Alert color="orange" role="alert" className={styles.rowAlert} title="无法读取操作记录">
          <div className={styles.alertActions}>
            <Button
              size="compact-sm"
              variant="default"
              loading={audit.isFetching}
              onClick={() => void audit.refetch()}
            >
              重试
            </Button>
          </div>
        </Alert>
      )}

      {!audit.isPending && !audit.error && events.length === 0 && (
        <div className={styles.emptySection}>
          <EmptyState
            size="section"
            icon={IconScrollText}
            title={filtering ? '没有符合条件的记录' : '还没有管理操作'}
            description={
              filtering
                ? '当前筛选条件下没有匹配的操作记录。'
                : '站点设置或账号被修改后，这里会出现记录。'
            }
            note={
              filtering
                ? '清空筛选条件可以看到全部记录。'
                : undefined
            }
            actions={
              filtering ? (
                <Button
                  variant="default"
                  onClick={() => {
                    setAction('all');
                    setTargetType('all');
                  }}
                >
                  清空筛选
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

        {showEvents &&
        groupByDay(events).map((group) => {
          const dayDate = eventDate(group.events[0]?.createdAt ?? '');
          return (
            <section key={group.label} className={styles.auditDayGroup} aria-label={group.label}>
              <h3 className={styles.auditDayDivider}>
                <span className={styles.auditDayLabel}>
                  {relativeDayLabel(dayDate, group.label)}
                </span>
                <span className={styles.auditDayRule} aria-hidden />
                <span className={styles.auditDayCount}>{group.events.length} 条</span>
              </h3>
              <ul className={styles.auditList} aria-label="管理操作记录">
                {group.events.map((event, index) => {
                  const date = eventDate(event.createdAt);
                  const Icon = actionIcon(event.action);
                  const lines = changeLines(event.changes);
                  const isOpen = expanded === event.id;
                  return (
                    <li
                      key={event.id}
                      className={styles.auditRow}
                      // 逐条入场，延迟由 CSS 侧封顶，长列表不会拖到最后一屏才出现。
                      style={
                        { '--madoc-audit-index': Math.min(index, 8) } as CSSProperties
                      }
                    >
                      <div className={styles.auditRail}>
                        <span className={styles.auditMarker} aria-hidden>
                          <Icon size={12} strokeWidth={2} />
                        </span>
                        <time
                          className={styles.auditTime}
                          dateTime={event.createdAt}
                        >
                          {date ? timeFormat.format(date) : '—'}
                        </time>
                      </div>
                      <div className={styles.auditMeta}>
                        <p className={styles.auditSummary}>{actionLabel(event.action)}</p>
                        <p className={styles.auditActor}>
                          {actorText(event)} · {targetText(event)}
                        </p>
                        {lines.length > 0 && (
                          <button
                            type="button"
                            className={styles.auditToggle}
                            aria-expanded={isOpen}
                            onClick={() => toggle(event.id)}
                          >
                            {isOpen ? (
                              <IconChevronDown size={14} aria-hidden />
                            ) : (
                              <IconChevronRight size={14} aria-hidden />
                            )}
                            {isOpen ? '收起变更明细' : '查看变更明细'}
                          </button>
                        )}
                        {isOpen && lines.length > 0 && (
                          <ul className={styles.auditChanges}>
                            {lines.map((line) => (
                              <li key={line.key} className={styles.auditChangeRow}>
                                {line.text}
                              </li>
                            ))}
                          </ul>
                        )}
                        <span className={styles.auditTargetNote}>
                          对象类型：{targetTypeLabel(event.targetType)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

      {showEvents && audit.hasNextPage && !audit.isFetchNextPageError && (
        <Button
          variant="default"
          mt="lg"
          loading={audit.isFetchingNextPage}
          onClick={() => void audit.fetchNextPage()}
        >
          更早的记录
        </Button>
      )}

      {showEvents && audit.isFetchNextPageError && (
        <Alert color="orange" role="alert" className={styles.rowAlert} title="更早的记录加载失败">
          <div className={styles.alertActions}>
            <Button
              size="compact-sm"
              variant="default"
              loading={audit.isFetchingNextPage}
              onClick={() => void audit.fetchNextPage()}
            >
              重试加载
            </Button>
          </div>
        </Alert>
      )}
    </>
  );
}
