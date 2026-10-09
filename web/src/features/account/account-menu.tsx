import { Avatar, Menu, Text, UnstyledButton } from '@mantine/core';
import { ChevronUp, LogOut, Settings2, ShieldCheck } from 'lucide-react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { User } from '@/api/types';
import { useAccount } from './account-provider';
import * as styles from './account.css';

export function AccountMenu({
  user,
  compact = false,
  onAction,
}: {
  user: User;
  compact?: boolean;
  onAction?: (action: () => void) => void;
}) {
  const account = useAccount();
  const navigate = useNavigate();
  const managementReturnItemId = useRouterState({
    select: (state) =>
      (state.location.state as { madocManagementReturnItemId?: unknown })
        ?.madocManagementReturnItemId,
  });
  const run = (action: () => void) => (onAction ? onAction(action) : action());
  const openSettings = () => {
    if (window.location.pathname === '/settings') return;
    const fromManagement = /^\/workspace\/[^/]+\/manage$/.test(
      window.location.pathname,
    );
    void navigate({
      to: '/settings',
      state: (previous) => ({
        ...previous,
        madocSettingsFrom: window.location.pathname + window.location.hash,
        madocManagementReturnItemId:
          fromManagement && typeof managementReturnItemId === 'string'
            ? managementReturnItemId
            : undefined,
      }),
    });
  };
  // `isAdmin` is a session snapshot, so it only decides whether the entry is
  // offered; /admin/settings itself re-checks on the server (403 ADMIN_REQUIRED).
  const openSiteAdmin = () => {
    if (window.location.pathname.startsWith('/admin')) return;
    void navigate({ to: '/admin/settings' });
  };
  return (
    <Menu
      width={280}
      shadow="md"
      radius="md"
      position={compact ? 'bottom-end' : 'top-start'}
      classNames={{
        item: styles.menuItem,
        itemSection: styles.menuItemSection,
      }}
    >
      <Menu.Target>
        <UnstyledButton aria-label="账号菜单" className={styles.trigger}>
          <Avatar src={user.avatarUrl} radius="xl" size={compact ? 34 : 30}>
            {[...user.name][0]}
          </Avatar>
          {!compact && (
            <>
              <div className={styles.identity}>
                <Text size="sm" fw={600} truncate>
                  {user.name}
                </Text>
                <Text size="xs" c="gray.7" truncate>
                  {user.email}
                </Text>
              </div>
              <ChevronUp size={14} />
            </>
          )}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown className={styles.menuDropdown}>
        <Menu.Label className={styles.menuIdentity}>
          <Avatar src={user.avatarUrl} radius="xl" size={40}>
            {[...user.name][0]}
          </Avatar>
          <div className={styles.menuIdentityText}>
            <Text
              size="sm"
              fw={600}
              className={styles.menuName}
              title={user.name}
            >
              {user.name}
            </Text>
            <Text
              size="xs"
              c="dimmed"
              className={styles.menuEmail}
              title={user.email}
            >
              {user.email}
            </Text>
          </div>
        </Menu.Label>
        <div className={styles.menuActions}>
          <Menu.Item
            leftSection={<Settings2 size={17} aria-hidden />}
            onClick={() => run(openSettings)}
          >
            设置
          </Menu.Item>
          {user.isAdmin && (
            <Menu.Item
              leftSection={<ShieldCheck size={17} aria-hidden />}
              onClick={() => run(openSiteAdmin)}
            >
              站点管理
            </Menu.Item>
          )}
          <Menu.Item
            color="red"
            leftSection={<LogOut size={17} aria-hidden />}
            onClick={() => run(account.signOut)}
          >
            退出登录
          </Menu.Item>
        </div>
      </Menu.Dropdown>
    </Menu>
  );
}
