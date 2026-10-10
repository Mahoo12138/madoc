import { expect, test, type Browser, type Page } from '@playwright/test';
import { accountHeaders } from './helpers/account';
import { openDocument } from './helpers/writing';

const BASE_URL = 'http://127.0.0.1:3100';
const SETTINGS_API = '**/api/admin/settings';
const INVITES_API = '**/api/workspaces/*/invites';

// Registration mode and the owner-invite switch decide what a visitor is
// allowed to do before they ever reach the app. These cover the promises the
// sign-in and invite pages make about that decision: the page states the
// admission rule in words, never renders a form the server will reject, and
// never turns a refusal into an account-oracle answer.

async function patchSiteSettings(page: Page, changes: Record<string, unknown>) {
  const headers = await accountHeaders(page, BASE_URL);
  const current = await (
    await page.request.get(`${BASE_URL}/api/admin/settings`, { headers })
  ).json();
  const response = await page.request.patch(`${BASE_URL}/api/admin/settings`, {
    headers,
    data: { expectedRevision: current.revision, changes },
  });
  expect(
    response.ok(),
    `PATCH /api/admin/settings ${JSON.stringify(changes)} → ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
  return response.json();
}

async function setRegistrationMode(page: Page, mode: 'closed' | 'invite_only') {
  await patchSiteSettings(page, { registrationMode: mode });
}

// Synchronous on purpose: it only reads the URL, and an async signature here
// silently hands every caller a Promise that interpolates into request paths
// as `[object Promise]`, which the server answers with a bare 403.
function workspaceIdOf(page: Page) {
  return new URL(page.url()).pathname.split('/')[2];
}

/** Invite as the site-admin owner: by policy that always succeeds unless registration is closed. */
async function createInvite(page: Page, workspaceId: string, email: string) {
  const headers = await accountHeaders(page, BASE_URL);
  const response = await page.request.post(
    `${BASE_URL}/api/workspaces/${workspaceId}/invites`,
    { headers, data: { email, role: 'editor' } },
  );
  expect(
    response.ok(),
    `create invite for ${email} → ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
  const { token } = await response.json();
  return token as string;
}

/** A visitor with no session at all, so the invite page sees the anonymous branch. */
async function anonymousVisitor(browser: Browser, path: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}${path}`);
  return { context, page };
}

function membersNavigation(page: Page) {
  return page.getByRole('navigation', { name: '工作区管理导航' });
}

/**
 * These tests move shared site policy around; every other spec still expects the
 * shipped default. Restoring it after each test keeps the failure blast radius
 * inside this file, and any error here is deliberately swallowed so a broken
 * restore never masks the failure it is cleaning up after.
 */
test.afterEach(async ({ page }) => {
  try {
    await patchSiteSettings(page, {
      registrationMode: 'invite_only',
      allowWorkspaceOwnerInviteNewUsers: true,
    });
  } catch {
    /* nothing left to restore */
  }
});

test.describe('the sign-in page states the admission rule', () => {
  test('a closed site says self-service registration is not open', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    await setRegistrationMode(page, 'closed');
    const visitor = await anonymousVisitor(browser, '/sign-in');
    try {
      await expect(visitor.page.getByText('此站点未开放自助注册。')).toBeVisible();
      await expect(visitor.page.getByText('请通过邀请链接加入。')).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('an invite-only site points at invitation links', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    await setRegistrationMode(page, 'invite_only');
    const visitor = await anonymousVisitor(browser, '/sign-in');
    try {
      await expect(visitor.page.getByText('请通过邀请链接加入。')).toBeVisible();
      await expect(
        visitor.page.getByText('此站点未开放自助注册。'),
      ).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('a failing site lookup degrades silently instead of breaking the form', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    // /api/site carries one sentence of explanatory copy. Losing it must not
    // cost the visitor an error panel, an empty state, or the form itself.
    const visitor = await anonymousVisitor(browser, '/');
    try {
      await visitor.page.route('**/api/site', (route) =>
        route.fulfill({
          status: 500,
          json: { error: { code: 'INTERNAL', message: 'boom' } },
        }),
      );
      await visitor.page.goto(`${BASE_URL}/sign-in`);
      await expect(visitor.page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
      await expect(
        visitor.page.getByText('此站点未开放自助注册。'),
      ).toHaveCount(0);
      await expect(visitor.page.getByText('请通过邀请链接加入。')).toHaveCount(0);
      // No error surface and no "could not load" state, and no retry: retrying
      // cannot change what the server refuses to say.
      await expect(visitor.page.getByText('boom')).toHaveCount(0);
      await expect(visitor.page.getByRole('alert')).toHaveCount(0);
      await expect(visitor.page.getByRole('button', { name: '重试' })).toHaveCount(0);
      // The form is still usable, which is the whole point of the page.
      await expect(visitor.page.getByLabel('邮箱')).toBeEditable();
      await expect(visitor.page.getByLabel('密码')).toBeEditable();
      await expect(
        visitor.page.getByRole('button', { name: '登录' }),
      ).toBeEnabled();
    } finally {
      await visitor.context.close();
    }
  });
});

test.describe('the invite page renders the state it can honour', () => {
  test('an anonymous visitor who may register gets the name and password form', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const workspaceId = workspaceIdOf(page);
    await setRegistrationMode(page, 'invite_only');
    const token = await createInvite(
      page,
      workspaceId,
      `joinable-${Date.now()}@example.test`,
    );

    const visitor = await anonymousVisitor(browser, `/invite/${token}`);
    try {
      await expect(
        visitor.page.getByRole('heading', { name: '加入工作区' }),
      ).toBeVisible();
      await expect(visitor.page.getByLabel('姓名')).toBeVisible();
      await expect(visitor.page.locator('input[type=password]')).toBeVisible();
      await expect(
        visitor.page.getByRole('button', { name: '接受邀请' }),
      ).toBeEnabled();
      await expect(
        visitor.page.getByText('当前不允许创建新账号'),
      ).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('closing registration removes every control the server would reject', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const workspaceId = workspaceIdOf(page);
    // Invite first, then close: this is exactly the "invite sent before the
    // policy tightened" case the admission check has to honour at read time.
    await setRegistrationMode(page, 'invite_only');
    const token = await createInvite(
      page,
      workspaceId,
      `blocked-${Date.now()}@example.test`,
    );
    await setRegistrationMode(page, 'closed');

    const visitor = await anonymousVisitor(browser, `/invite/${token}`);
    try {
      await expect(
        visitor.page.getByText(
          '当前不允许创建新账号，请联系邀请你加入工作区的人或站点管理员。',
        ),
      ).toBeVisible();
      // No sign-up form: an existing account must not be invited to rebuild itself.
      await expect(visitor.page.getByLabel('姓名')).toHaveCount(0);
      await expect(visitor.page.locator('input[type=password]')).toHaveCount(0);
      // No button that can only fail.
      await expect(
        visitor.page.getByRole('button', { name: '接受邀请' }),
      ).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('a signed-in account matching the invite only has to accept', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const workspaceId = workspaceIdOf(page);
    await setRegistrationMode(page, 'invite_only');
    const email = `member-${Date.now()}@example.test`;
    const first = await createInvite(page, workspaceId, email);

    const memberContext = await browser.newContext();
    try {
      const accepted = await memberContext.request.post(
        `${BASE_URL}/api/invites/${first}/accept`,
        { data: { name: 'Invited Member', password: 'password123' } },
      );
      expect(accepted.ok()).toBeTruthy();

      const second = await createInvite(page, workspaceId, email);
      const member = await memberContext.newPage();
      await member.goto(`${BASE_URL}/invite/${second}`);
      await expect(
        member.getByRole('button', { name: '接受邀请' }),
      ).toBeEnabled();
      // The account already exists, so no name or password field may appear.
      await expect(member.getByLabel('姓名')).toHaveCount(0);
      await expect(member.locator('input[type=password]')).toHaveCount(0);
      await expect(
        member.getByText('当前登录的账号与邀请的邮箱不一致'),
      ).toHaveCount(0);
    } finally {
      await memberContext.close();
    }
  });

  test('a signed-in account that does not match cannot submit', async ({
    page,
  }) => {
    await openDocument(page);
    const workspaceId = workspaceIdOf(page);
    await setRegistrationMode(page, 'invite_only');
    const token = await createInvite(
      page,
      workspaceId,
      `other-${Date.now()}@example.test`,
    );

    await page.goto(`${BASE_URL}/invite/${token}`);
    await expect(
      page.getByText('当前登录的账号与邀请的邮箱不一致，请切换账号后重试。'),
    ).toBeVisible();
    const accept = page.getByRole('button', { name: '接受邀请' });
    await expect(accept).toBeVisible();
    await expect(accept).toBeDisabled();
  });
});

test.describe('the admin panel exposes only what the server implements', () => {
  async function openSiteSettings(page: Page) {
    await openDocument(page);
    await page.goto('/admin');
  }

  test('registration mode offers the two supported values and no open one', async ({
    page,
  }) => {
    await openSiteSettings(page);
    const mode = page.getByRole('radiogroup', { name: '注册模式' });
    await expect(mode).toBeVisible();
    // Registration mode is implemented now, but only the two modes this build
    // registration mode: offering `open` would be a click the server answers
    // with 422. The radio inputs themselves are visually hidden behind their
    // labels, so the options are asserted by name and the labels by sight.
    await expect(mode.getByRole('radio')).toHaveCount(2);
    await expect(mode.getByRole('radio', { name: '已关闭' })).toHaveCount(1);
    await expect(mode.getByRole('radio', { name: '仅邀请' })).toHaveCount(1);
    await expect(mode.getByRole('radio', { name: '公开注册' })).toHaveCount(0);
    await expect(mode.getByText('已关闭', { exact: true })).toBeVisible();
    await expect(mode.getByText('仅邀请', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: '新建账号的默认授权' }).getByText('公开注册尚未提供，暂不能启用。'),
    ).toBeVisible();
  });

  test('the owner-invite switch saves and survives a reload', async ({ page }) => {
    await openSiteSettings(page);
    const toggle = page
      .getByRole('region', { name: '新建账号的默认授权' })
      .getByRole('switch', { name: '普通 owner 邀请新用户' });
    const before = await toggle.isChecked();
    // Keyboard rather than a synthetic click on the hidden input: DESIGN.md
    // makes keyboard reachability a hard constraint.
    await toggle.press('Space');
    await expect(page.getByText('站点设置已保存', { exact: true })).toBeVisible();
    await expect(toggle).toBeChecked({ checked: !before });
    await page.reload();
    await expect(
      page
        .getByRole('region', { name: '新建账号的默认授权' })
        .getByRole('switch', { name: '普通 owner 邀请新用户' }),
    ).toBeChecked({ checked: !before });
  });

  test('only the public signup default is still labelled not wired up', async ({
    page,
  }) => {
    await openSiteSettings(page);
    const pending = page.getByRole('region', { name: '尚未接入的设置' });
    await expect(pending).toBeVisible();
    // Registration mode and the owner-invite switch moved into section one when
    // the server started implementing them, leaving exactly one pending row.
    await expect(pending.getByRole('heading', { name: '公开注册新账号默认创建授权' })).toBeVisible();
    await expect(pending.getByRole('heading', { name: '注册模式' })).toHaveCount(0);
    await expect(
      pending.getByRole('heading', { name: '普通 owner 邀请新用户' }),
    ).toHaveCount(0);
    await expect(page.getByText('未接入', { exact: true })).toHaveCount(1);
  });

  test('turning off the owner-invite switch keeps invitation available', async ({
    page,
  }) => {
    await openDocument(page);
    const workspaceId = workspaceIdOf(page);
    await patchSiteSettings(page, { allowWorkspaceOwnerInviteNewUsers: false });
    // Owners may still invite people who already have an account, so the door
    // itself must stay open (§5.2); only the accounts it accepts narrow.
    await page.goto(`${BASE_URL}/workspace/${workspaceId}/manage`);
    await membersNavigation(page).getByRole('button', { name: '成员管理' }).click();
    await expect(page.getByRole('tab', { name: '邀请' })).toBeVisible();
    await page.getByRole('tab', { name: '邀请' }).click();
    await expect(
      page.getByRole('button', { name: '创建邀请' }),
    ).toBeVisible();
  });
});

test.describe('the invite panel refuses without explaining why', () => {
  async function attemptInvite(page: Page, email: string) {
    await membersNavigation(page).getByRole('button', { name: '成员管理' }).click();
    await page.getByRole('tab', { name: '邀请' }).click();
    await page.getByRole('button', { name: '创建邀请' }).click();
    await page.getByLabel('邀请邮箱').fill(email);
    await page.getByRole('button', { name: '创建链接' }).click();
  }

  const UNIFIED_REFUSAL = '无法邀请该账号；可能需要管理员先创建或启用账号。';

  test('a closed site and a denied owner produce one identical refusal', async ({
    page,
  }) => {
    await openDocument(page);
    const workspaceId = workspaceIdOf(page);
    await page.goto(`${BASE_URL}/workspace/${workspaceId}/manage`);

    // Both refusals below must be indistinguishable: telling the owner whether
    // the address exists, is disabled, or merely lacks permission is how an
    // invite form turns into an account oracle (§5.2).
    await page.route(INVITES_API, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 403,
        json: {
          error: { code: 'REGISTRATION_CLOSED', message: 'registration is closed' },
        },
      });
    });
    await attemptInvite(page, `closed-target-${Date.now()}@example.test`);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(UNIFIED_REFUSAL);
    // The server's own wording stays server side.
    await expect(page.getByText('registration is closed')).toHaveCount(0);

    await page.unroute(INVITES_API);
    let deniedAttempts = 0;
    await page.route(INVITES_API, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      deniedAttempts++;
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: 'INVITE_NEW_USER_DENIED',
            message: 'new users are not allowed',
          },
        },
      });
    });
    // The entry survives both refusals: the modal stays usable, so the owner can
    // correct the address instead of starting over.
    await page.getByRole('button', { name: '创建链接' }).click();
    expect(deniedAttempts).toBe(1);
    await expect(alert).toContainText(UNIFIED_REFUSAL);
    await expect(page.getByText('new users are not allowed')).toHaveCount(0);
    await expect(page.getByLabel('邀请邮箱')).toBeVisible();
  });
});
