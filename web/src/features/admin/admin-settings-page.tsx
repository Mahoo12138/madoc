import { Navigate, useNavigate } from '@tanstack/react-router';
import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { useSession, useSiteSettings } from '@/api/hooks';
import { APIError } from '@/api/types';
import { AdminSettingsPanel } from './admin-settings-panel';
import { AdminShell, AdminUnauthorized } from './admin-shell';
import * as styles from './admin.css';

/**
 * Route composition only: session + settings state branches, then the Admin
 * Shell. All interaction lives in `admin-settings-panel.tsx`, the frame in
 * `admin-shell.tsx`, and all styles in `admin.css.ts` (AGENTS.md §6).
 */
export function AdminSettingsPage() {
  const session = useSession();
  const settings = useSiteSettings();
  const navigate = useNavigate();
  const goToWorkspaces = () => void navigate({ to: '/workspaces' });

  if (session.isPending || settings.isPending)
    return (
      <Center mih="100dvh">
        <Stack align="center" gap="sm" role="status">
          <Loader aria-hidden />
          <Text>正在读取站点设置…</Text>
        </Stack>
      </Center>
    );

  const unauthorized =
    (session.error instanceof APIError && session.error.status === 401) ||
    (settings.error instanceof APIError && settings.error.status === 401);
  if (unauthorized) return <Navigate to="/sign-in" replace />;

  if (!session.data?.user && session.error)
    return (
      <Stack justify="center" className={styles.standalone}>
        <Stack className={styles.standaloneStack}>
          <Alert color="orange" role="alert" title="无法读取站点设置">
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

  // 403 ADMIN_REQUIRED：不展示任何设置数据，也不提供重试（重试改变不了结果）。
  if (
    settings.error instanceof APIError &&
    (settings.error.code === 'ADMIN_REQUIRED' || settings.error.status === 403)
  )
    return <AdminUnauthorized />;

  if (settings.error || !settings.data)
    return (
      <Stack justify="center" className={styles.standalone}>
        <Stack className={styles.standaloneStack}>
          <Alert color="orange" role="alert" title="无法读取站点设置">
            请检查网络后重试。
          </Alert>
          <Button
            variant="default"
            loading={settings.isFetching}
            onClick={() => void settings.refetch()}
          >
            重试
          </Button>
          <Button variant="subtle" color="gray" onClick={goToWorkspaces}>
            返回工作区
          </Button>
        </Stack>
      </Stack>
    );

  return (
    <AdminShell
      user={session.data.user}
      section="站点设置"
      regionLabel="站点设置"
    >
      <AdminSettingsPanel settings={settings.data} />
    </AdminShell>
  );
}
