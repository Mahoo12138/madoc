import { useNavigate } from '@tanstack/react-router';
import {
  ArrowDownSmallIcon,
  DoneIcon,
  LocalWorkspaceIcon,
  PlusIcon,
} from '@blocksuite/icons/rc';
import { useEffect, useRef, useState } from 'react';

import {
  useCreateWorkspace,
  useSignOut,
  useWorkspaces,
} from '@/api/hooks';
import type { User } from '@/api/types';

import * as classes from './workspace-switcher.css';

interface WorkspaceSwitcherProps {
  currentWorkspaceId: string;
  user?: User | null;
  initials: string;
  fallbackName?: string;
}

export function WorkspaceSwitcher({
  currentWorkspaceId,
  user,
  initials,
  fallbackName = 'Workspace',
}: WorkspaceSwitcherProps) {
  const navigate = useNavigate();
  const createWorkspace = useCreateWorkspace();
  const signOut = useSignOut();
  const workspaces = useWorkspaces(Boolean(user));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const workspaceList = workspaces.data ?? [];
  const currentWorkspace = workspaceList.find(
    (workspace) => workspace.id === currentWorkspaceId
  );
  const currentName = currentWorkspace?.name ?? fallbackName;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openWorkspace = (workspaceId: string) => {
    setOpen(false);
    localStorage.setItem('last_workspace_id', workspaceId);
    navigate({
      to: '/workspace/$workspaceId',
      params: { workspaceId },
      replace: true,
    });
  };

  const handleCreateWorkspace = async () => {
    if (createWorkspace.isPending) {
      return;
    }

    const workspace = await createWorkspace.mutateAsync();
    localStorage.setItem('last_workspace_id', workspace.id);
    setOpen(false);
    navigate({
      to: '/workspace/$workspaceId',
      params: { workspaceId: workspace.id },
      replace: true,
    });
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut.mutateAsync();
    navigate({ to: '/sign-in', replace: true });
  };

  return (
    <div className={classes.root} ref={rootRef}>
      <button
        type="button"
        className={classes.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className={classes.avatar}>
          <LocalWorkspaceIcon />
        </span>
        <span className={classes.triggerText}>
          <span className={classes.triggerTitle}>{currentName}</span>
          <span className={classes.triggerMeta}>
            {currentWorkspaceId.slice(0, 8)}
          </span>
        </span>
        <span className={classes.chevron}>
          <ArrowDownSmallIcon />
        </span>
      </button>

      {open ? (
        <div className={classes.popover} role="menu">
          <div className={classes.account}>
            <div className={classes.accountAvatar}>{initials}</div>
            <div className={classes.accountText}>
              <div className={classes.accountName}>
                {user?.name ?? 'Current user'}
              </div>
              <div className={classes.accountEmail}>
                {user?.email ?? 'Signed in'}
              </div>
            </div>
          </div>

          <div className={classes.list}>
            {workspaceList.length > 0 ? (
              workspaceList.map((workspace) => {
                const active = workspace.id === currentWorkspaceId;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    className={`${classes.item} ${
                      active ? classes.itemActive : ''
                    }`}
                    onClick={() => openWorkspace(workspace.id)}
                    role="menuitem"
                  >
                    <span className={classes.avatar}>
                      <LocalWorkspaceIcon />
                    </span>
                    <span className={classes.itemText}>
                      <span className={classes.itemTitle}>
                        {workspace.name ?? 'Untitled workspace'}
                      </span>
                      <span className={classes.itemMeta}>
                        {workspace.memberCount} member
                        {workspace.memberCount === 1 ? '' : 's'}
                      </span>
                    </span>
                    {active ? (
                      <span className={classes.activeIcon}>
                        <DoneIcon />
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className={classes.empty}>No workspaces available.</div>
            )}
          </div>

          <div className={classes.footer}>
            <button
              type="button"
              className={classes.action}
              onClick={handleCreateWorkspace}
              disabled={createWorkspace.isPending}
              role="menuitem"
            >
              <span className={classes.actionIcon}>
                <PlusIcon />
              </span>
              {createWorkspace.isPending ? 'Creating...' : 'New workspace'}
            </button>
            <button
              type="button"
              className={`${classes.action} ${classes.dangerAction}`}
              onClick={handleSignOut}
              role="menuitem"
            >
              Sign Out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
