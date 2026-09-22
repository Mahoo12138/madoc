import {
  Avatar,
  Divider,
  Group,
  Menu,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { ChevronUp, LogOut, Settings2 } from 'lucide-react';
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
  const run = (action: () => void) => (onAction ? onAction(action) : action());
  return (
    <Menu width={250} position={compact ? 'bottom-end' : 'top-start'}>
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
      <Menu.Dropdown className={styles.modalContent}>
        <Menu.Label>
          <Group gap="xs" wrap="nowrap">
            <Avatar src={user.avatarUrl} radius="xl" size={28}>
              {[...user.name][0]}
            </Avatar>
            <Text size="sm" fw={600} truncate>
              {user.name}
            </Text>
          </Group>
          <Text size="xs" truncate>
            {user.email}
          </Text>
        </Menu.Label>
        <Divider />
        <Menu.Item
          leftSection={<Settings2 size={16} />}
          onClick={() => run(() => account.open('profile'))}
        >
          设置
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<LogOut size={16} />}
          onClick={() => run(account.signOut)}
        >
          退出登录
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
