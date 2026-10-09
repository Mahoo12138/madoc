import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
} from '@tanstack/react-router';
import {
  InvitePage,
  SetupPage,
  SignInPage,
  StartPage,
} from '@/features/auth/pages';
import { WorkspaceListPage } from '@/features/workspaces/workspace-list-page';
import { WorkspacePage } from '@/features/workspaces/workspace-page';
const AccountSettingsPage = lazyRouteComponent(
  () => import('@/features/account/account-settings-page'),
  'AccountSettingsPage',
);
const WorkspaceManagementPage = lazyRouteComponent(
  () => import('@/features/workspaces/workspace-management-page'),
  'WorkspaceManagementPage',
);
const PublicSharePage = lazyRouteComponent(
  () => import('@/features/sharing/public-share-page'),
  'PublicSharePage',
);
const AdminSettingsPage = lazyRouteComponent(
  () => import('@/features/admin/admin-settings-page'),
  'AdminSettingsPage',
);

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const startRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: StartPage,
});
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupPage,
});
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
});
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  component: InvitePage,
});
const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces',
  component: WorkspaceListPage,
});
const accountSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: AccountSettingsPage,
});
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace/$workspaceId',
  component: WorkspacePage,
});
const workspaceManagementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace/$workspaceId/manage',
  component: WorkspaceManagementPage,
});
const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace/$workspaceId/$itemId',
  component: WorkspacePage,
});
const publicShareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/s/$token',
  component: PublicSharePage,
});

// `/admin` has no page of its own while the only child is settings: send it
// straight to the one route that can render, without leaving a dead entry.
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: () => <Navigate to="/admin/settings" replace />,
});
const adminSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/settings',
  component: AdminSettingsPage,
});

const routeTree = rootRoute.addChildren([
  startRoute,
  setupRoute,
  signInRoute,
  inviteRoute,
  workspacesRoute,
  accountSettingsRoute,
  workspaceRoute,
  workspaceManagementRoute,
  itemRoute,
  publicShareRoute,
  adminRoute,
  adminSettingsRoute,
]);
export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
