import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { InvitePage, SetupPage, SignInPage, StartPage } from '@/features/auth/pages';
import { WorkspaceListPage } from '@/features/workspaces/workspace-list-page';
import { WorkspacePage } from '@/features/workspaces/workspace-page';

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const startRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: StartPage });
const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/setup', component: SetupPage });
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: SignInPage });
const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/invite/$token', component: InvitePage });
const workspacesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/workspaces', component: WorkspaceListPage });
const workspaceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/workspace/$workspaceId', component: WorkspacePage });
const itemRoute = createRoute({ getParentRoute: () => rootRoute, path: '/workspace/$workspaceId/$itemId', component: WorkspacePage });

const routeTree = rootRoute.addChildren([startRoute, setupRoute, signInRoute, inviteRoute, workspacesRoute, workspaceRoute, itemRoute]);
export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
