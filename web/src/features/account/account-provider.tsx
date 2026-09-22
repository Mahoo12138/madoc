import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Alert,
  Loader,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { keys, useSession } from '@/api/hooks';
import { api } from '@/api/client';
import type { Session, User } from '@/api/types';
import { MarkdownShortcuts } from '@/features/markdown/markdown-editor-controls';
import { ProfilePanel, type ProfileHandle } from './profile-panel';
import { SecurityPanel } from './security-panel';
import { PreferencesProvider, usePreferences } from './preferences-provider';
import { PreferencesPanel } from './preferences-panel';
import { hasPendingChanges } from './pending-changes';
import * as styles from './account.css';
const MarkdownRecoveryPanel = lazy(() => import('@/features/markdown/markdown-recovery-panel'));
export type AccountSection =
  'profile' | 'preferences' | 'security' | 'shortcuts' | 'recovery';
const labels = {
  profile: '个人资料',
  preferences: 'Markdown 偏好',
  security: '账号安全',
  shortcuts: '快捷键',
  recovery: '本地恢复',
};
const AccountContext = createContext({
  open: (_section: AccountSection) => {},
  signOut: () => {},
});
export const useAccount = () => useContext(AccountContext);
export function AccountProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <PreferencesProvider userID={session.data?.user?.id}>
      <AccountUI>{children}</AccountUI>
    </PreferencesProvider>
  );
}
function AccountUI({ children }: { children: ReactNode }) {
  const preferences = usePreferences();
  const session = useSession();
  const client = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [section, setSection] = useState<AccountSection>('profile');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [logout, setLogout] = useState(false);
  const [error, setError] = useState('');
  const nextAction = useRef<() => void>();
  const profile = useRef<ProfileHandle>(null);
  const mobile = useMediaQuery('(max-width: 760px)');
  const guard = (action: () => void) => {
    if (busy) return;
    if (dirty) {
      nextAction.current = action;
      setConfirm(true);
    } else action();
  };
  const updateUser = (user: User) => {
    client.setQueryData<Session>(keys.session, (old) =>
      old ? { ...old, user } : old,
    );
    void client.invalidateQueries({ queryKey: ['members'] });
    window.dispatchEvent(
      new CustomEvent('madoc-profile-changed', { detail: user }),
    );
  };
  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      await api.signOut();
      client.clear();
      location.assign('/sign-in');
    } catch {
      setError('退出失败，请检查网络后重试');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AccountContext.Provider
      value={{
        open: (target) => {
          setSection(target);
          setOpened(true);
          void preferences.refresh?.();
        },
        signOut: () => {
          if (hasPendingChanges()) setLogout(true);
          else void signOut();
        },
      }}
    >
      {children}
      <Modal
        opened={opened && !!session.data?.user}
        onClose={() => guard(() => setOpened(false))}
        title="个人设置"
        size={840}
        classNames={{ content: styles.modalContent }}
        fullScreen={mobile}
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
        withCloseButton={!busy}
      >
        <div className={styles.layout}>
          <nav className={styles.navigation} aria-label="个人设置分类">
            {(['profile', 'preferences', 'security', 'shortcuts', 'recovery'] as const).map(
              (value) => (
                <Button
                  key={value}
                  className={
                    value === section ? undefined : styles.inactiveNavigation
                  }
                  variant={value === section ? 'light' : 'subtle'}
                  color={value === section ? 'blue' : 'gray'}
                  justify="flex-start"
                  aria-current={value === section ? 'page' : undefined}
                  onClick={() => guard(() => setSection(value))}
                >
                  {labels[value]}
                </Button>
              ),
            )}
          </nav>
          <div className={styles.mobileNavigation}>
            <Select
              aria-label="个人设置分类"
              value={section}
              data={Object.entries(labels).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(value) =>
                value && guard(() => setSection(value as AccountSection))
              }
            />
          </div>
          <section className={styles.content}>
            {opened &&
              session.data?.user &&
              (section === 'profile' ? (
                <ProfilePanel
                  ref={profile}
                  user={session.data.user}
                  onUser={updateUser}
                  onDirty={setDirty}
                  onBusy={setBusy}
                />
              ) : section === 'security' ? (
                <SecurityPanel onBusy={setBusy} />
              ) : section === 'recovery' ? (
                <Suspense fallback={<Loader size="sm" />}><MarkdownRecoveryPanel key={session.data.user.id} userId={session.data.user.id} /></Suspense>
              ) : section === 'shortcuts' ? (
                <MarkdownShortcuts />
              ) : (
                <PreferencesPanel />
              ))}
          </section>
        </div>
      </Modal>
      <Modal
        opened={confirm}
        onClose={() => !busy && setConfirm(false)}
        title="保存个人资料？"
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
      >
        <Stack>
          <Text size="sm">你有尚未保存的资料更改。</Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              继续编辑
            </Button>
            <Button
              variant="subtle"
              disabled={busy}
              onClick={() => {
                setConfirm(false);
                setDirty(false);
                nextAction.current?.();
              }}
            >
              放弃更改
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (await profile.current?.save()) {
                  setConfirm(false);
                  nextAction.current?.();
                }
              }}
            >
              保存并继续
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={logout || !!error}
        onClose={() => {
          if (!busy) {
            setLogout(false);
            setError('');
          }
        }}
        title="退出登录"
        closeOnClickOutside={!busy}
      >
        <Stack>
          {error && (
            <Alert role="alert" color="red">
              {error}
            </Alert>
          )}
          <Text size="sm">
            还有未同步的文档修改或偏好。可以继续等待同步，或确认退出。
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={busy}
              onClick={() => {
                setLogout(false);
                setError('');
              }}
            >
              继续等待
            </Button>
            <Button color="red" loading={busy} onClick={() => void signOut()}>
              确认退出
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AccountContext.Provider>
  );
}
