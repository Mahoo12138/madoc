import { expect, test, type Page, type Route } from '@playwright/test';
import { accountHeaders } from './helpers/account';
import { openDocument } from './helpers/writing';

const BASE_URL = 'http://127.0.0.1:3100';
// `*` stops at `/`, so this matches the list (with its query string) only —
// `/api/admin/users/{id}` and `.../sessions` are routed separately.
const LIST_API = '**/api/admin/users*';
const detailApi = (id: string) => `**/api/admin/users/${id}`;
const sessionsApi = (id: string) => `**/api/admin/users/${id}/sessions`;

// The browser contract for user management: a refusal must not leak a single
// row, high-impact changes are never submitted before their consequence is
// spelled out, a rejected write keeps the admin's choice visible, and the one
// dangerous action that can be undone by the user themselves is never retried
// behind their back.

interface FixtureUser {
  id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
  disabled?: boolean;
  canCreateWorkspace?: boolean;
  revision?: number;
}

function toAdminUser(user: FixtureUser) {
  const isAdmin = user.isAdmin ?? false;
  const disabled = user.disabled ?? false;
  const canCreateWorkspace = user.canCreateWorkspace ?? false;
  return {
    id: user.id,
    avatarUrl: null,
    name: user.name,
    email: user.email,
    isAdmin,
    disabled,
    canCreateWorkspace,
    // 服务端按身份计算的最终能力：管理员恒为 true（且账号启用）。
    effectiveCanCreateWorkspace: !disabled && (isAdmin || canCreateWorkspace),
    signupSource: isAdmin ? 'setup' : 'workspace_invite',
    createdAt: '2026-10-09T00:00:00.000Z',
    revision: user.revision ?? 1,
  };
}

function toDetail(user: FixtureUser) {
  return {
    ...toAdminUser(user),
    stats: { memberWorkspaces: 2, ownedWorkspaces: 1, soleOwnerRisk: false },
  };
}

/** 列表与详情都走 mock：服务端合约已定，前端按合约实现，不依赖后端是否就绪。 */
async function mockAdminUsers(page: Page, users: FixtureUser[]) {
  await page.route(LIST_API, (route) =>
    route.fulfill({
      json: { users: users.map(toAdminUser), nextCursor: null },
    }),
  );
  for (const user of users) {
    await page.route(detailApi(user.id), (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: toDetail(user) });
    });
  }
}

async function openAdminUsers(page: Page) {
  await page.goto('/admin/users');
  await expect(page.getByRole('main', { name: '站点管理' })).toBeVisible();
}

/** 打开某个用户的详情抽屉。 */
async function openDrawer(page: Page, name: string) {
  await page.getByRole('button', { name: `管理 ${name}` }).click();
  const drawer = page.locator('.mantine-Drawer-content');
  await expect(drawer.getByText(name, { exact: true })).toBeVisible();
  return drawer;
}

const modal = (page: Page) => page.locator('.mantine-Modal-content');

test('the admin shell offers user management next to site settings', async ({
  page,
}) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await mockAdminUsers(page, [
    { id: session.user.id, name: session.user.name, email: session.user.email, isAdmin: true },
  ]);
  await openAdminUsers(page);

  const navigation = page.getByRole('navigation', { name: '站点管理导航' });
  await expect(
    navigation.getByRole('button', { name: '用户管理' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    navigation.getByRole('button', { name: '站点设置' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /站点管理\s*\/\s*用户管理/ }),
  ).toBeVisible();
  // The section navigation is real: it has to leave the page, not decorate it.
  await navigation.getByRole('button', { name: '站点设置' }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
});

test('the live admin API fills the list and the server rejects self-disable', async ({
  page,
}) => {
  // 不走 mock：这条盯的是真实链路（列表 → 详情 → PATCH），服务端是唯一裁判。
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await openAdminUsers(page);

  const me = page.getByRole('row').filter({ hasText: session.user.name });
  await expect(me).toBeVisible();
  await expect(me).toContainText('站点管理员');
  await expect(me).toContainText('启用中');
  await expect(me).toContainText('（你）');

  await openDrawer(page, session.user.name);
  await page.getByRole('button', { name: '禁用账号' }).click();
  await modal(page).getByRole('button', { name: '禁用账号' }).click();
  // 管理员不能禁用自己：这是服务端判定，前端只负责如实转述。
  await expect(
    page.getByText('不能禁用你自己的账号。', { exact: false }),
  ).toBeVisible();
});

test('the list renders the signed-in account with its state spelled out', async ({
  page,
}) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await mockAdminUsers(page, [
    {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      isAdmin: true,
    },
    { id: 'user-member', name: '协作者', email: 'member@example.test' },
  ]);
  await openAdminUsers(page);

  const me = page.getByRole('row').filter({ hasText: session.user.name });
  await expect(me).toBeVisible();
  // 状态与权限用文字承载，不只靠颜色。
  await expect(me).toContainText('站点管理员');
  await expect(me).toContainText('启用中');
  await expect(me).toContainText('（你）');

  const member = page.getByRole('row').filter({ hasText: '协作者' });
  await expect(member).toContainText('普通用户');
  await expect(member).toContainText('不能创建');

  await expect(page.getByText('第 1 页 · 本页 2 个账号')).toBeVisible();
  // 分页是游标式：没有 nextCursor 就不提供下一页，也不一次加载全部用户。
  await expect(
    page.getByRole('button', { name: '下一页' }),
  ).toBeDisabled();
});

test('disabling an account asks for confirmation before writing', async ({
  page,
}) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await mockAdminUsers(page, [
    { id: session.user.id, name: session.user.name, email: session.user.email, isAdmin: true },
    { id: 'user-member', name: '协作者', email: 'member@example.test' },
  ]);
  await openAdminUsers(page);

  let patches: { expectedRevision: number; changes: Record<string, boolean> }[] = [];
  await page.route(detailApi('user-member'), (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    patches.push(route.request().postDataJSON());
    return route.fulfill({ json: toAdminUser({ id: 'user-member', name: '协作者', email: 'member@example.test', disabled: true, revision: 2 }) });
  });

  await openDrawer(page, '协作者');
  await page.getByRole('button', { name: '禁用账号' }).click();
  const dialog = modal(page);
  await expect(dialog.getByText('确认禁用账号')).toBeVisible();
  // 高影响操作先说明具体影响，而不是只问「确定吗」。
  await expect(dialog).toContainText('将立即无法登录站点');
  await expect(dialog).toContainText('重新启用即可恢复访问');

  // Cancelling is a real escape hatch: nothing is written.
  await dialog.getByRole('button', { name: '取消' }).click();
  expect(patches).toHaveLength(0);

  await page.getByRole('button', { name: '禁用账号' }).click();
  await modal(page).getByRole('button', { name: '禁用账号' }).click();
  await expect(page.getByText('用户已更新', { exact: true })).toBeVisible();
  expect(patches).toHaveLength(1);
  expect(patches[0].changes).toEqual({ disabled: true });
  expect(typeof patches[0].expectedRevision).toBe('number');
});

test('revoking the last active admin is refused with the real consequence', async ({
  page,
}) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await mockAdminUsers(page, [
    { id: session.user.id, name: session.user.name, email: session.user.email, isAdmin: true },
  ]);
  await openAdminUsers(page);
  await page.route(detailApi(session.user.id), (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    return route.fulfill({
      status: 409,
      json: { error: { code: 'LAST_ACTIVE_ADMIN', message: 'last active admin' } },
    });
  });

  await openDrawer(page, session.user.name);
  await page.getByRole('button', { name: '撤销管理员身份' }).click();
  const dialog = modal(page);
  await expect(dialog.getByText('确认撤销管理员身份')).toBeVisible();
  await expect(dialog).toContainText('将失去站点管理入口');
  await dialog.getByRole('button', { name: '撤销管理员身份' }).click();

  await expect(
    dialog.getByText('此操作会让站点没有可用的管理员。', { exact: false }),
  ).toBeVisible();
  // 409 不自动覆盖、不自动重试：弹窗留在原处，由管理员决定下一步。
  await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible();
});

test('an admin cannot disable their own account', async ({ page }) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await mockAdminUsers(page, [
    { id: session.user.id, name: session.user.name, email: session.user.email, isAdmin: true },
    { id: 'user-other', name: '另一位管理员', email: 'second@example.test', isAdmin: true },
  ]);
  await openAdminUsers(page);
  await page.route(detailApi(session.user.id), (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    return route.fulfill({
      status: 403,
      json: { error: { code: 'SELF_DISABLE_FORBIDDEN', message: 'cannot disable self' } },
    });
  });

  await openDrawer(page, session.user.name);
  await page.getByRole('button', { name: '禁用账号' }).click();
  const dialog = modal(page);
  await expect(dialog).toContainText('这是你自己的账号');
  await dialog.getByRole('button', { name: '禁用账号' }).click();
  await expect(
    dialog.getByText('不能禁用你自己的账号。', { exact: false }),
  ).toBeVisible();
});

test('a revision conflict shows the server value without overwriting it', async ({
  page,
}) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await mockAdminUsers(page, [
    { id: session.user.id, name: session.user.name, email: session.user.email, isAdmin: true },
    { id: 'user-member', name: '协作者', email: 'member@example.test' },
  ]);
  await openAdminUsers(page);
  let patches = 0;
  await page.route(detailApi('user-member'), (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    patches++;
    return route.fulfill({
      status: 409,
      json: { error: { code: 'REVISION_CONFLICT', message: 'revision mismatch' } },
    });
  });

  await openDrawer(page, '协作者');
  const toggle = page.getByRole('switch', { name: '普通用户创建授权' });
  // 键盘操作：Mantine 的装饰性 track 覆盖在 input 之上，点不动；键盘可达性是硬约束。
  await toggle.press('Space');
  const alert = page.locator('.mantine-Drawer-content').getByRole('alert');
  await expect(alert).toContainText('该账号已被其他管理员修改');
  await expect(alert).toContainText(/服务端当前值：/);
  // 失败保留待选值，并明确标注它还没有生效。
  await expect(toggle).toBeChecked();
  await expect(
    page.locator('.mantine-Drawer-content').getByText('尚未生效', { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(patches).toBe(1);
});

test('revoking sessions is confirmed, explained and never retried', async ({
  page,
}) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await mockAdminUsers(page, [
    { id: session.user.id, name: session.user.name, email: session.user.email, isAdmin: true },
    { id: 'user-member', name: '协作者', email: 'member@example.test' },
  ]);
  await openAdminUsers(page);
  let deletes = 0;
  await page.route(sessionsApi('user-member'), (route: Route) => {
    deletes++;
    return route.fulfill({
      status: 500,
      json: { error: { code: 'INTERNAL', message: 'boom' } },
    });
  });

  await openDrawer(page, '协作者');
  await page.getByRole('button', { name: '撤销全部会话' }).click();
  const dialog = modal(page);
  await expect(dialog.getByText('确认撤销全部会话')).toBeVisible();
  // 危险操作必须说清「不等于禁止登录」，避免被当成封禁使用。
  await expect(dialog).toContainText('这不等于禁止登录');
  await expect(dialog).toContainText('可以凭有效凭据重新登录');
  await dialog.getByRole('button', { name: '撤销会话' }).click();

  await expect(
    dialog.getByText('会话未能撤销，请检查网络后重试。', { exact: false }),
  ).toBeVisible();
  // §6.4：危险动作失败不得自动重试，否则稍后会误撤销用户新建立的会话。
  await page.waitForTimeout(1000);
  expect(deletes).toBe(1);
});

test('a narrow screen shows information rows instead of a table', async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await mockAdminUsers(page, [
    { id: session.user.id, name: session.user.name, email: session.user.email, isAdmin: true },
    { id: 'user-member', name: '协作者', email: 'member@example.test' },
  ]);
  await openAdminUsers(page);
  // 表格让位给一栏一值的信息行，窄屏不产生横向滚动。
  await expect(page.getByRole('table')).toHaveCount(0);
  const card = page.getByRole('group', { name: '用户：协作者' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('普通用户');
  await expect(card).toContainText('启用中');
  await expect(card).toContainText('不能创建');
  await card.getByRole('button', { name: '管理 协作者' }).click();
  await expect(page.locator('.mantine-Drawer-content')).toContainText('协作者');
});

test('a server refusal hides every row even with a stale admin session', async ({
  page,
}) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  // 管理员身份可能在会话有效期内被撤销：服务端说没有权限时，页面必须立刻停止展示数据。
  await page.route(LIST_API, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: 'ADMIN_REQUIRED', message: 'admin required' } },
    }),
  );
  await openAdminUsers(page);
  await expect(page.getByText('没有站点管理权限')).toBeVisible();
  // 自己的账号信息仍在账号菜单里（那是本人的数据）；被保护的是用户列表里的行。
  await expect(page.getByText('member@example.test')).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^管理 / })).toHaveCount(0);
  // 重试改变不了授权结果，所以它不作为出口提供。
  await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0);
});

test('a non-admin sees a plain refusal and no user data', async ({
  page,
  browser,
}) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, BASE_URL);
  const invitation = await (
    await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
      headers,
      data: { email: `outsider-${Date.now()}@example.test`, role: 'editor' },
    })
  ).json();

  const memberContext = await browser.newContext();
  try {
    const accepted = await memberContext.request.post(
      `${BASE_URL}/api/invites/${invitation.token}/accept`,
      { data: { name: 'Outside Member', password: 'password123' } },
    );
    expect(accepted.ok()).toBeTruthy();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`${BASE_URL}/admin/users`);
    await expect(memberPage.getByText('没有站点管理权限')).toBeVisible();
    await expect(
      memberPage.getByText('此页面仅站点管理员可访问。'),
    ).toBeVisible();
    // 连管理外壳都不渲染：非管理员不该看到管理导航。
    await expect(
      memberPage.getByRole('navigation', { name: '站点管理导航' }),
    ).toHaveCount(0);
    // A refusal must not leak the shape or the values of what is protected.
    await expect(
      memberPage.getByText(session.user.email, { exact: true }),
    ).toHaveCount(0);
    await expect(memberPage.getByText('协作者', { exact: true })).toHaveCount(0);
    await expect(memberPage.getByRole('table')).toHaveCount(0);
    await expect(
      memberPage.getByRole('button', { name: /^管理 / }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole('switch', { name: '普通用户创建授权' }),
    ).toHaveCount(0);
    // Retrying cannot change an authorization decision, so it is not offered.
    await expect(memberPage.getByRole('button', { name: '重试' })).toHaveCount(0);
  } finally {
    await memberContext.close();
  }
});
