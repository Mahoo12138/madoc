import { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Loader,
  SegmentedControl,
  Table,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate } from '@tanstack/react-router';
import { Search, ShieldAlert, Users } from 'lucide-react';
import { useAdminUsers } from '@/api/hooks';
import {
  APIError,
  type AdminUser,
  type AdminUserListParams,
  type AdminUserRoleFilter,
  type AdminUserStatusFilter,
} from '@/api/types';
import { EmptyState } from '@/features/shared/empty-state';
import { AdminUserDetailDrawer } from './admin-user-detail-drawer';
import {
  canCreateText,
  formatDate,
  roleText,
  statusText,
} from './admin-user-labels';
import * as styles from './admin.css';

/** §9.3：默认每页 20 条，不一次加载全部用户。 */
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: { value: AdminUserStatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '启用中' },
  { value: 'disabled', label: '已禁用' },
];
const ROLE_OPTIONS: { value: AdminUserRoleFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'admin', label: '站点管理员' },
  { value: 'user', label: '普通用户' },
];

function isAdminRequired(error: unknown): boolean {
  return (
    error instanceof APIError &&
    (error.code === 'ADMIN_REQUIRED' || error.status === 403)
  );
}

/**
 * 用户列表：筛选、游标分页与详情入口。
 *
 * 服务端是唯一事实来源——这里没有本地用户副本，修改成功后靠 query 失效重新读取，
 * 不做乐观更新（§10.3）。
 */
export function AdminUsersPanel({ currentUserId }: { currentUserId: string }) {
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AdminUserStatusFilter>('all');
  const [role, setRole] = useState<AdminUserRoleFilter>('all');
  // 游标栈：第 N 页 = 栈中第 N 项。只前进已知 cursor，不假设总页数。
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const mobile = useMediaQuery('(max-width: 760px)', undefined, {
    getInitialValueInEffect: false,
  });

  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const resetPaging = () => setCursorStack([null]);
  useEffect(resetPaging, [q]);

  const params: AdminUserListParams = {
    q: q || undefined,
    status,
    role,
    limit: PAGE_SIZE,
    cursor: cursorStack[cursorStack.length - 1] ?? null,
  };
  const users = useAdminUsers(params);
  const page = cursorStack.length;
  const filtering = !!q || status !== 'all' || role !== 'all';

  // 403：不展示任何用户数据，也不提供重试——重试改变不了授权结果。
  if (isAdminRequired(users.error))
    return (
      <EmptyState
        size="page"
        icon={ShieldAlert}
        title="没有站点管理权限"
        description="此页面仅站点管理员可访问。"
        note="如果你认为应该有权限，请联系站点管理员在用户管理中授予。"
        actions={
          <Button
            variant="default"
            onClick={() => void navigate({ to: '/workspaces' })}
          >
            返回工作区
          </Button>
        }
      />
    );

  const rows: AdminUser[] = users.data?.users ?? [];
  const rowButton = (user: AdminUser) => (
    <Button
      variant="default"
      size="compact-sm"
      aria-label={`管理 ${user.name}`}
      onClick={() => setSelectedId(user.id)}
    >
      管理
    </Button>
  );

  return (
    <>
      <h2 className={styles.sectionTitle}>用户管理</h2>
      <p className={styles.pageLead}>
        查看站点账号的启用状态、站点身份与创建工作区的能力。禁用账号、调整管理员身份和撤销会话都会立即生效，操作前会说明影响。
      </p>

      <div className={styles.filterBar}>
        <TextInput
          className={styles.searchField}
          label="搜索"
          aria-label="按姓名或邮箱搜索"
          placeholder="姓名或邮箱"
          leftSection={<Search size={16} aria-hidden />}
          value={searchInput}
          onChange={(event) => setSearchInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            // 中文输入法下 Enter 用于确认候选词，不能当作提交。
            if (event.key === 'Enter' && event.nativeEvent.isComposing)
              event.preventDefault();
          }}
        />
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel} id="admin-user-status-label">
            账号状态
          </span>
          <SegmentedControl
            aria-labelledby="admin-user-status-label"
            value={status}
            data={STATUS_OPTIONS}
            size="sm"
            onChange={(value) => {
              setStatus(value as AdminUserStatusFilter);
              resetPaging();
            }}
            classNames={{
              root: styles.filterControl,
              label: styles.filterOption,
            }}
          />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel} id="admin-user-role-label">
            站点身份
          </span>
          <SegmentedControl
            aria-labelledby="admin-user-role-label"
            value={role}
            data={ROLE_OPTIONS}
            size="sm"
            onChange={(value) => {
              setRole(value as AdminUserRoleFilter);
              resetPaging();
            }}
            classNames={{
              root: styles.filterControl,
              label: styles.filterOption,
            }}
          />
        </div>
      </div>

      <div className={styles.listStatus}>
        <p className={styles.listCount}>
          {users.isPending
            ? '正在读取用户…'
            : `第 ${page} 页 · 本页 ${rows.length} 个账号`}
        </p>
      </div>

      {users.isPending && (
        <div className={styles.loadState} role="status">
          <Loader size="sm" aria-label="加载用户列表" />
        </div>
      )}

      {!users.isPending && !!users.error && !isAdminRequired(users.error) && (
        <Alert
          color="orange"
          role="alert"
          className={styles.rowAlert}
          title="无法读取用户列表"
        >
          <div className={styles.alertActions}>
            <Button
              size="compact-sm"
              variant="default"
              loading={users.isFetching}
              onClick={() => void users.refetch()}
            >
              重试
            </Button>
          </div>
        </Alert>
      )}

      {!users.isPending && !users.error && rows.length === 0 && (
        <div className={styles.emptySection}>
          <EmptyState
            size="section"
            icon={Users}
            title={filtering ? '没有符合条件的用户' : '还没有用户'}
            description={
              filtering
                ? '当前搜索或筛选条件下没有匹配的账号。'
                : '站点初始化后创建的账号会出现在这里。'
            }
            note={
              filtering
                ? '清空搜索与筛选条件可以看到全部账号。'
                : undefined
            }
            actions={
              filtering ? (
                <Button
                  variant="default"
                  onClick={() => {
                    setSearchInput('');
                    setQ('');
                    setStatus('all');
                    setRole('all');
                    resetPaging();
                  }}
                >
                  清空筛选
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {!users.isPending && !users.error && rows.length > 0 && (
        <>
          {mobile ? (
            <div className={styles.infoList}>
              {rows.map((user) => (
                <div
                  key={user.id}
                  className={styles.infoCard}
                  role="group"
                  aria-label={`用户：${user.name}`}
                >
                  <div className={styles.infoHead}>
                    <Avatar
                      src={user.avatarUrl}
                      radius="xl"
                      color="blue"
                      size={32}
                    >
                      {user.name.slice(0, 1)}
                    </Avatar>
                    <div className={styles.identityText}>
                      <p className={styles.identityName}>
                        {user.name}
                        {user.id === currentUserId && (
                          <span className={styles.selfMark}>（你）</span>
                        )}
                      </p>
                      <p className={styles.identityEmail}>{user.email}</p>
                    </div>
                  </div>
                  <div className={styles.infoGrid}>
                    <p className={styles.infoLabel}>站点身份</p>
                    <p className={styles.infoValue}>{roleText(user)}</p>
                    <p className={styles.infoLabel}>账号状态</p>
                    <p className={styles.infoValue}>{statusText(user)}</p>
                    <p className={styles.infoLabel}>创建工作区</p>
                    <p className={styles.infoValue}>
                      {canCreateText(user.effectiveCanCreateWorkspace)}
                    </p>
                    <p className={styles.infoLabel}>创建时间</p>
                    <p className={styles.infoValue}>{formatDate(user.createdAt)}</p>
                  </div>
                  <div className={styles.infoActions}>
                    {rowButton(user)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <Table
                className={styles.table}
                highlightOnHover
                verticalSpacing="sm"
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>用户</Table.Th>
                    <Table.Th>站点身份</Table.Th>
                    <Table.Th>账号状态</Table.Th>
                    <Table.Th>创建工作区</Table.Th>
                    <Table.Th>创建时间</Table.Th>
                    <Table.Th>操作</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((user) => (
                    <Table.Tr key={user.id}>
                      <Table.Td>
                        <div className={styles.identityCell}>
                          <Avatar
                            src={user.avatarUrl}
                            radius="xl"
                            color="blue"
                            size={28}
                          >
                            {user.name.slice(0, 1)}
                          </Avatar>
                          <div className={styles.identityText}>
                            <p className={styles.identityName}>
                              {user.name}
                              {user.id === currentUserId && (
                                <span className={styles.selfMark}>（你）</span>
                              )}
                            </p>
                            <p className={styles.identityEmail}>{user.email}</p>
                          </div>
                        </div>
                      </Table.Td>
                      <Table.Td>
                        <p className={styles.cellText}>{roleText(user)}</p>
                      </Table.Td>
                      <Table.Td>
                        <p className={styles.cellText}>{statusText(user)}</p>
                      </Table.Td>
                      <Table.Td>
                        <p className={styles.cellText}>
                          {canCreateText(user.effectiveCanCreateWorkspace)}
                        </p>
                      </Table.Td>
                      <Table.Td>
                        <p className={styles.cellDate}>
                          {formatDate(user.createdAt)}
                        </p>
                      </Table.Td>
                      <Table.Td>{rowButton(user)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          )}

          <div className={styles.pagination}>
            <p className={styles.paginationText}>第 {page} 页</p>
            <div className={styles.paginationActions}>
              <Button
                variant="default"
                size="compact-sm"
                disabled={page <= 1 || users.isFetching}
                onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
              >
                上一页
              </Button>
              <Button
                variant="default"
                size="compact-sm"
                disabled={!users.data?.nextCursor || users.isFetching}
                onClick={() =>
                  setCursorStack((stack) =>
                    users.data?.nextCursor
                      ? [...stack, users.data.nextCursor]
                      : stack,
                  )
                }
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}

      <AdminUserDetailDrawer
        userId={selectedId}
        currentUserId={currentUserId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
