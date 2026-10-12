import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
} from '@tanstack/react-router';
import {
  EnrollPage,
  InvitePage,
  SetupPage,
  SignInPage,
  StartPage,
} from '@/features/auth/pages';
import {
  SignUpCompletePage,
  SignUpRequestPage,
} from '@/features/auth/sign-up-pages';
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
const AdminUsersPage = lazyRouteComponent(
  () => import('@/features/admin/admin-users-page'),
  'AdminUsersPage',
);
const AdminAuditPage = lazyRouteComponent(
  () => import('@/features/admin/admin-audit-page'),
  'AdminAuditPage',
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
// 激活链接直达，不出现在任何导航里：它没有入口，只有这一条 URL（§11.3）。
const enrollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/enroll/$token',
  component: EnrollPage,
});
// 公开注册（§11.2）：申请页有入口（登录页在可用时才给），完成页同样只由邮件
// 链接直达。两条路由都在被关闭时给出明确状态，不依赖登录页藏入口。
const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up',
  component: SignUpRequestPage,
});
const signUpCompleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up/$token',
  component: SignUpCompletePage,
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
  component: () => <Navigate to="/admin/users" replace />,
});
const adminSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/settings',
  component: AdminSettingsPage,
});
const adminUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/users',
  component: AdminUsersPage,
});
const adminAuditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/audit',
  component: AdminAuditPage,
});

const routeTree = rootRoute.addChildren([
  startRoute,
  setupRoute,
  signInRoute,
  inviteRoute,
  enrollRoute,
  signUpRoute,
  signUpCompleteRoute,
  workspacesRoute,
  accountSettingsRoute,
  workspaceRoute,
  workspaceManagementRoute,
  itemRoute,
  publicShareRoute,
  adminRoute,
  adminSettingsRoute,
  adminUsersRoute,
  adminAuditRoute,
]);
export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
