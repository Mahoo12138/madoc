import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Drawer,
  Group,
  Loader,
  Modal,
  Switch,
  Text,
} from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { LogOut } from 'lucide-react';
import {
  useAdminUser,
  useRevokeUserSessions,
  useUpdateAdminUser,
} from '@/api/hooks';
import { APIError, type AdminUserChanges } from '@/api/types';
import { EmptyState } from '@/features/shared/empty-state';
import {
  canCreateText,
  effectiveNote,
  formatDate,
  roleText,
  signupSourceLabel,
  statusText,
} from './admin-user-labels';
import * as styles from './admin.css';

/** 高影响与危险动作：先展示具体影响，确认后才提交（§10.3）。 */
type PendingAction =
  | { kind: 'disabled'; value: boolean }
  | { kind: 'isAdmin'; value: boolean }
  | { kind: 'sessions' };

/** 服务端错误码翻译成管理员能读懂的后果，不做通用「出错了」兜底（PRD §7.5）。 */
function updateErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    if (error.code === 'CSRF_INVALID')
      return '会话校验已失效，请刷新页面后重试。';
    if (error.code === 'ADMIN_REQUIRED')
      return '当前账号已无站点管理权限，请刷新页面确认。';
    if (error.code === 'LAST_ACTIVE_ADMIN')
      return '此操作会让站点没有可用的管理员。请先授予其他账号管理员身份，或改为调整其他项。';
    if (error.code === 'SELF_DISABLE_FORBIDDEN')
      return '不能禁用你自己的账号。如需停用，请由另一位管理员操作。';
    if (error.code === 'INVALID_REQUEST')
      return '服务端拒绝了这次修改（参数不合法或没有实际变更）。请刷新后重试。';
    if (error.status === 401) return '登录状态已失效，请重新登录。';
    if (error.status === 404) return '该账号已不存在，请刷新列表。';
    if (error.status === 429) return '操作过于频繁，请稍后重试。';
  }
  return '操作未完成，请检查网络后重试。';
}

function revokeErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    if (error.code === 'ADMIN_REQUIRED')
      return '当前账号已无站点管理权限，请刷新页面确认。';
    if (error.code === 'CSRF_INVALID')
      return '会话校验已失效，请刷新页面后重试。';
    if (error.status === 401) return '登录状态已失效，请重新登录。';
    if (error.status === 404) return '该账号已不存在，请刷新列表。';
  }
  return '会话未能撤销，请检查网络后重试。';
}

/**
 * 用户详情抽屉：常驻展示当前值 + 操作入口。
 *
 * 开关类（普通用户创建授权）直接保存；高影响操作（启用/禁用、管理员身份）与危险操作
 * （撤销全部会话）先弹确认。所有修改都要服务端确认后才进入已确认状态，不做乐观更新
 * （§10.3）；请求按序号排队，乱序到达的旧响应一律丢弃。
 */
export function AdminUserDetailDrawer({
  userId,
  currentUserId,
  onClose,
}: {
  userId: string | null;
  currentUserId: string;
  onClose: () => void;
}) {
  const query = useAdminUser(userId);
  const update = useUpdateAdminUser();
  const revoke = useRevokeUserSessions();
  const reduceMotion = useReducedMotion();
  const seq = useRef(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  /** 待选值：保存失败时保留管理员的选择，不悄悄弹回服务端值。 */
  const [createDraft, setCreateDraft] = useState<boolean | null>(null);
  const [updateError, setUpdateError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    setPending(null);
    setCreateDraft(null);
    setUpdateError('');
    setSessionError('');
    setConflict(false);
    seq.current += 1;
    update.reset();
    revoke.reset();
    // 只在目标账号变化时重置；同时作废在途响应，避免上一个账号的返回值落到新账号上。
  }, [userId]);

  const detail = query.data;
  const busy = update.isPending || revoke.isPending;

  const submit = (changes: AdminUserChanges) => {
    if (!detail || update.isPending) return;
    const id = (seq.current += 1);
    setUpdateError('');
    setConflict(false);
    update.reset();
    update.mutate(
      { userId: detail.id, expectedRevision: detail.revision, changes },
      {
        onSuccess: () => {
          if (id !== seq.current) return;
          setCreateDraft(null);
          setPending(null);
          notifications.show({ message: '用户已更新', color: 'blue' });
        },
        onError: (error) => {
          if (id !== seq.current) return;
          if (error instanceof APIError && error.code === 'REVISION_CONFLICT') {
            // 冲突只提示与展示服务端当前值：不自动覆盖、不自动重试（§9.1）。
            setConflict(true);
            void query.refetch();
            return;
          }
          setUpdateError(updateErrorMessage(error));
        },
      },
    );
  };

  const confirmPending = () => {
    if (!pending) return;
    if (pending.kind === 'sessions') {
      void revokeSessions();
      return;
    }
    submit({ [pending.kind]: pending.value });
  };

  const revokeSessions = async () => {
    if (!detail) return;
    setSessionError('');
    try {
      // 危险动作失败不重试（§6.4）：稍后误撤销用户新建立的会话比失败更糟。
      await revoke.mutateAsync(detail.id);
      setPending(null);
      notifications.show({ message: '已撤销全部会话', color: 'blue' });
    } catch (error) {
      setSessionError(revokeErrorMessage(error));
    }
  };

  const discardDraft = () => {
    setCreateDraft(null);
    setConflict(false);
    setUpdateError('');
    update.reset();
  };

  const self = !!detail && detail.id === currentUserId;
  const createChecked =
    createDraft ?? detail?.canCreateWorkspace ?? false;
  const createPending =
    !!detail && createDraft !== null && createDraft !== detail.canCreateWorkspace;

  const dialogCopy = () => {
    if (!pending || !detail) return null;
    if (pending.kind === 'sessions')
      return {
        title: '确认撤销全部会话',
        confirm: '撤销会话',
        danger: true,
        body: (
          <Text>
            撤销 <b>{detail.name}</b>{' '}
            的全部登录会话后，其已建立的连接会立即断开。
            <b>这不等于禁止登录</b>
            ——{detail.name} 可以凭有效凭据重新登录。需要持续阻止访问，请改用「禁用账号」。
          </Text>
        ),
      };
    if (pending.kind === 'disabled')
      return pending.value
        ? {
            title: '确认禁用账号',
            confirm: '禁用账号',
            danger: true,
            body: (
              <Text>
                禁用后，<b>{detail.name}</b>{' '}
                将立即无法登录站点，其全部登录会话会被撤销。账号资料、工作区、成员关系与文档都会保留，重新启用即可恢复访问。
                {self && '这是你自己的账号，服务端会拒绝管理员禁用自己。'}
              </Text>
            ),
          }
        : {
            title: '确认启用账号',
            confirm: '启用账号',
            danger: false,
            body: (
              <Text>
                启用后，<b>{detail.name}</b>{' '}
                可以重新登录站点。不会恢复旧会话，也不会自动恢复此前被撤销的邀请。
              </Text>
            ),
          };
    return pending.value
      ? {
          title: '确认授予管理员身份',
          confirm: '授予管理员身份',
          danger: false,
          body: (
            <Text>
              授予后，<b>{detail.name}</b>{' '}
              可以管理全站用户与站点设置。其已有会话会被撤销，需要重新登录取得新身份。
            </Text>
          ),
        }
      : {
          title: '确认撤销管理员身份',
          confirm: '撤销管理员身份',
          danger: true,
          body: (
            <Text>
              撤销后，<b>{detail.name}</b>{' '}
              将失去站点管理入口。其创建工作区的能力改由「普通用户创建授权」决定：
              <b>
                {detail.canCreateWorkspace
                  ? '可以创建工作区'
                  : '不能创建工作区'}
              </b>
              。其已有会话会被撤销，需要重新登录。若这是最后一个启用中的管理员，服务端会拒绝此操作。
            </Text>
          ),
        };
  };

  const copy = dialogCopy();

  return (
    <Drawer
      opened={!!userId}
      onClose={onClose}
      title="用户详情"
      position="right"
      size="min(100vw, 420px)"
      closeButtonProps={{ 'aria-label': '关闭用户详情' }}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      transitionProps={{ duration: reduceMotion ? 0 : 150 }}
      classNames={{ content: styles.drawerBody }}
    >
      {query.isPending && (
        <div className={styles.loadState} role="status">
          <Loader size="sm" aria-label="加载用户详情" />
        </div>
      )}

      {!query.isPending && !!query.error && (
        <Alert color="orange" role="alert" title="无法读取用户详情">
          <div className={styles.alertActions}>
            <Button
              size="compact-sm"
              variant="default"
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              重试
            </Button>
          </div>
        </Alert>
      )}

      {!query.isPending && !query.error && !detail && (
        <EmptyState
          size="inline"
          title="没有可展示的用户"
          description="该账号可能已被移除，请返回列表重新选择。"
        />
      )}

      {detail && (
        <>
          <div className={styles.drawerIdentity}>
            <Avatar src={detail.avatarUrl} radius="xl" color="blue" size={38}>
              {detail.name.slice(0, 1)}
            </Avatar>
            <div className={styles.identityText}>
              <p className={styles.drawerName}>{detail.name}</p>
              <p className={styles.drawerEmail}>{detail.email}</p>
            </div>
          </div>
          <p className={styles.drawerMeta}>
            创建来源：{signupSourceLabel(detail.signupSource)} · 创建时间：
            {formatDate(detail.createdAt)}
          </p>

          <h3 className={styles.drawerSectionTitle}>账号状态</h3>
          <div className={styles.drawerRow}>
            <div className={styles.drawerRowText}>
              <p className={styles.drawerRowTitle}>登录状态</p>
              <p className={styles.drawerRowValue}>
                当前值：{statusText(detail)}
              </p>
              <p className={styles.drawerRowNote}>
                {detail.disabled
                  ? '该账号当前不能登录站点。'
                  : '该账号当前可以登录站点。'}
                {self && ' 这是你自己的账号。'}
              </p>
            </div>
            <div className={styles.drawerRowControl}>
              <Button
                variant="default"
                color={detail.disabled ? 'blue' : 'red'}
                disabled={busy}
                onClick={() =>
                  setPending({ kind: 'disabled', value: !detail.disabled })
                }
              >
                {detail.disabled ? '启用账号' : '禁用账号'}
              </Button>
            </div>
          </div>

          <h3 className={styles.drawerSectionTitle}>站点身份与能力</h3>
          <div className={styles.drawerRow}>
            <div className={styles.drawerRowText}>
              <p className={styles.drawerRowTitle}>站点身份</p>
              <p className={styles.drawerRowValue}>当前值：{roleText(detail)}</p>
              <p className={styles.drawerRowNote}>
                {detail.isAdmin
                  ? '可以管理全站用户与站点设置。'
                  : '只能使用已加入的工作区；管理入口不显示。'}
              </p>
            </div>
            <div className={styles.drawerRowControl}>
              <Button
                variant="default"
                color={detail.isAdmin ? 'red' : 'blue'}
                disabled={busy}
                onClick={() =>
                  setPending({ kind: 'isAdmin', value: !detail.isAdmin })
                }
              >
                {detail.isAdmin ? '撤销管理员身份' : '授予管理员身份'}
              </Button>
            </div>
          </div>

          <div className={styles.drawerRow}>
            <div className={styles.drawerRowText}>
              <p className={styles.drawerRowTitle}>普通用户创建授权</p>
              <p className={styles.drawerRowValue}>
                当前值：{canCreateText(detail.canCreateWorkspace)}
              </p>
              <p className={styles.drawerRowNote}>
                这是管理员维护的原始授权字段。切换后立即保存，不撤销该用户的会话。
              </p>
            </div>
            <div className={styles.drawerRowControl}>
              {update.isPending && createPending && (
                <>
                  <Loader size="xs" aria-hidden />
                  <span className={styles.statusText}>保存中…</span>
                </>
              )}
              <Switch
                aria-label="普通用户创建授权"
                checked={createChecked}
                disabled={busy}
                onChange={(event) => {
                  const value = event.currentTarget.checked;
                  setCreateDraft(value);
                  submit({ canCreateWorkspace: value });
                }}
              />
              {createPending && !update.isPending && (
                <span className={styles.statusText}>尚未生效</span>
              )}
            </div>
          </div>

          <div className={styles.drawerRow}>
            <div className={styles.drawerRowText}>
              <p className={styles.drawerRowTitle}>最终生效的创建权限</p>
              <p className={styles.drawerRowValue}>
                {canCreateText(detail.effectiveCanCreateWorkspace)}
              </p>
              <p className={styles.drawerRowNote}>{effectiveNote(detail)}</p>
            </div>
          </div>

          <h3 className={styles.drawerSectionTitle}>工作区</h3>
          <p className={styles.drawerMeta}>
            加入工作区 {detail.stats.memberWorkspaces} 个 · 创建工作区{' '}
            {detail.stats.ownedWorkspaces} 个
          </p>
          {detail.stats.soleOwnerRisk && (
            <p className={styles.drawerRowNote}>
              该账号可能是某些工作区唯一的可用
              owner。禁用前请先确认是否需要交接；这是提示，不是禁止封禁的理由——保留成员记录，不擅自转移所有权。
            </p>
          )}

          <div className={styles.drawerDangerZone}>
            <p className={styles.drawerDangerTitle}>撤销全部会话</p>
            <p className={styles.drawerDangerNote}>
              使该账号当前已建立的会话失效并关闭实时连接。不禁用账号、不修改密码、不撤销创建权限；用户可以凭有效凭据重新登录。
            </p>
            <div className={styles.drawerDangerAction}>
              <Button
                variant="default"
                color="red"
                disabled={busy}
                leftSection={<LogOut size={16} aria-hidden />}
                onClick={() => setPending({ kind: 'sessions' })}
              >
                撤销全部会话
              </Button>
            </div>
          </div>

          {conflict && (
            <Alert
              color="red"
              role="alert"
              className={styles.drawerError}
              title="该账号已被其他管理员修改"
            >
              <Text size="sm" className={styles.alertText}>
                另一位管理员已修改此账号。不会自动覆盖对方的修改，也不会自动重试。
              </Text>
              <Text size="xs" c="dimmed">
                {query.isFetching || !query.data
                  ? '正在读取服务端当前值…'
                  : `服务端当前值：账号状态 ${statusText(query.data)}、站点身份 ${roleText(query.data)}、普通用户创建授权 ${canCreateText(query.data.canCreateWorkspace)}`}
              </Text>
              <div className={styles.alertActions}>
                <Button
                  size="compact-sm"
                  variant="default"
                  loading={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  重新读取
                </Button>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="gray"
                  onClick={discardDraft}
                >
                  放弃我的修改
                </Button>
              </div>
            </Alert>
          )}

          {!!updateError && !conflict && !pending && (
            <Alert
              color="red"
              role="alert"
              className={styles.drawerError}
              title="修改未生效"
            >
              <Text size="sm" className={styles.alertText}>
                {updateError}
              </Text>
              {createPending && (
                <Text size="xs" c="dimmed">
                  服务端当前值：{canCreateText(detail.canCreateWorkspace)}
                </Text>
              )}
              <div className={styles.alertActions}>
                <Button
                  size="compact-sm"
                  variant="default"
                  disabled={busy}
                  onClick={() =>
                    createDraft !== null
                      ? submit({ canCreateWorkspace: createDraft })
                      : undefined
                  }
                >
                  重试
                </Button>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="gray"
                  disabled={busy}
                  onClick={discardDraft}
                >
                  放弃我的修改
                </Button>
              </div>
            </Alert>
          )}
        </>
      )}

      <Modal
        opened={pending !== null && !!detail}
        onClose={() => {
          if (!busy) {
            setPending(null);
            setSessionError('');
          }
        }}
        title={copy?.title ?? ''}
        centered
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
        classNames={{ content: styles.dialogContent }}
      >
        {copy?.body}
        {/* 确认弹窗内展示失败原因：管理员不必关掉弹窗才知道发生了什么。 */}
        {pending?.kind === 'sessions' && !!sessionError && (
          <Alert color="red" role="alert" mt="md">
            {sessionError}
          </Alert>
        )}
        {pending?.kind !== 'sessions' && !!updateError && (
          <Alert color="red" role="alert" mt="md">
            {updateError}
          </Alert>
        )}
        <Group justify="flex-end" mt="lg" gap={10}>
          <Button
            variant="default"
            disabled={busy}
            onClick={() => {
              setPending(null);
              setSessionError('');
            }}
          >
            取消
          </Button>
          <Button
            color={copy?.danger ? 'red' : 'blue'}
            loading={busy}
            onClick={confirmPending}
          >
            {copy?.confirm}
          </Button>
        </Group>
      </Modal>
    </Drawer>
  );
}
