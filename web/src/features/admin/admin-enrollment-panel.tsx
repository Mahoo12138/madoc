import { useState } from 'react';
import {
  Alert,
  Button,
  CopyButton,
  Loader,
  Modal,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Check, Copy, MailPlus, Trash2 } from 'lucide-react';
import {
  useAccountEnrollments,
  useCreateAccountEnrollment,
  useRevokeAccountEnrollment,
} from '@/api/hooks';
import { APIError, type AccountEnrollment } from '@/api/types';
import { EmptyState } from '@/features/shared/empty-state';
import { AdminUnauthorizedNotice } from './admin-shell';
import {
  enrollmentEmailProblem,
  enrollmentErrorMessage,
  enrollmentGrantText,
  enrollmentStatusNote,
  enrollmentStatusText,
  formatDateTime,
  revokeErrorMessage,
} from './admin-enrollment-labels';
import { formatDate } from './admin-user-labels';
import * as styles from './admin.css';

/**
 * §11.3：只有服务端仍未消费的记录值得撤销——已完成和已撤销的没有东西可收。
 * 这里看的是服务端的 `status`，不是界面的「已过期」：过期只是按时间推导出的展示状态，
 * 那条待激活记录仍然挂在这儿，撤销仍是收掉它的唯一显式动作。
 */
function isRevocable(status: string): boolean {
  return status === 'pending';
}

function isAdminRequired(error: unknown): boolean {
  return (
    error instanceof APIError &&
    (error.code === 'ADMIN_REQUIRED' || error.status === 403)
  );
}

/**
 * 待激活：管理员显式建号的授权记录（§11.3）。
 *
 * 它不是用户列表的一部分——里面没有账号，只有「已批准、等待对方设置密码」的授权。
 * 服务端是唯一事实来源：这里没有本地副本，成功后靠 query 失效重新读取，不做乐观更新。
 * 令牌从不在这里出现：列表接口不返回它，服务端也只保存摘要。
 */
export function AccountEnrollmentPanel() {
  const enrollments = useAccountEnrollments();
  const create = useCreateAccountEnrollment();
  const revoke = useRevokeAccountEnrollment();
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [grantCanCreate, setGrantCanCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  /** 一次性链接：原始令牌只在创建响应里出现这一次，不在 vite/query 缓存里留第二份。 */
  const [activationLink, setActivationLink] = useState('');
  const [pendingRevoke, setPendingRevoke] = useState<AccountEnrollment | null>(null);
  const [revokeError, setRevokeError] = useState('');

  const rows: AccountEnrollment[] = enrollments.data?.enrollments ?? [];
  const busy = create.isPending || revoke.isPending;

  const closeCreate = () => {
    if (create.isPending) return;
    setCreating(false);
    setEmail('');
    setGrantCanCreate(false);
    setCreateError('');
  };

  const submitCreate = async () => {
    const problem = enrollmentEmailProblem(email);
    if (problem) {
      setCreateError(problem);
      return;
    }
    setCreateError('');
    try {
      const result = await create.mutateAsync({
        email: email.trim(),
        canCreateWorkspace: grantCanCreate,
      });
      setActivationLink(`${location.origin}${result.url}`);
      setCreating(false);
      setEmail('');
      setGrantCanCreate(false);
      notifications.show({ message: '激活链接已创建', color: 'blue' });
    } catch (error) {
      // 草稿保留：邮箱与授权选择仍在表单里，管理员可以直接改而不用重填。
      setCreateError(enrollmentErrorMessage(error));
    }
  };

  const confirmRevoke = async () => {
    if (!pendingRevoke || revoke.isPending) return;
    setRevokeError('');
    try {
      await revoke.mutateAsync(pendingRevoke.id);
      setPendingRevoke(null);
      notifications.show({ message: '待激活记录已撤销', color: 'blue' });
    } catch (error) {
      // 弹窗留在原处：管理员不必关掉它才知道发生了什么，也能直接重试。
      setRevokeError(revokeErrorMessage(error));
    }
  };

  // 403：这里一条记录都不展示，也不提供重试——重试改变不了授权结果。
  if (isAdminRequired(enrollments.error))
    return (
      <section className={styles.sectionRule} aria-label="待激活的账号">
        <AdminUnauthorizedNotice />
      </section>
    );

  return (
    <section
      className={styles.sectionRule}
      aria-labelledby="account-enrollment-heading"
    >
      <div className={styles.actionRow}>
        <div className={styles.actionText}>
          <h2 id="account-enrollment-heading" className={styles.sectionTitle}>
            待激活的账号
          </h2>
          <p className={styles.pageLead}>
            由管理员批准、等待对方设置密码的账号。账号要到对方打开激活链接并自行设置姓名与密码后才存在，在此之前这里只有一条授权记录。
          </p>
          <p className={styles.pendingNote}>
            管理员显式建号不受注册模式限制：即使站点设置为「关闭注册」，这里批准的账号仍然可以加入。切换注册模式也不会让已经发出的激活链接失效——要停用某一条，必须在此显式撤销。
          </p>
        </div>
        <div className={styles.control}>
          <Button
            leftSection={<MailPlus size={16} aria-hidden />}
            onClick={() => setCreating(true)}
          >
            新建待激活账号
          </Button>
        </div>
      </div>

      {activationLink && (
        <div className={styles.enrollmentLink}>
          <TextInput
            className={styles.enrollmentLinkField}
            aria-label="激活链接"
            value={activationLink}
            readOnly
          />
          <CopyButton value={activationLink}>
            {({ copied, copy }) => (
              <Button
                variant="light"
                onClick={copy}
                aria-label={copied ? '激活链接已复制' : '复制激活链接'}
                leftSection={copied ? <Check size={16} /> : <Copy size={16} />}
              >
                {copied ? '已复制' : '复制'}
              </Button>
            )}
          </CopyButton>
        </div>
      )}
      {activationLink && (
        <p className={styles.pendingNote}>
          链接只显示一次，请及时复制发送。关闭或刷新页面后无法再次查看，只能重新创建一条记录。
        </p>
      )}

      <div className={styles.listStatus}>
        <p className={styles.listCount}>
          {enrollments.isPending
            ? '正在读取待激活记录…'
            : `共 ${rows.length} 条待激活记录`}
        </p>
      </div>

      {enrollments.isPending && (
        <div className={styles.loadState} role="status">
          <Loader size="sm" aria-label="加载待激活记录" />
        </div>
      )}

      {!enrollments.isPending && !!enrollments.error && (
        <Alert color="orange" role="alert" className={styles.rowAlert} title="无法读取待激活记录">
          <div className={styles.alertActions}>
            <Button
              size="compact-sm"
              variant="default"
              loading={enrollments.isFetching}
              onClick={() => void enrollments.refetch()}
            >
              重试
            </Button>
          </div>
        </Alert>
      )}

      {!enrollments.isPending && !enrollments.error && rows.length === 0 && (
        <div className={styles.emptySection}>
          <EmptyState
            size="section"
            icon={MailPlus}
            title="还没有待激活的账号"
            description="管理员显式批准的账号会出现在这里；对方设置密码后，账号会转到上方的用户列表中。"
            note="发送出去的激活链接只显示一次，请及时复制给对方。"
          />
        </div>
      )}

      {!enrollments.isPending && !enrollments.error && rows.length > 0 && (
        <div className={styles.infoList}>
          {rows.map((enrollment) => {
            const note = enrollmentStatusNote(enrollment);
            return (
              <div
                key={enrollment.id}
                className={styles.infoCard}
                role="group"
                aria-label={`待激活账号：${enrollment.email}`}
              >
                <div className={styles.infoHead}>
                  <div className={styles.identityText}>
                    <p className={styles.identityName}>{enrollment.email}</p>
                    <p className={styles.identityEmail}>
                      创建于 {formatDate(enrollment.createdAt)}
                      {enrollment.consumedAt
                        ? ` · 完成于 ${formatDateTime(enrollment.consumedAt)}`
                        : ''}
                    </p>
                  </div>
                </div>
                <div className={styles.infoGrid}>
                  <p className={styles.infoLabel}>状态</p>
                  <p className={styles.infoValue}>
                    {enrollmentStatusText(enrollment)}
                    {note ? ` · ${note}` : ''}
                  </p>
                  <p className={styles.infoLabel}>到期时间</p>
                  <p className={styles.infoValue}>
                    {formatDateTime(enrollment.expiresAt)}
                  </p>
                  <p className={styles.infoLabel}>初始创建授权</p>
                  <p className={styles.infoValue}>
                    {enrollmentGrantText(enrollment.canCreateWorkspace)}
                  </p>
                </div>
                <div className={styles.infoActions}>
                  {isRevocable(enrollment.status) && (
                    <Button
                      variant="default"
                      color="red"
                      size="compact-sm"
                      leftSection={<Trash2 size={16} aria-hidden />}
                      disabled={busy}
                      onClick={() => {
                        setRevokeError('');
                        setPendingRevoke(enrollment);
                      }}
                    >
                      撤销
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        opened={creating}
        onClose={closeCreate}
        title="新建待激活账号"
        centered
        closeOnClickOutside={!create.isPending}
        closeOnEscape={!create.isPending}
        withCloseButton={!create.isPending}
        classNames={{ content: styles.dialogContent }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!create.isPending) void submitCreate();
          }}
        >
          <TextInput
            autoFocus
            label="邮箱"
            type="email"
            placeholder="name@example.com"
            value={email}
            disabled={create.isPending}
            onChange={(event) => {
              setEmail(event.currentTarget.value);
              if (createError) setCreateError('');
            }}
            onKeyDown={(event) => {
              // 中文输入法下 Enter 用于确认候选词，不能当作提交。
              if (event.key === 'Enter' && event.nativeEvent.isComposing)
                event.preventDefault();
            }}
            error={
              email.trim() ? (enrollmentEmailProblem(email) ?? undefined) : undefined
            }
          />
          <div className={styles.actionRow}>
            <div className={styles.actionText}>
              <p className={styles.rowValue}>初始创建授权</p>
              <p className={styles.pendingNote}>
                {grantCanCreate
                  ? '该账号激活后可以创建新的工作区。'
                  : '该账号激活后只能使用他人邀请的工作区。'}
                这是你在这次建号时显式选定的授权，不是站点默认值；激活后仍可在用户管理中调整。新的账号一律是普通用户，需要管理员身份请激活后再授予。
              </p>
            </div>
            <div className={styles.control}>
              <Switch
                aria-label="允许创建工作区"
                checked={grantCanCreate}
                disabled={create.isPending}
                onChange={(event) => setGrantCanCreate(event.currentTarget.checked)}
              />
            </div>
          </div>
          {!!createError && (
            <Alert color="red" role="alert" className={styles.rowAlert}>
              {createError}
            </Alert>
          )}
          <div className={styles.formActions}>
            <Button variant="default" disabled={create.isPending} onClick={closeCreate}>
              取消
            </Button>
            <Button
              type="submit"
              loading={create.isPending}
              disabled={!!enrollmentEmailProblem(email)}
            >
              创建链接
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        opened={pendingRevoke !== null}
        onClose={() => {
          if (!revoke.isPending) {
            setPendingRevoke(null);
            setRevokeError('');
          }
        }}
        title="确认撤销待激活记录"
        centered
        closeOnClickOutside={!revoke.isPending}
        closeOnEscape={!revoke.isPending}
        withCloseButton={!revoke.isPending}
        classNames={{ content: styles.dialogContent }}
      >
        <Text>
          撤销发给 <b>{pendingRevoke?.email}</b>{' '}
          的待激活记录后，原激活链接将立即失效，对方再打开它就看不到建号表单了。
          <b>如果对方还没完成激活，账号不会创建</b>
          ；需要让他进来时，请重新新建一条待激活账号并发送新链接。这条撤销不影响已存在的账号。
        </Text>
        {!!revokeError && (
          <Alert color="red" role="alert" mt="md">
            {revokeError}
          </Alert>
        )}
        <div className={styles.formActions}>
          <Button
            variant="default"
            disabled={revoke.isPending}
            onClick={() => {
              setPendingRevoke(null);
              setRevokeError('');
            }}
          >
            取消
          </Button>
          <Button color="red" loading={revoke.isPending} onClick={() => void confirmRevoke()}>
            撤销
          </Button>
        </div>
      </Modal>
    </section>
  );
}
