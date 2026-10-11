import { expect, test, type Page } from '@playwright/test';
import { accountHeaders } from './helpers/account';
import { openDocument } from './helpers/writing';

const BASE_URL = 'http://127.0.0.1:3100';
const AUDIT_API = '**/api/admin/audit-events*';

// The browser contract for the audit trail: navigation is real, actions are
// read as Chinese rather than as machine values, the change detail says what
// actually changed, a fresh instance has a truthful empty state, and a refusal
// leaks nothing.

interface FixtureEvent {
  id: number;
  action: string;
  targetType?: string;
  targetId?: string | null;
  actorName?: string | null;
  changes?: Record<string, unknown>;
  createdAt?: string;
}

function toAuditEvent(event: FixtureEvent) {
  return {
    id: event.id,
    actorKind: 'user',
    actorId: 'admin-1',
    actorName: event.actorName === null ? '' : (event.actorName ?? 'Admin'),
    action: event.action,
    targetType: event.targetType ?? 'user',
    targetId: event.targetId === undefined ? 'user-member' : event.targetId,
    changes: event.changes ?? {},
    createdAt: event.createdAt ?? '2026-10-09T02:30:00Z',
  };
}

async function mockAuditEvents(page: Page, events: FixtureEvent[], nextBefore: string | null = null) {
  await page.route(AUDIT_API, (route) =>
    route.fulfill({
      json: { events: events.map(toAuditEvent), nextBefore },
    }),
  );
}

async function openAdminAudit(page: Page) {
  await page.goto('/admin/audit');
  await expect(page.getByRole('main', { name: '站点管理' })).toBeVisible();
}

/**
 * The trail rows, scoped to the timeline list. Each row can contain a nested
 * list of change lines, so an unscoped `listitem` query would also match those.
 */
function auditRows(page: Page) {
  return page
    .getByRole('list', { name: '管理操作记录' })
    .getByRole('listitem');
}

test('the admin shell offers the audit trail beside the other sections', async ({ page }) => {
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  await mockAuditEvents(page, [
    { id: 1, action: 'user.disabled', actorName: session.user.name },
  ]);
  await openAdminAudit(page);

  const navigation = page.getByRole('navigation', { name: '站点管理导航' });
  await expect(navigation.getByRole('button', { name: '操作记录' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(navigation.getByRole('button', { name: '用户管理' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: '站点设置' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /站点管理\s*\/\s*操作记录/ }),
  ).toBeVisible();

  // Section navigation leaves the page: it is not a decorative tab strip.
  await navigation.getByRole('button', { name: '用户管理' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
});

test('the live admin API fills the trail and reads actions as Chinese', async ({
  page,
  browser,
}) => {
  // No mock: this watches the real chain, and the server is the only judge of
  // what a management change actually records.
  await openDocument(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  const headers = await accountHeaders(page, BASE_URL);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const invitation = await (
    await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
      headers,
      data: { email: `audit-${Date.now()}@example.test`, role: 'editor' },
    })
  ).json();

  // Accept from a cookie-free context: the invite belongs to a new account, and
  // a signed-in administrator is not the invitee.
  const memberContext = await browser.newContext();
  let memberId = '';
  try {
    const accepted = await memberContext.request.post(
      `${BASE_URL}/api/invites/${invitation.token}/accept`,
      { data: { name: 'Audit Target', password: 'password123' } },
    );
    expect(accepted.ok()).toBeTruthy();
    memberId = (await accepted.json()).user.id;

    // Disable the account through the real management endpoint so a real audit
    // row exists before the page opens.
    const disabled = await page.request.patch(
      `${BASE_URL}/api/admin/users/${memberId}`,
      { headers, data: { expectedRevision: 0, changes: { disabled: true } } },
    );
    expect(disabled.ok()).toBeTruthy();

    await openAdminAudit(page);

    const row = auditRows(page).filter({ hasText: '停用了账号' });
    await expect(row).toBeVisible();
    // The operator is named, not reduced to an id.
    await expect(row).toContainText(session.user.name);
    // Machine values never reach the page.
    await expect(page.getByText('user.disabled', { exact: false })).toHaveCount(0);
    await expect(page.getByText('site_settings', { exact: false })).toHaveCount(0);
    await expect(page.getByText('canCreateWorkspace', { exact: false })).toHaveCount(0);

    // The change detail reads as a sentence about the setting, not a JSON diff.
    // `disabled` reads with its own polarity: true means disabled, so the line
    // must not be the inverse of what happened.
    await row.getByRole('button', { name: '查看变更明细' }).click();
    await expect(row).toContainText('账号启用状态：启用中 → 已禁用');
    await expect(row).not.toContainText('账号启用状态：不允许 → 允许');
    await expect(page.getByText('changes', { exact: false })).toHaveCount(0);
  } finally {
    await memberContext.close();
  }
});

test('a settings change is recorded and rendered in Chinese', async ({ page }) => {
  await openDocument(page);
  await mockAuditEvents(page, [
    {
      id: 2,
      action: 'site.settings_changed',
      targetType: 'site_settings',
      targetId: 'site_settings',
      changes: {
        inviteDefaultCanCreateWorkspace: { from: true, to: false },
      },
    },
  ]);
  await openAdminAudit(page);

  const row = auditRows(page).filter({ hasText: '修改了站点设置' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('站点设置');
  await row.getByRole('button', { name: '查看变更明细' }).click();
  await expect(row).toContainText('受邀新账号默认可创建工作区：允许 → 不允许');
  // The raw action and target type stay out of the interface.
  await expect(page.getByText('site.settings_changed', { exact: false })).toHaveCount(0);
});

test('the action and target filters narrow the request and the list', async ({
  page,
}) => {
  await openDocument(page);
  const requests: URL[] = [];
  await page.route(AUDIT_API, (route) => {
    requests.push(new URL(route.request().url()));
    const action = new URL(route.request().url()).searchParams.get('action');
    const targetType = new URL(route.request().url()).searchParams.get('targetType');
    let events = [
      { id: 3, action: 'user.disabled', targetType: 'user', createdAt: '2026-10-09T02:30:00Z' },
      { id: 2, action: 'site.settings_changed', targetType: 'site_settings', targetId: 'site_settings', createdAt: '2026-10-08T02:30:00Z' },
    ];
    if (action) events = events.filter((event) => event.action === action);
    if (targetType) events = events.filter((event) => event.targetType === targetType);
    return route.fulfill({
      json: {
        events: events.map((event) => toAuditEvent({ ...event, targetId: event.targetId ?? 'user-a' })),
        nextBefore: null,
      },
    });
  });
  await openAdminAudit(page);

  await page.getByRole('textbox', { name: '操作类型' }).click();
  await page.getByRole('option', { name: '停用账号' }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('action')).toBe('user.disabled');
  await expect(auditRows(page).filter({ hasText: '停用了账号' })).toBeVisible();
  await expect(page.getByText('修改了站点设置')).toHaveCount(0);

  await page.getByRole('textbox', { name: '操作对象' }).click();
  await page.getByRole('option', { name: '站点设置' }).click();
  await expect
    .poll(() => requests.at(-1)?.searchParams.get('targetType'))
    .toBe('site_settings');
  // The combined filter matches nothing, and the page says so instead of
  // quietly showing everything.
  await expect(page.getByText('没有符合条件的记录')).toBeVisible();

  await page.getByRole('button', { name: '清空筛选' }).click();
  // Clearing returns to the unfiltered query, which this session already read.
  // A still-fresh cache entry is reused on purpose (the app's 15s staleTime),
  // so the assertion is on what the administrator sees, not on a refetch.
  await expect(auditRows(page)).toHaveCount(2);
  await expect(page.getByText('停用了账号')).toBeVisible();
  await expect(page.getByText('修改了站点设置')).toBeVisible();
});

test('an instance with no management change says so plainly', async ({ page }) => {
  await openDocument(page);
  await mockAuditEvents(page, []);
  await openAdminAudit(page);

  // An empty trail is a real first-screen state, not an error.
  await expect(page.getByText('还没有管理操作')).toBeVisible();
  await expect(page.getByText('站点设置或账号被修改后，这里会出现记录。')).toBeVisible();
  // No records means no timeline and no pagination.
  await expect(auditRows(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '更早的记录' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('older records are fetched with a cursor instead of all at once', async ({
  page,
}) => {
  await openDocument(page);
  const requests: URL[] = [];
  let page2Served = false;
  await page.route(AUDIT_API, (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const before = url.searchParams.get('before');
    if (!before) {
      return route.fulfill({
        json: {
          events: [
            toAuditEvent({ id: 30, action: 'user.enabled', createdAt: '2026-10-09T02:30:00Z' }),
            toAuditEvent({ id: 29, action: 'user.disabled', createdAt: '2026-10-09T01:30:00Z' }),
          ],
          nextBefore: '29',
        },
      });
    }
    page2Served = true;
    return route.fulfill({
      json: {
        events: [toAuditEvent({ id: 28, action: 'user.sessions_revoked', createdAt: '2026-10-08T02:30:00Z' })],
        nextBefore: null,
      },
    });
  });
  await openAdminAudit(page);

  await expect(auditRows(page)).toHaveCount(2);
  const loadOlder = page.getByRole('button', { name: '更早的记录' });
  await expect(loadOlder).toBeVisible();
  await loadOlder.click();

  await expect(auditRows(page)).toHaveCount(3);
  await expect(page.getByText('撤销了账号的全部会话')).toBeVisible();
  expect(page2Served).toBe(true);
  // The cursor is the smallest id of the previous page, not an offset.
  expect(requests.at(-1)?.searchParams.get('before')).toBe('29');
  // The last page retires the pagination control.
  await expect(page.getByRole('button', { name: '更早的记录' })).toHaveCount(0);
});

test('a failed read keeps a retry and does not pretend the trail is empty', async ({
  page,
}) => {
  await openDocument(page);
  let attempts = 0;
  await page.route(AUDIT_API, (route) => {
    attempts++;
    // Fail the initial read *and* its automatic retries: only the explicit
    // "重试" click may bring the trail back.
    if (attempts <= 4) {
      return route.fulfill({
        status: 500,
        json: { error: { code: 'INTERNAL', message: 'boom' } },
      });
    }
    return route.fulfill({
      json: {
        events: [toAuditEvent({ id: 5, action: 'user.admin_role_changed', createdAt: '2026-10-09T02:30:00Z' })],
        nextBefore: null,
      },
    });
  });
  await openAdminAudit(page);

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('无法读取操作记录');
  // A failed read is never dressed up as "nothing happened yet".
  await expect(page.getByText('还没有管理操作')).toHaveCount(0);
  await expect(auditRows(page)).toHaveCount(0);
  await alert.getByRole('button', { name: '重试' }).click();
  await expect(page.getByText('调整了管理员身份')).toBeVisible();
});

test('a server refusal hides every row and offers no retry', async ({ page }) => {
  await openDocument(page);
  // The administrator's own rights may be revoked while the session is still
  // valid: the moment the server says no, the page must stop showing data.
  await page.route(AUDIT_API, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: 'ADMIN_REQUIRED', message: 'admin required' } },
    }),
  );
  await openAdminAudit(page);

  await expect(page.getByText('没有站点管理权限')).toBeVisible();
  await expect(auditRows(page)).toHaveCount(0);
  await expect(page.getByText('停用了账号')).toHaveCount(0);
  // Retrying cannot change an authorization decision, so it is not offered.
  await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0);
});

test('a non-admin sees a plain refusal and no audit data', async ({ page, browser }) => {
  await openDocument(page);
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
    await memberPage.goto(`${BASE_URL}/admin/audit`);
    await expect(memberPage.getByText('没有站点管理权限')).toBeVisible();
    await expect(
      memberPage.getByText('此页面仅站点管理员可访问。'),
    ).toBeVisible();
    // The management chrome does not render at all for a non-admin.
    await expect(
      memberPage.getByRole('navigation', { name: '站点管理导航' }),
    ).toHaveCount(0);
    // A refusal leaks neither values nor the shape of what is protected.
    await expect(auditRows(memberPage)).toHaveCount(0);
    await expect(memberPage.getByText('停用了账号')).toHaveCount(0);
    await expect(memberPage.getByText('user.disabled', { exact: false })).toHaveCount(0);
    await expect(
      memberPage.getByRole('button', { name: '更早的记录' }),
    ).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: '重试' })).toHaveCount(0);
  } finally {
    await memberContext.close();
  }
});
