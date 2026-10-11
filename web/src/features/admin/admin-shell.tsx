import { useEffect, type ReactNode } from 'react';
import { Burger, Button, Drawer, Stack } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Home, ScrollText, Settings2, ShieldAlert, Users } from 'lucide-react';
import type { User } from '@/api/types';
import { AccountMenu } from '@/features/account/account-menu';
import { EmptyState } from '@/features/shared/empty-state';
import { workspaceMedia } from '@/features/workspaces/workspace-layout';
import * as shell from '@/features/workspaces/workspace-shell.css';
import * as styles from './admin.css';

/** §10.1：用户管理在前，站点设置紧随其后，操作记录（审计查看）殿后。 */
const navigation = [
  { id: 'users', label: '用户管理', to: '/admin/users' as const, Icon: Users },
  {
    id: 'settings',
    label: '站点设置',
    to: '/admin/settings' as const,
    Icon: Settings2,
  },
  {
    id: 'audit',
    label: '操作记录',
    to: '/admin/audit' as const,
    Icon: ScrollText,
  },
];

/**
 * `ADMIN_REQUIRED`: a refusal, not an error to recover from. It renders without
 * the Admin Shell so a non-admin sees no management chrome at all, and without
 * a retry — retrying cannot change an authorization decision.
 */
export function AdminUnauthorized() {
  const navigate = useNavigate();
  return (
    <Stack justify="center" className={styles.standalone}>
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
    </Stack>
  );
}

/**
 * The Admin Shell is shared by every `/admin/*` route: brand row, the section
 * navigation, the page header and the mobile drawer. Routes only compose it and
 * render their own region inside (AGENTS.md §6).
 */
export function AdminShell({
  user,
  section,
  regionLabel,
  children,
}: {
  user: User;
  /** 页头 `/` 之后的段名，例如「用户管理」。 */
  section: string;
  regionLabel: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
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

  const sectionButtons = (
    <nav className={styles.navigation} aria-label="站点管理导航">
      {navigation.map(({ id, label, to, Icon }) => {
        const active = pathname === to;
        return (
          <button
            key={id}
            type="button"
            className={`${styles.navButton} ${active ? styles.navButtonActive : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              navigationDrawer.close();
              void navigate({ to });
            }}
          >
            <Icon size={17} aria-hidden />
            {label}
          </button>
        );
      })}
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
              站点管理 <span className={styles.headerSeparator}>/</span>{' '}
              {section}
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
        <div className={styles.content} role="region" aria-label={regionLabel}>
          <div className={styles.pane}>{children}</div>
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
