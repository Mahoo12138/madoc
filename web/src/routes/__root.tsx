import type { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createRootRouteWithContext,
  useNavigate,
} from '@tanstack/react-router';
import { useEffect } from 'react';

import { useInfo, useSession } from '@/api/hooks';

export interface RouterContext {
  queryClient: QueryClient;
}

function RootComponent() {
  const navigate = useNavigate();
  const info = useInfo();
  const session = useSession();
  const path = window.location.pathname;

  const initialized = info.data?.initialized;
  const loggedIn = !!session.data?.user;

  useEffect(() => {
    // Wait for info query to settle
    if (info.isLoading) return;

    // Server not initialized → redirect to /setup
    if (initialized === false) {
      if (path !== '/setup') {
        navigate({ to: '/setup', replace: true });
      }
      return;
    }

    // Server initialized
    // Don't redirect if already on auth pages
    if (path === '/setup' || path === '/sign-in') {
      // If already initialized and logged in, go to home
      if (initialized && loggedIn) {
        navigate({ to: '/', replace: true });
      } else if (path === '/setup') {
        // Setup already done, go to sign-in
        navigate({ to: '/sign-in', replace: true });
      }
      return;
    }

    // On protected pages — require login
    if (!loggedIn) {
      navigate({ to: '/sign-in', replace: true });
    }
  }, [initialized, loggedIn, info.isLoading, path, navigate]);

  return <Outlet />;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});
