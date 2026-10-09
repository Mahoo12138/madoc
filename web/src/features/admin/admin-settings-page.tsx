import { useEffect } from 'react';
import {
  Alert,
  Burger,
  Button,
  Center,
  Drawer,
  Loader,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { Navigate, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Home,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import { useSession, useSiteSettings } from '@/api/hooks';
import { APIError } from '@/api/types';
import { AccountMenu } from '@/features/account/account-menu';
import { EmptyState } from '@/features/shared/empty-state';
import { workspaceMedia } from '@/features/workspaces/workspace-layout';
import * as shell from '@/features/workspaces/workspace-shell.css';
import { AdminSettingsPanel } from './admin-settings-panel';
import * as styles from './admin.css';

const navigation = [{ id: 'settings', label: '站点设置', Icon: Settings2 }];

/**
 * Route composition only: session + settings state branches, then the Admin
 * Shell. All interaction lives in `admin-settings-panel.tsx` and all styles in
 * `admin.css.ts` (AGENTS.md §6).
 */
export function AdminSettingsPage() {
  const session = useSession();
  const settings = useSiteSettings();
  const navigate = useNavigate();
  const [navigationOpened, navigationDrawer] = useDisclosure(false);
  const mobile = useMediaQuery(workspaceMedia.mobile, undefined, {
    getInitialValueInEffect: false,
  });

  useEffect(() => {
    if (!mobile) navigationDrawer.close();
  }, [mobile, navigationDrawer.close]);

  const goToWorkspaces = () => {
    navigationDrawer.close();
    void navigate({ to: '/workspaces' });
  };

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
    return (
      <Stack justify="center" className={styles.standalone}>
        <EmptyState
          size="page"
          icon={ShieldAlert}
          title="没有站点管理权限"
          description="此页面仅站点管理员可访问。"
          note="如果你认为应该有权限，请联系站点管理员在用户管理中授予。"
          actions={
            <Button variant="default" onClick={goToWorkspaces}>
              返回工作区
            </Button>
          }
        />
      </Stack>
    );

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

  const user = session.data.user;
  const sectionButtons = (
    <nav className={styles.navigation} aria-label="站点管理导航">
      {navigation.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`${styles.navButton} ${styles.navButtonActive}`}
          aria-current="page"
          onClick={navigationDrawer.close}
        >
          <Icon size={17} aria-hidden />
          {label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className={shell.shell}>
      <aside className={`${shell.sidebar} ${styles.sidebar}`}>
        <div className={shell.brandRow}>
          <div className={shell.brand}>
            <img
              src="/logo.svg"
              alt=""
              aria-hidden
              className={shell.brandMark}
            />
            Madoc
          </div>
        </div>
        <div className={styles.sidebarHeading}>站点管理</div>
        {sectionButtons}
        <div className={shell.sidebarBottom}>
          <Button
            variant="subtle"
            color="gray"
            className={shell.footerAction}
            leftSection={<ArrowLeft size={16} aria-hidden />}
            onClick={goToWorkspaces}
          >
            返回工作区
          </Button>
          <AccountMenu user={user} />
        </div>
      </aside>

      <main
        className={`${shell.main} ${styles.pageMain}`}
        aria-label="站点管理"
      >
        <header className={styles.pageHeader}>
          <Burger
            className={styles.mobileNavigationToggle}
            opened={navigationOpened}
            onClick={navigationDrawer.toggle}
            aria-label="打开站点管理导航"
            aria-expanded={navigationOpened}
            size="sm"
          />
          <div className={styles.headerIdentity}>
            <h1 className={styles.pageTitle}>
              站点管理 <span className={styles.headerSeparator}>/</span> 站点设置
            </h1>
          </div>
          <Button
            className={styles.desktopBack}
            variant="subtle"
            color="gray"
            leftSection={<ArrowLeft size={16} aria-hidden />}
            onClick={goToWorkspaces}
          >
            返回工作区
          </Button>
        </header>
        <div
          className={styles.content}
          role="region"
          aria-label="站点设置"
        >
          <div className={styles.pane}>
            <AdminSettingsPanel settings={settings.data} />
          </div>
        </div>
      </main>

      <Drawer
        opened={!!mobile && navigationOpened}
        onClose={navigationDrawer.close}
        title="站点管理"
        size="min(100vw, 340px)"
        closeButtonProps={{ 'aria-label': '关闭站点管理导航' }}
      >
        <div className={styles.mobileDrawerBody}>
          {sectionButtons}
          <div className={styles.mobileNavigationFooter}>
            <Button
              variant="subtle"
              color="gray"
              className={shell.footerAction}
              leftSection={<Home size={16} aria-hidden />}
              onClick={goToWorkspaces}
            >
              所有工作区
            </Button>
            <AccountMenu
              user={user}
              onAction={(action) => {
                navigationDrawer.close();
                action();
              }}
            />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
