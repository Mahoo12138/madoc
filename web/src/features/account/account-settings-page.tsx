import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Avatar,
  Button,
  Center,
  Drawer,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  Navigate,
  useBlocker,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import {
  ArrowLeft,
  History,
  Keyboard,
  Menu as MenuIcon,
  Settings2,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { keys, useSession } from '@/api/hooks';
import { APIError, type Session, type User } from '@/api/types';
import { MarkdownShortcuts } from '@/features/markdown/markdown-editor-controls';
import { AccountMenu } from './account-menu';
import { PreferencesPanel } from './preferences-panel';
import { usePreferences } from './preferences-provider';
import { ProfilePanel, type ProfileHandle } from './profile-panel';
import { SecurityPanel } from './security-panel';
import * as shell from '@/features/workspaces/workspace-shell.css';
import * as styles from './account.css';

const WhiteboardRecoveryPanel = lazy(
  () => import('@/features/whiteboard/whiteboard-recovery-panel'),
);
const MarkdownRecoveryPanel = lazy(
  () => import('@/features/markdown/markdown-recovery-panel'),
);

export type AccountSection =
  'profile' | 'preferences' | 'security' | 'shortcuts' | 'recovery';

const sections = [
  { value: 'profile', label: '个人资料', icon: UserRound },
  { value: 'preferences', label: 'Markdown 偏好', icon: Settings2 },
  { value: 'security', label: '账号安全', icon: ShieldCheck },
  { value: 'shortcuts', label: '快捷键', icon: Keyboard },
  { value: 'recovery', label: '本地恢复', icon: History },
] as const;

function sectionFromHash(hash: string): AccountSection {
  const value = hash.replace(/^#/, '');
  return sections.find((entry) => entry.value === value)?.value ?? 'profile';
}

export function AccountSettingsPage() {
  const session = useSession();
  const preferences = usePreferences();
  const client = useQueryClient();
  const navigate = useNavigate();
  const returnPath = useRouterState({
    select: (state) =>
      (state.location.state as { madocSettingsFrom?: unknown })
        ?.madocSettingsFrom,
  });
  const managementReturnItemId = useRouterState({
    select: (state) =>
      (state.location.state as { madocManagementReturnItemId?: unknown })
        ?.madocManagementReturnItemId,
  });
  const [section, setSection] = useState<AccountSection>(() =>
    sectionFromHash(window.location.hash),
  );
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [securityDirty, setSecurityDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingSection, setPendingSection] = useState<AccountSection | null>(
    null,
  );
  const profile = useRef<ProfileHandle>(null);
  const authorizedHash = useRef<AccountSection | '*' | null>(null);
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) =>
      !(next.pathname === '/settings' && authorizedHash.current !== null) &&
      (dirty || securityDirty || busy),
    enableBeforeUnload: dirty || securityDirty || busy,
    withResolver: true,
  });

  useEffect(() => {
    void preferences.refresh?.();
  }, [preferences.refresh]);

  useEffect(() => {
    const onHashChange = () => {
      const next = sectionFromHash(window.location.hash);
      if (next === section) return;
      if (authorizedHash.current === '*' || authorizedHash.current === next) {
        authorizedHash.current = null;
        setSection(next);
      } else if (dirty || securityDirty || busy || editing) {
        window.history.replaceState(
          window.history.state,
          '',
          `/settings#${section}`,
        );
      } else setSection(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [section, dirty, securityDirty, busy, editing]);

  useEffect(() => {
    if (blocker.status !== 'blocked' || busy || dirty || securityDirty) return;
    blocker.proceed();
  }, [blocker, busy, dirty, securityDirty]);

  const updateUser = (user: User) => {
    client.setQueryData<Session>(keys.session, (old) =>
      old ? { ...old, user } : old,
    );
    void client.invalidateQueries({ queryKey: ['members'] });
    window.dispatchEvent(
      new CustomEvent('madoc-profile-changed', { detail: user }),
    );
  };

  const changeSection = (value: AccountSection) => {
    authorizedHash.current = value;
    setSection(value);
    setNavigationOpen(false);
    void navigate({
      to: '/settings',
      hash: value,
      state: true,
      replace: true,
    }).finally(() => {
      if (authorizedHash.current === value) authorizedHash.current = null;
    });
  };

  const selectSection = (value: AccountSection) => {
    if (busy || editing || value === section) return;
    if (dirty) setPendingSection(value);
    else changeSection(value);
  };

  const returnToWorkspace = () => {
    let origin: URL | null = null;
    if (typeof returnPath === 'string') {
      try {
        const parsed = new URL(returnPath, window.location.origin);
        if (parsed.origin === window.location.origin) origin = parsed;
      } catch {
        // Invalid or absent route state falls back to the workspace list.
      }
    }
    const workspace =
      /^\/workspace\/([a-zA-Z0-9-]+)(?:\/([a-zA-Z0-9-]+))?$/.exec(
        origin?.pathname ?? '',
      );
    const hash = origin?.hash.slice(1) ?? '';
    if (workspace?.[2] === 'manage') {
      void navigate({
        to: '/workspace/$workspaceId/manage',
        params: { workspaceId: workspace[1] },
        hash: hash === 'members' || hash === 'activity' ? hash : 'workspace',
        state: (previous) => ({
          ...previous,
          madocManagementReturnItemId:
            typeof managementReturnItemId === 'string' &&
            /^[a-zA-Z0-9-]+$/.test(managementReturnItemId)
              ? managementReturnItemId
              : undefined,
        }),
      });
    } else if (workspace?.[2]) {
      void navigate({
        to: '/workspace/$workspaceId/$itemId',
        params: { workspaceId: workspace[1], itemId: workspace[2] },
        hash: hash || undefined,
      });
    } else if (workspace) {
      void navigate({
        to: '/workspace/$workspaceId',
        params: { workspaceId: workspace[1] },
        hash: hash || undefined,
      });
    } else void navigate({ to: '/workspaces' });
  };

  if (session.isLoading)
    return (
      <Center mih="100vh">
        <Stack align="center" role="status">
          <Loader aria-hidden />
          <Text>正在加载个人设置…</Text>
        </Stack>
      </Center>
    );
  if (session.error instanceof APIError && session.error.status === 401) {
    return <Navigate to="/sign-in" replace />;
  }
  if (!session.data?.user && session.error)
    return (
      <Center mih="100vh" p="lg">
        <Stack w="min(100%, 420px)">
          <Alert color="orange" role="alert" title="无法打开个人设置">
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
      </Center>
    );
  if (!session.data?.user) {
    return <Navigate to="/sign-in" replace />;
  }

  const user = session.data.user;
  const sectionLabel = sections.find((entry) => entry.value === section)!.label;
  const sectionButtons = (
    <nav className={styles.navigation} aria-label="个人设置分类">
      {sections.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          className={styles.navigationItem}
          variant={value === section ? 'light' : 'subtle'}
          color={value === section ? 'blue' : 'gray'}
          leftSection={<Icon size={17} aria-hidden />}
          justify="flex-start"
          aria-current={value === section ? 'page' : undefined}
          onClick={() => selectSection(value)}
        >
          {label}
        </Button>
      ))}
    </nav>
  );

  return (
    <div className={shell.shell}>
      <aside className={shell.sidebar}>
        <div className={shell.brandRow}>
          <div className={shell.brand}>
            <img
              src="/logo.svg"
              alt=""
              aria-hidden
              className={shell.brandMark}
            />
            madoc
          </div>
        </div>
        <div className={styles.sidebarIdentity}>
          <Avatar src={user.avatarUrl} size={34} radius="md">
            {[...user.name][0]}
          </Avatar>
          <div className={styles.sidebarIdentityText}>
            <Text size="sm" fw={650} truncate>
              个人设置
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {user.name}
            </Text>
          </div>
        </div>
        <div className={styles.sidebarNavigation}>{sectionButtons}</div>
        <div className={shell.sidebarBottom}>
          <Button
            variant="subtle"
            color="gray"
            className={shell.footerAction}
            leftSection={<ArrowLeft size={16} aria-hidden />}
            onClick={returnToWorkspace}
          >
            返回工作区
          </Button>
          <AccountMenu user={user} />
        </div>
      </aside>

      <main className={styles.pageMain} aria-label="个人设置">
        <header className={styles.pageHeader}>
          <ActionIcon
            className={styles.mobileMenuButton}
            variant="subtle"
            color="gray"
            aria-label="打开设置导航"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen(true)}
          >
            <MenuIcon size={20} aria-hidden />
          </ActionIcon>
          <h1 className={styles.pageTitle}>
            个人设置 <span className={styles.headerSeparator}>/</span>{' '}
            {sectionLabel}
          </h1>
          <ActionIcon
            className={styles.mobileBackButton}
            variant="subtle"
            color="gray"
            aria-label="返回工作区"
            onClick={returnToWorkspace}
          >
            <ArrowLeft size={18} aria-hidden />
          </ActionIcon>
        </header>
        <div className={styles.pageScroll}>
          <section className={styles.content} aria-label={sectionLabel}>
            {section === 'profile' ? (
              <ProfilePanel
                ref={profile}
                user={user}
                onUser={updateUser}
                onDirty={setDirty}
                onBusy={setBusy}
                onEditingChange={setEditing}
              />
            ) : section === 'security' ? (
              <SecurityPanel
                onBusy={setBusy}
                onEditingChange={setEditing}
                onDirty={setSecurityDirty}
              />
            ) : section === 'recovery' ? (
              <Stack gap="xl" key={user.id}>
                <Suspense fallback={<Loader size="sm" />}>
                  <MarkdownRecoveryPanel userId={user.id} />
                </Suspense>
                <Suspense fallback={<Loader size="sm" />}>
                  <WhiteboardRecoveryPanel userId={user.id} />
                </Suspense>
              </Stack>
            ) : section === 'shortcuts' ? (
              <MarkdownShortcuts />
            ) : (
              <PreferencesPanel />
            )}
          </section>
        </div>
      </main>

      <Drawer
        opened={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        title="个人设置"
        size="min(100vw, 340px)"
        closeButtonProps={{ 'aria-label': '关闭设置导航' }}
      >
        <div className={styles.mobileDrawerContent}>
          {sectionButtons}
          <div className={styles.mobileDrawerBottom}>
            <Button
              variant="subtle"
              color="gray"
              className={shell.footerAction}
              leftSection={<ArrowLeft size={16} aria-hidden />}
              onClick={() => {
                setNavigationOpen(false);
                returnToWorkspace();
              }}
            >
              返回工作区
            </Button>
            <AccountMenu
              user={user}
              onAction={(action) => {
                setNavigationOpen(false);
                action();
              }}
            />
          </div>
        </div>
      </Drawer>

      <Modal
        opened={pendingSection !== null || blocker.status === 'blocked'}
        onClose={() => {
          if (busy) return;
          setPendingSection(null);
          if (blocker.status === 'blocked') blocker.reset();
        }}
        title={
          busy
            ? '正在保存'
            : securityDirty
              ? '放弃密码修改？'
              : '保存个人资料？'
        }
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          <Text size="sm">
            {busy
              ? '请等待本次保存完成。'
              : securityDirty
                ? '未保存的密码输入将丢失。'
                : '你有尚未保存的资料更改。放弃仅会丢弃未保存的部分；已保存的头像仍会保留。'}
          </Text>
          {!busy && (
            <Group justify="flex-end">
              <Button
                variant="default"
                disabled={busy}
                onClick={() => {
                  setPendingSection(null);
                  if (blocker.status === 'blocked') blocker.reset();
                }}
              >
                继续编辑
              </Button>
              <Button
                variant="subtle"
                disabled={busy}
                onClick={() => {
                  if (blocker.status === 'blocked') {
                    authorizedHash.current = '*';
                    blocker.proceed();
                  } else if (pendingSection) changeSection(pendingSection);
                  setPendingSection(null);
                  setNavigationOpen(false);
                }}
              >
                放弃更改
              </Button>
              {!securityDirty && (
                <Button
                  loading={busy}
                  onClick={async () => {
                    if (await profile.current?.save()) {
                      if (blocker.status === 'blocked') {
                        authorizedHash.current = '*';
                        blocker.proceed();
                      } else if (pendingSection) changeSection(pendingSection);
                      setPendingSection(null);
                      setNavigationOpen(false);
                    }
                  }}
                >
                  保存并继续
                </Button>
              )}
            </Group>
          )}
        </Stack>
      </Modal>
    </div>
  );
}
