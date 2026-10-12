import { Alert, Button, Loader } from '@mantine/core';
import { MailCheck as IconMailCheck } from 'lucide-react';
import { APIError, type AdminMailStatus } from '@/api/types';
import { EmptyState } from '@/features/shared/empty-state';
import { AdminUnauthorizedNotice } from './admin-shell';
import * as styles from './admin.css';

/**
 * 发信能力诊断（§11.1）。
 *
 * SMTP 凭证在部署侧秘密配置里，管理页面**只显示是否就绪和脱敏诊断**：这里没有
 * 密码字段，也没有任何写入入口——这个区块回答「现在能不能发信、改了以后什么时候
 * 生效」，不回答「怎么改」。
 *
 * 两条如实说明都不能省：
 * - 未配置不是故障，它就是「公开注册不可用」这一个结论，并指向真正的出口（配环境变量）。
 * - 已配置也不代表立即生效：部署者改的是环境变量，进程读的是启动时的值。
 */

/** TLS 是传输方式（none / starttls / implicit），不是一个开关：如实按字面展示。 */
function tlsText(mode: string): string {
  if (mode === 'starttls') return 'STARTTLS（连接后升级）';
  if (mode === 'implicit') return '隐式 TLS（连接即加密）';
  if (mode === 'none') return '未加密';
  return mode || '—';
}

export function AdminMailPanel({
  mail,
  isPending,
  isFetching,
  error,
  onRetry,
}: {
  mail: AdminMailStatus | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: APIError | null;
  onRetry: () => void;
}) {
  // 403：一条配置事实都不展示，也不提供重试——重试改变不了授权结论。
  if (error instanceof APIError && (error.code === 'ADMIN_REQUIRED' || error.status === 403))
    return (
      <section className={styles.sectionRule} aria-label="发信能力">
        <AdminUnauthorizedNotice />
      </section>
    );

  return (
    <section className={styles.sectionRule} aria-label="发信能力">
      <div className={styles.actionRow}>
        <div className={styles.actionText}>
          <h2 className={styles.sectionTitle}>发信能力</h2>
          <p className={styles.pageLead}>
            公开注册需要通过邮件把注册链接发到申请人的邮箱。这里显示的是部署侧配置的
            只读诊断：凭证保存在服务器环境变量中，管理页面不读取、不展示，也不会替你
            保存任何密码。
          </p>
        </div>
      </div>

      {isPending && (
        <div className={styles.loadState} role="status">
          <Loader size="sm" aria-label="加载发信配置" />
        </div>
      )}

      {!isPending && !!error && (
        <Alert color="orange" role="alert" className={styles.rowAlert} title="无法读取发信配置">
          <div className={styles.alertActions}>
            <Button size="compact-sm" variant="default" loading={isFetching} onClick={onRetry}>
              重试
            </Button>
          </div>
        </Alert>
      )}

      {!isPending && !error && !mail?.configured && (
        <div className={styles.emptySection}>
          <EmptyState
            size="section"
            icon={IconMailCheck}
            title="尚未配置 SMTP"
            description="没有邮件服务时，初始化、工作区邀请和已有账号登录照常工作，只是无法启用公开注册——公开注册必须通过邮件验证邮箱身份。"
            note="请在部署侧设置 SMTP 环境变量后重启服务；这里不提供填写账号或密码的入口。"
          />
        </div>
      )}

      {!isPending && !error && mail?.configured && (
        <>
          <div className={styles.infoList}>
            <div className={styles.infoCard} role="group" aria-label="发信配置诊断">
              <div className={styles.infoGrid}>
                <p className={styles.infoLabel}>SMTP 服务器</p>
                <p className={styles.infoValue}>
                  {mail.host ? `${mail.host}${mail.port ? `:${mail.port}` : ''}` : '—'}
                </p>
                <p className={styles.infoLabel}>发件地址</p>
                <p className={styles.infoValue}>{mail.from || '—'}</p>
                <p className={styles.infoLabel}>传输加密</p>
                <p className={styles.infoValue}>{tlsText(mail.tls)}</p>
                <p className={styles.infoLabel}>SMTP 认证</p>
                <p className={styles.infoValue}>{mail.authConfigured ? '已配置' : '未配置'}</p>
                <p className={styles.infoLabel}>公开站点地址</p>
                <p className={styles.infoValue}>{mail.publicUrl || '未显式配置'}</p>
              </div>
            </div>
          </div>
          {/* 如实说明生效时机：部署者改的是环境变量，进程读的是启动时的值。 */}
          <p className={styles.pendingNote}>
            以上是进程启动时读到的配置。修改部署侧环境变量后需要重启服务才会生效，
            公开注册也要到那时才变为可用；在此之前请按当前配置判断。
          </p>
          {!mail.publicUrl && (
            // 链接地址直接写在信里，猜错就是收不到：这是一条要单独指出的事实。
            <p className={styles.pendingNote}>
              尚未显式配置公开站点地址。发信链接使用部署者配置的站点地址生成，请确认该地址
              是收件人实际能打开的完整地址。
            </p>
          )}
        </>
      )}
    </section>
  );
}
