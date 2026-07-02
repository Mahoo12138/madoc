import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { useSession, useSignOut } from '@/api/hooks';
import {
  createMadocWorkspace,
  createNewDoc,
  getDocYjsUpdate,
  SyncClient,
} from '@madoc/doc';

import {
  avatar,
  backLink,
  docList,
  docCard,
  docTitle,
  docMeta,
  emptyIcon,
  emptySubtitle,
  emptyTitle,
  layout,
  loadingContainer,
  main,
  mainContent,
  mainHeader,
  mainHeaderTitle,
  navItem,
  navItemActive,
  navSectionLabel,
  newDocButton,
  sidebar,
  sidebarFooter,
  sidebarHeader,
  sidebarHeaderTitle,
  sidebarNav,
  userEmail,
  userInfo,
  userName,
} from './workspace.$workspaceId.css';

export const Route = createFileRoute('/workspace/$workspaceId')({
  component: WorkspacePage,
});

function WorkspacePage() {
  const navigate = useNavigate();
  const { workspaceId } = Route.useParams();
  const session = useSession();
  const signOut = useSignOut();
  const [activeTab, setActiveTab] = useState<'all' | 'trash' | 'settings'>('all');
  const [docTimestamps, setDocTimestamps] = useState<Record<string, number>>({});
  const [isCreating, setIsCreating] = useState(false);

  const syncClientRef = useRef<SyncClient | null>(null);
  const collectionRef = useRef<ReturnType<typeof createMadocWorkspace> | null>(null);

  const user = session.data?.user;

  useEffect(() => {
    const syncClient = new SyncClient();
    const collection = createMadocWorkspace(workspaceId);

    syncClientRef.current = syncClient;
    collectionRef.current = collection;

    let mounted = true;

    const init = async () => {
      try {
        await syncClient.connect();
        await syncClient.joinWorkspace(workspaceId);

        const timestamps = await syncClient.loadDocTimestamps(workspaceId);
        if (mounted) {
          setDocTimestamps(timestamps);
        }
      } catch (err) {
        console.error('[WorkspacePage] Failed to initialize:', err);
      }
    };

    init();

    return () => {
      mounted = false;
      syncClient.leaveWorkspace(workspaceId).catch(() => {});
      syncClient.disconnect();
    };
  }, [workspaceId]);

  if (session.isLoading || !user) {
    return <div className={loadingContainer}>Loading...</div>;
  }

  const handleSignOut = async () => {
    await signOut.mutateAsync();
    navigate({ to: '/sign-in', replace: true });
  };

  const handleCreateDoc = async () => {
    if (!collectionRef.current || !syncClientRef.current || isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      const docId = createNewDoc(collectionRef.current);
      const yjsUpdate = getDocYjsUpdate(collectionRef.current, docId);

      if (yjsUpdate) {
        await syncClientRef.current.pushDocUpdate(workspaceId, docId, yjsUpdate);
      }

      setDocTimestamps((prev) => ({
        ...prev,
        [docId]: Date.now(),
      }));

      navigate({
        to: '/workspace/$workspaceId/$docId',
        params: { workspaceId, docId },
      });
    } catch (err) {
      console.error('[WorkspacePage] Failed to create document:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const initials = user.name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tabs = [
    { id: 'all' as const, label: 'All Documents', icon: '📄' },
    { id: 'trash' as const, label: 'Trash', icon: '🗑' },
    { id: 'settings' as const, label: 'Settings', icon: '⚙' },
  ];

  const docIds = Object.keys(docTimestamps).sort(
    (a, b) => (docTimestamps[b] ?? 0) - (docTimestamps[a] ?? 0)
  );

  return (
    <div className={layout}>
      <div className={sidebar}>
        <div className={sidebarHeader}>
          <a
            href="/"
            className={backLink}
            onClick={(e) => {
              e.preventDefault();
              navigate({ to: '/', replace: true });
            }}
          >
            ←
          </a>
          <span className={sidebarHeaderTitle}>Workspace</span>
        </div>

        <div className={sidebarNav}>
          <div className={navSectionLabel}>Workspace</div>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`${navItem} ${activeTab === tab.id ? navItemActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={{ fontSize: '16px' }}>{tab.icon}</span>
              {tab.label}
            </div>
          ))}
        </div>

        <div className={sidebarFooter}>
          <div className={userInfo} onClick={handleSignOut} title="Sign out">
            <div className={avatar}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={userName}>{user.name}</div>
              <div className={userEmail}>{user.email}</div>
            </div>
          </div>
        </div>
      </div>

      <div className={main}>
        <div className={mainHeader}>
          <span className={mainHeaderTitle}>
            {tabs.find((t) => t.id === activeTab)?.label}
          </span>
          <span style={{ fontSize: '12px', color: '#999' }}>
            {workspaceId.slice(0, 8)}...
          </span>
        </div>

        <div className={mainContent}>
          {activeTab === 'all' && docIds.length === 0 && (
            <>
              <div className={emptyIcon}>
                <svg width="32" height="32" viewBox="0 0 20 20" fill="#1e96eb">
                  <path d="M17.5 3H15L12.5 10L10 3H7.5L5 10L2.5 3H0L5 17H7.5L10 10L12.5 17H15L17.5 3Z" fill="#1e96eb" />
                </svg>
              </div>
              <h2 className={emptyTitle}>No documents yet</h2>
              <p className={emptySubtitle}>
                Create your first document to start writing and collaborating.
              </p>
              <button
                className={newDocButton}
                onClick={handleCreateDoc}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'New Document'}
              </button>
            </>
          )}

          {activeTab === 'all' && docIds.length > 0 && (
            <div className={docList}>
              <button
                className={newDocButton}
                onClick={handleCreateDoc}
                disabled={isCreating}
                style={{ marginBottom: '16px' }}
              >
                {isCreating ? 'Creating...' : '+ New Document'}
              </button>
              {docIds.map((docId) => (
                <div
                  key={docId}
                  className={docCard}
                  onClick={() => {
                    navigate({
                      to: '/workspace/$workspaceId/$docId',
                      params: { workspaceId, docId },
                    });
                  }}
                >
                  <div className={docTitle}>
                    {docId.slice(0, 12)}...
                  </div>
                  <div className={docMeta}>
                    {docTimestamps[docId]
                      ? new Date(docTimestamps[docId]).toLocaleString()
                      : 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'trash' && (
            <>
              <div className={emptyIcon}>
                <span style={{ fontSize: '32px' }}>🗑</span>
              </div>
              <h2 className={emptyTitle}>Trash is empty</h2>
              <p className={emptySubtitle}>Deleted documents will appear here.</p>
            </>
          )}

          {activeTab === 'settings' && (
            <>
              <div className={emptyIcon}>
                <span style={{ fontSize: '32px' }}>⚙</span>
              </div>
              <h2 className={emptyTitle}>Workspace Settings</h2>
              <p className={emptySubtitle}>Workspace configuration will be available here.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
