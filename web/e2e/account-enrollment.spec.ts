import { expect, test, type Browser, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';

const BASE_URL = 'http://127.0.0.1:3100';
// One path, two methods: GET is the list, POST is the only place the raw token
// ever appears. DELETE adds an id segment, so it is routed separately.
const ENROLLMENTS_API = '**/api/admin/account-enrollments';
const ENROLLMENT_API = '**/api/admin/account-enrollments/*';
const COMPLETE_API = '**/api/auth/account-enrollments/complete';

// Two contracts are under test here. Admin-side: an enrollment is a grant, not
// an account, its link exists exactly once, revoking it is a deliberate act,
// and the section says out loud that this path ignores the registration mode.
// Recipient-side: the page asks for a name and a password, never explains why a
// token stopped working, and never quotes the server's internal errors.

interface FixtureEnrollment {
  id: string;
  email: string;
  status?: string;
  expiresAt?: string;
  createdAt?: string;
  consumedAt?: string | null;
  canCreateWorkspace?: boolean;
}

function toEnrollment(fixture: FixtureEnrollment) {
  return {
    id: fixture.id,
    kind: 'admin_created',
    email: fixture.email,
    status: fixture.status ?? 'pending',
    expiresAt: fixture.expiresAt ?? '2026-12-31T08:00:00.000Z',
    createdAt: fixture.createdAt ?? '2026-10-11T02:00:00.000Z',
    consumedAt: fixture.consumedAt ?? null,
    createdBy: 'admin-1',
    canCreateWorkspace: fixture.canCreateWorkspace ?? false,
  };
}

/** 列表 GET：创建与撤销后必须重新读取，服务端才是唯一的已确认状态。 */
async function mockList(
  page: Page,
  read: () => FixtureEnrollment[],
  options: { onRead?: () => void } = {},
) {
  await page.route(ENROLLMENTS_API, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    options.onRead?.();
    return route.fulfill({ json: { enrollments: read().map(toEnrollment) } });
  });
}

async function openAdminUsers(page: Page) {
  await page.goto('/admin/users');
  await expect(page.getByRole('main', { name: '站点管理' })).toBeVisible();
}

function enrollmentSection(page: Page) {
  return page.getByRole('main', { name: '站点管理' }).getByRole('heading', { name: '待激活的账号' });
}

// ── 管理员侧：待激活区块 ────────────────────────────────────────────────────

test('the enrollment section explains itself when it is empty', async ({ page }) => {
  await openDocument(page);
  await mockList(page, () => []);
  await openAdminUsers(page);

  const heading = enrollmentSection(page);
  await expect(heading).toBeVisible();
  // 空态要说清这个区块是干什么的，而不是留一块白板。
  await expect(
    page.getByText('还没有待激活的账号', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('等待对方设置密码的账号', { exact: false }),
  ).toBeVisible();
  // 两条边界常驻在此：这条路径绕过注册模式，注册模式也不会替你撤销链接。
  await expect(
    page.getByText('管理员显式建号不受注册模式限制', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('要停用某一条，必须在此显式撤销', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('共 0 条待激活记录', { exact: true })).toBeVisible();
  // The entry is real even while empty.
  await expect(
    page.getByRole('button', { name: '新建待激活账号' }),
  ).toBeVisible();
});

test('every row states status, expiry and the grant the admin chose', async ({
  page,
}) => {
  await openDocument(page);
  await mockList(page, () => [
    { id: 'enroll-pending', email: 'pending@example.test', canCreateWorkspace: true },
    {
      id: 'enroll-done',
      email: 'done@example.test',
      status: 'consumed',
      consumedAt: '2026-10-11T05:00:00.000Z',
      canCreateWorkspace: false,
    },
  ]);
  await openAdminUsers(page);

  const pending = page.getByRole('group', { name: '待激活账号：pending@example.test' });
  await expect(pending).toContainText('待激活');
  // This is the admin's explicit choice at creation time, not the site default.
  await expect(pending).toContainText('可以创建工作区');
  await expect(pending).toContainText('到期时间');
  await expect(pending.getByRole('button', { name: '撤销' })).toBeVisible();

  const done = page.getByRole('group', { name: '待激活账号：done@example.test' });
  await expect(done).toContainText('已完成');
  await expect(done).toContainText('不能创建工作区');
  // 已完成没有东西可撤销：给一个必然失败的按钮等于误导。
  await expect(done.getByRole('button', { name: '撤销' })).toHaveCount(0);
});

test('an elapsed expiry is spelled out instead of pretending the link works', async ({
  page,
}) => {
  await openDocument(page);
  const hour = 60 * 60 * 1000;
  await mockList(page, () => [
    {
      id: 'enroll-fresh',
      email: 'fresh@example.test',
      expiresAt: new Date(Date.now() + hour).toISOString(),
    },
    {
      id: 'enroll-lapsed',
      email: 'lapsed@example.test',
      // 服务端不写回 expired 状态：过期每次使用时按 expiresAt 判定，不落库。
      // 界面必须自己按到期时间说出来，否则这条链接会一直显示「待激活」。
      expiresAt: new Date(Date.now() - hour).toISOString(),
    },
  ]);
  await openAdminUsers(page);

  const fresh = page.getByRole('group', { name: '待激活账号：fresh@example.test' });
  await expect(fresh).toContainText('待激活');
  await expect(fresh).toContainText('链接仍然有效');

  const lapsed = page.getByRole('group', { name: '待激活账号：lapsed@example.test' });
  await expect(lapsed).toContainText('已过期');
  await expect(lapsed).toContainText('原链接不再可用');
  await expect(lapsed).not.toContainText('待激活');
  // 过期只是展示状态，记录仍未被消费：撤销仍是收掉它的唯一显式动作。
  await expect(lapsed.getByRole('button', { name: '撤销' })).toBeVisible();
});

test('creating an enrollment shows the link once and refetches the list', async ({
  page,
}) => {
  await openDocument(page);
  const records: FixtureEnrollment[] = [];
  let reads = 0;
  await mockList(page, () => records, { onRead: () => { reads++; } });
  let posts: { email: string; canCreateWorkspace: boolean }[] = [];
  await page.route(ENROLLMENTS_API, (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    posts.push(body);
    const enrollment = toEnrollment({
      id: 'enroll-new',
      email: body.email,
      canCreateWorkspace: body.canCreateWorkspace,
    });
    records.push({
      id: 'enroll-new',
      email: body.email,
      canCreateWorkspace: body.canCreateWorkspace,
    });
    return route.fulfill({
      json: { enrollment, token: 'raw-token-abc123', url: '/enroll/raw-token-abc123' },
    });
  });
  await openAdminUsers(page);
  const readsAfterFirstLoad = reads;
  expect(readsAfterFirstLoad).toBeGreaterThan(0);

  await page.getByRole('button', { name: '新建待激活账号' }).click();
  const dialog = page.locator('.mantine-Modal-content');
  await expect(dialog.getByText('新建待激活账号')).toBeVisible();
  await dialog.getByLabel('邮箱').fill('newcomer@example.test');
  // Mantine 的隐藏 input 点不动：键盘可达性是硬约束。
  await dialog.getByRole('switch', { name: '允许创建工作区' }).press('Space');
  await dialog.getByRole('button', { name: '创建链接' }).click();

  expect(posts).toHaveLength(1);
  // 授权必须逐次显式选定：请求里带着管理员这次的选择，而不是站点默认值。
  expect(posts[0]).toEqual({
    email: 'newcomer@example.test',
    canCreateWorkspace: true,
  });
  // exact: 「复制激活链接」按钮的名字包含它，必须用精确名字选中输入框本身。
  const link = page.getByRole('textbox', { name: '激活链接', exact: true });
  await expect(link).toHaveValue(`${BASE_URL}/enroll/raw-token-abc123`);
  await expect(
    page.getByText('链接只显示一次，请及时复制发送。', { exact: false }),
  ).toBeVisible();
  // 创建成功后列表失效重取：服务端是唯一的已确认状态。
  await expect(page.getByText('共 1 条待激活记录', { exact: true })).toBeVisible();
  expect(reads).toBeGreaterThan(readsAfterFirstLoad);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: BASE_URL,
  });
  await page.getByRole('button', { name: '复制激活链接' }).click();
  await expect(
    page.getByRole('button', { name: '激活链接已复制' }),
  ).toBeVisible();

  // 令牌只此一次：列表拿不到它，刷新后页面上不该还留着原文。
  await page.reload();
  await expect(
    page.getByRole('group', { name: '待激活账号：newcomer@example.test' }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: '激活链接', exact: true }),
  ).toHaveCount(0);
  expect(await page.getByText('raw-token-abc123').count()).toBe(0);
});

test('an already registered email is sent to user management, not to a reset', async ({
  page,
}) => {
  await openDocument(page);
  await mockList(page, () => []);
  await page.route(ENROLLMENTS_API, (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    return route.fulfill({
      status: 409,
      json: {
        error: {
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'email already registered',
        },
      },
    });
  });
  await openAdminUsers(page);

  await page.getByRole('button', { name: '新建待激活账号' }).click();
  const dialog = page.locator('.mantine-Modal-content');
  await dialog.getByLabel('邮箱').fill('existing@example.test');
  await dialog.getByRole('button', { name: '创建链接' }).click();

  await expect(
    dialog.getByText('该邮箱已有账号，请到「用户管理」中调整其状态与权限。'),
  ).toBeVisible();
  // This path must not be mistaken for a way to take over an existing account.
  await expect(dialog.getByText(/重置密码|修改其密码|重新设置密码/)).toHaveCount(0);
  await expect(page.getByText('email already registered')).toHaveCount(0);
  // 草稿保留：管理员可以直接改邮箱重试，而不用重填整个表单。
  await expect(dialog.getByLabel('邮箱')).toHaveValue('existing@example.test');
});

test('revoking an enrollment is confirmed and explained', async ({ page }) => {
  await openDocument(page);
  const records: FixtureEnrollment[] = [
    { id: 'enroll-pending', email: 'pending@example.test' },
  ];
  await mockList(page, () => records);
  let deletes: string[] = [];
  await page.route(ENROLLMENT_API, (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    deletes.push(route.request().url());
    records[0] = { ...records[0], status: 'revoked' };
    return route.fulfill({ status: 204, body: '' });
  });
  await openAdminUsers(page);

  const row = page.getByRole('group', { name: '待激活账号：pending@example.test' });
  await row.getByRole('button', { name: '撤销' }).click();
  const dialog = page.locator('.mantine-Modal-content');
  await expect(dialog.getByText('确认撤销待激活记录')).toBeVisible();
  // A dangerous act has to name its consequence before it is committed.
  await expect(dialog).toContainText('原激活链接将立即失效');
  await expect(dialog).toContainText('请重新新建一条待激活账号并发送新链接');
  await expect(dialog).toContainText('不影响已存在的账号');

  await dialog.getByRole('button', { name: '取消' }).click();
  expect(deletes).toHaveLength(0);

  await row.getByRole('button', { name: '撤销' }).click();
  await page.locator('.mantine-Modal-content').getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByText('待激活记录已撤销', { exact: true })).toBeVisible();
  expect(deletes).toHaveLength(1);
  expect(deletes[0]).toContain('/api/admin/account-enrollments/enroll-pending');
  await expect(row).toContainText('已撤销');
});

test('a failed revoke stays open and is never retried behind the admin', async ({
  page,
}) => {
  await openDocument(page);
  await mockList(page, () => [
    { id: 'enroll-pending', email: 'pending@example.test' },
  ]);
  let deletes = 0;
  await page.route(ENROLLMENT_API, (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    deletes++;
    return route.fulfill({
      status: 500,
      json: { error: { code: 'INTERNAL', message: 'boom' } },
    });
  });
  await openAdminUsers(page);

  await page
    .getByRole('group', { name: '待激活账号：pending@example.test' })
    .getByRole('button', { name: '撤销' })
    .click();
  const dialog = page.locator('.mantine-Modal-content');
  await dialog.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(
    dialog.getByText('撤销未生效，这条待激活记录仍然存在。', { exact: false }),
  ).toBeVisible();
  // The grant is still live; silently retrying it would be worse than stopping.
  await page.waitForTimeout(1000);
  expect(deletes).toBe(1);
  await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible();
});

test('a failed read offers a retry and no rows', async ({ page }) => {
  await openDocument(page);
  let fail = true;
  await mockList(page, () => (fail ? [] : [{ id: 'e1', email: 'later@example.test' }]));
  await page.route(ENROLLMENTS_API, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return fail
      ? route.fulfill({ status: 500, json: { error: { code: 'INTERNAL', message: 'boom' } } })
      : route.fallback();
  });
  await openAdminUsers(page);

  await expect(page.getByText('无法读取待激活记录')).toBeVisible();
  await expect(
    page.getByRole('group', { name: /^待激活账号：/ }),
  ).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: '重试' }).click();
  await expect(
    page.getByRole('group', { name: '待激活账号：later@example.test' }),
  ).toBeVisible();
});

test('losing admin permission removes the whole section', async ({ page }) => {
  await openDocument(page);
  await page.route(ENROLLMENTS_API, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: 'ADMIN_REQUIRED', message: 'admin required' } },
    }),
  );
  await openAdminUsers(page);

  await expect(page.getByText('没有站点管理权限')).toBeVisible();
  await expect(
    page.getByRole('group', { name: /^待激活账号：/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新建待激活账号' })).toHaveCount(0);
  // Retrying cannot change an authorization decision.
  await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0);
});

// ── 收件人侧：激活页 ────────────────────────────────────────────────────────

async function anonymousVisitor(browser: Browser, path: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}${path}`);
  return { context, page };
}

test('the enrollment page asks for a name and a password', async ({
  browser,
}) => {
  const visitor = await anonymousVisitor(browser, '/enroll/token-start');
  try {
    await expect(
      visitor.page.getByRole('heading', { name: '创建账号' }),
    ).toBeVisible();
    await expect(
      visitor.page.getByText('你已被站点管理员批准加入，请设置姓名与密码完成账号创建。'),
    ).toBeVisible();
    await expect(visitor.page.getByLabel('姓名')).toBeVisible();
    await expect(visitor.page.locator('input[type=password]')).toBeVisible();
    await expect(
      visitor.page.getByRole('button', { name: '创建账号' }),
    ).toBeEnabled();
    // 这条流程不写邮箱验证时间，界面也不能宣称已验证。
    await expect(visitor.page.getByText(/邮箱已验证|验证邮箱/)).toHaveCount(0);
  } finally {
    await visitor.context.close();
  }
});

test('a successful enrollment posts the token once and lands on the workspace list', async ({
  browser,
}) => {
  const visitor = await anonymousVisitor(browser, '/enroll/token-ok');
  try {
    const completions: { token: string; name: string; password: string }[] = [];
    await visitor.page.route(COMPLETE_API, (route) => {
      completions.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          user: { id: 'u1', name: '新同事', email: 'newcomer@example.test' },
          csrfToken: 'ignored',
        },
      });
    });
    await visitor.page.getByLabel('姓名').fill('  新同事  ');
    await visitor.page.locator('input[type=password]').fill('password123');
    const workspacesRequested = visitor.page.waitForRequest(
      (request) => request.url().endsWith('/api/workspaces') && request.method() === 'GET',
    );
    await visitor.page.getByRole('button', { name: '创建账号' }).click();
    await workspacesRequested;

    expect(completions).toHaveLength(1);
    expect(completions[0].token).toBe('token-ok');
    // 姓名送去服务端的应当是裁剪后的值。
    expect(completions[0].name).toBe('新同事');
    expect(completions[0].password).toBe('password123');
  } finally {
    await visitor.context.close();
  }
});

test('a rejected token says nothing about why', async ({ browser }) => {
  const visitor = await anonymousVisitor(browser, '/enroll/token-dead');
  try {
    const UNIFIED = '这个激活链接无效或已失效；它可能已被撤销、已经使用过，或者已经过期。请联系站点管理员索取新的激活链接。';
    const readings: string[] = [];
    // Three different reasons the server must not distinguish: revocation,
    // reuse and expiry all collapse into one 404 (§11.3, anti-enumeration).
    const reasons = [
      { code: 'ENROLLMENT_REVOKED', message: 'revoked by admin' },
      { code: 'ENROLLMENT_CONSUMED', message: 'already consumed' },
      { code: 'ENROLLMENT_EXPIRED', message: 'expired at 2026-10-12' },
    ];
    let index = 0;
    await visitor.page.route(COMPLETE_API, (route) => {
      const reason = reasons[Math.min(index, reasons.length - 1)];
      index++;
      return route.fulfill({
        status: 404,
        json: { error: { code: reason.code, message: reason.message } },
      });
    });
    await visitor.page.getByLabel('姓名').fill('新同事');
    await visitor.page.locator('input[type=password]').fill('password123');

    for (const reason of reasons) {
      await visitor.page.getByRole('button', { name: '创建账号' }).click();
      await expect(visitor.page.getByText(UNIFIED)).toBeVisible();
      readings.push(await visitor.page.locator('[role=alert]').innerText());
      // Whatever the server said stays server side.
      await expect(visitor.page.getByText(reason.message)).toHaveCount(0);
      await expect(visitor.page.getByText(reason.code)).toHaveCount(0);
    }
    // One identical explanation for all three failures.
    expect(new Set(readings.map((text) => text.trim())).size).toBe(1);
    // 提交失败保留姓名草稿。
    await expect(visitor.page.getByLabel('姓名')).toHaveValue('新同事');
  } finally {
    await visitor.context.close();
  }
});

test('throttling asks the visitor to wait instead of retrying for them', async ({
  browser,
}) => {
  const visitor = await anonymousVisitor(browser, '/enroll/token-throttled');
  try {
    let attempts = 0;
    await visitor.page.route(COMPLETE_API, (route) => {
      attempts++;
      return route.fulfill({
        status: 429,
        json: { error: { code: 'RATE_LIMITED', message: 'too many attempts' } },
      });
    });
    await visitor.page.getByLabel('姓名').fill('新同事');
    await visitor.page.locator('input[type=password]').fill('password123');
    await visitor.page.getByRole('button', { name: '创建账号' }).click();
    await expect(
      visitor.page.getByText('尝试过于频繁，已被限流。请稍后重试，不要反复提交。'),
    ).toBeVisible();

    await visitor.page.waitForTimeout(1500);
    expect(attempts).toBe(1);
    await expect(visitor.page.getByText('too many attempts')).toHaveCount(0);
  } finally {
    await visitor.context.close();
  }
});

test('an internal failure never reaches the visitor', async ({ browser }) => {
  const visitor = await anonymousVisitor(browser, '/enroll/token-broken');
  try {
    await visitor.page.route(COMPLETE_API, (route) =>
      route.fulfill({
        status: 500,
        json: {
          error: {
            code: 'INTERNAL',
            // The real failure classes are things like bcrypt's byte limit; none
            // of that helps a person filling in a form.
            message: 'bcrypt: password length exceeds 72 bytes',
          },
        },
      }),
    );
    await visitor.page.getByLabel('姓名').fill('新同事');
    await visitor.page.locator('input[type=password]').fill('password123');
    await visitor.page.getByRole('button', { name: '创建账号' }).click();

    await expect(
      visitor.page.getByText('账号未能创建，请稍后重试。', { exact: true }),
    ).toBeVisible();
    await expect(visitor.page.getByText(/bcrypt|72 bytes|INTERNAL/)).toHaveCount(0);
    await expect(visitor.page.getByLabel('姓名')).toHaveValue('新同事');
  } finally {
    await visitor.context.close();
  }
});
