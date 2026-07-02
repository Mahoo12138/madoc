import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { useSession, useSignOut } from '@/api/hooks';
import { Button } from '@/components/button';

import {
  container,
  content,
  createButton,
  loadingContainer,
  nav,
  navAvatar,
  navLeft,
  navRight,
  welcomeCard,
  welcomeSubtitle,
  welcomeTitle,
} from './index.css';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const session = useSession();
  const signOut = useSignOut();
  const [menuOpen, setMenuOpen] = useState(false);

  const user = session.data?.user;

  // Show loading while session is being fetched
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
            style={{ position: 'relative' }}
          >
            {initials}
            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '40px',
                  right: 0,
                  backgroundColor: '#fff',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  padding: '4px 0',
                  zIndex: 100,
                  minWidth: '160px',
                }}
              >
                <div
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    color: '#777',
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  {user.email}
                </div>
                <button
                  onClick={handleSignOut}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 16px',
                    fontSize: '13px',
                    color: '#e68080',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={content}>
        <div className={welcomeCard}>
          <MadocLogoLarge />
          <h1 className={welcomeTitle}>
            Welcome to madoc, {user.name}
          </h1>
          <p className={welcomeSubtitle}>
            Create your first workspace to start collaborating on documents and whiteboards.
          </p>
          <div className={createButton}>
            <Button
              size="extraLarge"
              onClick={() => {
                // TODO: workspace creation
              }}
            >
              Create Workspace
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MadocLogo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.5 3H15L12.5 10L10 3H7.5L5 10L2.5 3H0L5 17H7.5L10 10L12.5 17H15L17.5 3Z" fill="currentColor" />
    </svg>
  );
}

function MadocLogoLarge() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 20 20"
      fill="#1e96eb"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.5 3H15L12.5 10L10 3H7.5L5 10L2.5 3H0L5 17H7.5L10 10L12.5 17H15L17.5 3Z" fill="#1e96eb" />
    </svg>
  );
}
