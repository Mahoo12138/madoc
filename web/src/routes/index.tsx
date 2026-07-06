import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  DoneIcon,
  LocalWorkspaceIcon,
  Logo1Icon,
  PlusIcon,
} from '@blocksuite/icons/rc';
import { useEffect, useRef, useState } from 'react';

import {
  useCreateWorkspace,
  useSession,
  useSignOut,
  useWorkspaces,
} from '@/api/hooks';

import {
  accountAvatar,
  accountEmail,
  accountInfo,
  accountName,
  accountRow,
  container,
  footerButton,
  footerButtonDanger,
  footerButtonIcon,
  loadingText,
  navigatorBody,
  navigatorFooter,
  navigatorFrame,
  navigatorHeader,
  navigatorPanel,
  openingMark,
  openingSubtitle,
  openingTitle,
  workspaceAvatar,
  workspaceCard,
  workspaceCardActive,
  workspaceCheck,
  workspaceMeta,
  workspaceName,
  workspaceState,
  workspaceStateIcon,
  workspaceTitleGroup,
} from './index.css';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const session = useSession();
  const user = session.data?.user;
  const workspaces = useWorkspaces(Boolean(user));
  const createWorkspace = useCreateWorkspace();
  const signOut = useSignOut();
  const createOnceRef = useRef(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const wsList = workspaces.data ?? [];
  const lastWorkspaceId = localStorage.getItem('last_workspace_id');

  useEffect(() => {
    if (session.isLoading) {
      return;
    }

    if (!user) {
      navigate({ to: '/sign-in', replace: true });
    }
  }, [navigate, session.isLoading, user]);

  useEffect(() => {
    if (session.isLoading || !user || workspaces.isLoading || createError) {
      return;
    }

    if (wsList.length > 0) {
      const workspace =
        wsList.find((item) => item.id === lastWorkspaceId) ?? wsList[0];

      navigate({
        to: '/workspace/$workspaceId',
        params: { workspaceId: workspace.id },
        replace: true,
      });
      return;
    }

    if (createOnceRef.current) {
      return;
    }

    createOnceRef.current = true;
    createWorkspace
      .mutateAsync()
      .then((workspace) => {
        localStorage.setItem('last_workspace_id', workspace.id);
        navigate({
          to: '/workspace/$workspaceId',
          params: { workspaceId: workspace.id },
          replace: true,
        });
      })
      .catch((error: unknown) => {
        createOnceRef.current = false;
        setCreateError(
          error instanceof Error ? error.message : 'Failed to create workspace'
        );
      });
  }, [
    createError,
    createWorkspace,
    navigate,
    session.isLoading,
    user,
    workspaces.isLoading,
    wsList,
    lastWorkspaceId,
  ]);

  if (session.isLoading || !user) {
    return <div className={loadingText}>Loading...</div>;
  }

  const handleSignOut = async () => {
    await signOut.mutateAsync();
    navigate({ to: '/sign-in', replace: true });
  };

  const handleCreateWorkspace = async () => {
    if (createWorkspace.isPending) {
      return;
    }

    createOnceRef.current = false;
    setCreateError(null);
    try {
      createOnceRef.current = true;
      const workspace = await createWorkspace.mutateAsync();
      localStorage.setItem('last_workspace_id', workspace.id);
      navigate({
        to: '/workspace/$workspaceId',
        params: { workspaceId: workspace.id },
        replace: true,
      });
    } catch (error) {
      createOnceRef.current = false;
      setCreateError(
        error instanceof Error ? error.message : 'Failed to create workspace'
      );
    }
  };

  const openWorkspace = (workspaceId: string) => {
    localStorage.setItem('last_workspace_id', workspaceId);
    navigate({
      to: '/workspace/$workspaceId',
      params: { workspaceId },
      replace: true,
    });
  };

  const initials = user.name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={container}>
      <main className={navigatorFrame}>
        <section className={navigatorPanel} aria-label="Workspace navigator">
          <div className={navigatorHeader}>
            <div className={accountRow}>
              <div className={accountAvatar}>{initials}</div>
              <div className={accountInfo}>
                <div className={accountName}>{user.name}</div>
                <div className={accountEmail}>{user.email}</div>
              </div>
            </div>
          </div>

          <div className={navigatorBody}>
            {wsList.length > 0 ? (
              wsList.map((workspace) => {
                const active = workspace.id === lastWorkspaceId;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    className={`${workspaceCard} ${
                      active ? workspaceCardActive : ''
                    }`}
                    onClick={() => openWorkspace(workspace.id)}
                  >
                    <span className={workspaceAvatar}>
                      <LocalWorkspaceIcon />
                    </span>
                    <span className={workspaceTitleGroup}>
                      <span className={workspaceName}>
                        {workspace.name ?? 'Untitled workspace'}
                      </span>
                      <span className={workspaceMeta}>
                        {workspace.memberCount} member
                        {workspace.memberCount === 1 ? '' : 's'}
                      </span>
                    </span>
                    {active ? (
                      <span className={workspaceCheck}>
                        <DoneIcon />
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className={workspaceState}>
                <div className={workspaceStateIcon}>
                  {createError ? <LocalWorkspaceIcon /> : <Logo1Icon />}
                </div>
                <h1 className={openingTitle}>
                  {createError ? 'Unable to open workspace' : 'Opening workspace'}
                </h1>
                <p className={openingSubtitle}>
                  {createError ??
                    'Preparing a self-hosted workspace for this account.'}
                </p>
              </div>
            )}
          </div>

          <div className={navigatorFooter}>
            <button
              type="button"
              className={footerButton}
              onClick={handleCreateWorkspace}
              disabled={createWorkspace.isPending}
            >
              <span className={footerButtonIcon}>
                <PlusIcon />
              </span>
              {createWorkspace.isPending ? 'Creating...' : 'New workspace'}
            </button>
            <button
              type="button"
              className={`${footerButton} ${footerButtonDanger}`}
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
