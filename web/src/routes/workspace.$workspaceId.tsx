import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { useSession, useSignOut } from '@/api/hooks';

import {
  avatar,
  backLink,
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

  const user = session.data?.user;

  if (session.isLoading || !user) {
    return <div className={loadingContainer}>Loading...</div>;
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

  const tabs = [
    { id: 'all' as const, label: 'All Documents', icon: '📄' },
    { id: 'trash' as const, label: 'Trash', icon: '🗑' },
    { id: 'settings' as const, label: 'Settings', icon: '⚙' },
  ];

  return (
    <div className={layout}>
      {/* Sidebar */}
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

      {/* Main area */}
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
          <div className={emptyIcon}>
            <svg width="32" height="32" viewBox="0 0 20 20" fill="#1e96eb">
              <path d="M17.5 3H15L12.5 10L10 3H7.5L5 10L2.5 3H0L5 17H7.5L10 10L12.5 17H15L17.5 3Z" fill="#1e96eb" />
            </svg>
          </div>
          <h2 className={emptyTitle}>
            {activeTab === 'all' && 'No documents yet'}
            {activeTab === 'trash' && 'Trash is empty'}
            {activeTab === 'settings' && 'Workspace Settings'}
          </h2>
          <p className={emptySubtitle}>
            {activeTab === 'all' &&
              'Create your first document to start writing and collaborating.'}
            {activeTab === 'trash' &&
              'Deleted documents will appear here.'}
            {activeTab === 'settings' &&
              'Workspace configuration will be available here.'}
          </p>
          {activeTab === 'all' && (
            <button
              style={{
                height: '40px',
                padding: '0 20px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: '#1e96eb',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => {
                // TODO: create document
              }}
            >
              New Document
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
