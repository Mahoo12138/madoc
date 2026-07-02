import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { useCreateWorkspace, useSession, useSignOut, useUpdateWorkspace, useWorkspaces } from '@/api/hooks';
import { Button } from '@/components/button';

import {
  buttonGhost,
  container,
  content,
  contentHeader,
  contentInner,
  contentTitle,
  dropdown,
  dropdownEmail,
  dropdownSignOut,
  emptyState,
  emptySubtitle,
  emptyTitle,
  loadingText,
  modal,
  modalActions,
  modalInput,
  modalOverlay,
  modalTitle,
  nav,
  navAvatar,
  navLeft,
  navRight,
  workspaceCard,
  workspaceIcon,
  workspaceInfo,
  workspaceList,
  workspaceMeta,
  workspaceName,
} from './index.css';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const session = useSession();
  const workspaces = useWorkspaces();
  const signOut = useSignOut();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const user = session.data?.user;

  if (session.isLoading || !user) {
    return <div className={loadingText}>Loading...</div>;
  }

  const handleSignOut = async () => {
    await signOut.mutateAsync();
    navigate({ to: '/sign-in', replace: true });
  };

  const initials = user.name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const wsList = workspaces.data ?? [];
  const isLoading = workspaces.isLoading;

  return (
    <div className={container}>
      <div className={nav}>
        <div className={navLeft}>
          <MadocLogo />
          madoc
        </div>
        <div className={navRight}>
          <div
            className={navAvatar}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {initials}
            {menuOpen && (
              <div className={dropdown}>
                <div className={dropdownEmail}>{user.email}</div>
                <button className={dropdownSignOut} onClick={handleSignOut}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={content}>
        <div className={contentInner}>
          <div className={contentHeader}>
            <h1 className={contentTitle}>Workspaces</h1>
            <Button size="extraLarge" onClick={() => setShowCreate(true)}>
              New Workspace
            </Button>
          </div>

          {isLoading ? (
            <div className={loadingText}>Loading workspaces...</div>
          ) : wsList.length === 0 ? (
            <div className={emptyState}>
              <MadocLogoLarge />
              <h2 className={emptyTitle}>No workspaces yet</h2>
              <p className={emptySubtitle}>
                Create your first workspace to start collaborating on documents and whiteboards.
              </p>
            </div>
          ) : (
            <div className={workspaceList}>
              {wsList.map((ws) => (
                <div
                  key={ws.id}
                  className={workspaceCard}
                  onClick={() => navigate({ to: '/workspace/$workspaceId', params: { workspaceId: ws.id } })}
                >
                  <div className={workspaceIcon}>
                    {(ws.name ?? 'U')[0].toUpperCase()}
                  </div>
                  <div className={workspaceInfo}>
                    <div className={workspaceName}>{ws.name ?? 'Untitled'}</div>
                    <div className={workspaceMeta}>
                      {ws.role} · {ws.memberCount} member{ws.memberCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function CreateWorkspaceModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const [name, setName] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;

    try {
      const result = await createWorkspace.mutateAsync();
      // Update workspace name after creation
      await updateWorkspace.mutateAsync({
        id: result.id,
        name: name.trim(),
      });
      onClose();
    } catch {
      // error shown via mutation state
    }
  };

  return (
    <div className={modalOverlay} onClick={onClose}>
      <div className={modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={modalTitle}>Create Workspace</h2>
        <input
          className={modalInput}
          placeholder="Workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') onClose();
          }}
        />
        {createWorkspace.isError && (
          <p style={{ color: '#e68080', fontSize: '12px', marginTop: '8px' }}>
            {(createWorkspace.error as Error)?.message ?? 'Failed to create workspace'}
          </p>
        )}
        <div className={modalActions}>
          <button className={buttonGhost} onClick={onClose}>
            Cancel
          </button>
          <Button
            onClick={handleCreate}
            loading={createWorkspace.isPending || updateWorkspace.isPending}
            disabled={!name.trim()}
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

function MadocLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
      <path d="M17.5 3H15L12.5 10L10 3H7.5L5 10L2.5 3H0L5 17H7.5L10 10L12.5 17H15L17.5 3Z" fill="currentColor" />
    </svg>
  );
}

function MadocLogoLarge() {
  return (
    <svg width="48" height="48" viewBox="0 0 20 20" fill="#1e96eb">
      <path d="M17.5 3H15L12.5 10L10 3H7.5L5 10L2.5 3H0L5 17H7.5L10 10L12.5 17H15L17.5 3Z" fill="#1e96eb" />
    </svg>
  );
}
