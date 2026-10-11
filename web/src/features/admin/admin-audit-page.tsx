import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { Navigate } from '@tanstack/react-router';
import { useSession } from '@/api/hooks';
import { APIError } from '@/api/types';
import { AdminAuditPanel } from './admin-audit-panel';
import { AdminShell, AdminUnauthorized } from './admin-shell';
import * as styles from './admin.css';

/**
 * Route composition only: session state branches, then the Admin Shell. The
 * list, its filters, the empty state and the 403 refusal all live in
 * `admin-audit-panel.tsx`, and every style lives in `admin.css.ts` (AGENTS.md §6).
 */
export function AdminAuditPage() {
  const session = useSession();

  if (session.isPending)
    return (
      <Center mih="100dvh">
        <Stack align="center" gap="sm" role="status">
          <Loader aria-hidden />
          <Text>正在读取操作记录…</Text>
        </Stack>
      </Center>
    );

  if (session.error instanceof APIError && session.error.status === 401)
    return <Navigate to="/sign-in" replace />;

  if (!session.data?.user && session.error)
    return (
      <Stack justify="center" className={styles.standalone}>
        <Stack className={styles.standaloneStack}>
          <Alert color="orange" role="alert" title="无法读取操作记录">
            无法验证登录状态，请检查网络后重试。
          </Alert>
          <Button
            variant="default"
            loading={session.isFetching}
            onClick={() => void session.refetch()}
          >
            重试
          </Button>
        </Stack>
      </Stack>
    );
  if (!session.data?.user) return <Navigate to="/sign-in" replace />;

  // 入口只按会话身份决定；真正的权限判定仍在服务端，列表读到 403 时面板会再次拒绝。
  if (!session.data.user.isAdmin) return <AdminUnauthorized />;

  return (
    <AdminShell
      user={session.data.user}
      section="操作记录"
      regionLabel="操作记录"
    >
      <AdminAuditPanel />
    </AdminShell>
  );
}
