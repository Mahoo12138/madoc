import { expect, test, type Page } from '@playwright/test';
import { accountFixture, accountHeaders, openAccount } from './helpers/account';
import { defaultPreferences } from '../src/features/account/preferences-model';
const source =
  '# A heading\n\nA paragraph to read.\n\n```ts\nconst answer = 42;\nconsole.log(answer);\n```\n';
async function setup(page: Page, baseURL: string) {
  const result = await accountFixture(page, baseURL, source);
  expect(
    (
      await page.request.patch('/api/me/preferences', {
        headers: await accountHeaders(page, baseURL),
        data: defaultPreferences,
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  return result;
}
async function synced(page: Page) {
  await expect(page.getByLabel('偏好同步状态')).toHaveText('已同步');
}

test('all seven preferences affect only this view and survive refresh', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  const { item } = await setup(page, baseURL!);
  const before = await (
    await page.request.get(`/api/items/${item.id}/export.md`)
  ).text();
  const editor = page.locator('.ProseMirror');
  await editor.evaluate((el) =>
    el.setAttribute('data-session-check', 'unchanged'),
  );
  await openAccount(page, 'Markdown 偏好');
  await page.getByRole('textbox', { name: '正文字号', exact: true }).fill('20');
  await page.getByRole('textbox', { name: '行距', exact: true }).click();
  await page.getByRole('option', { name: '宽松', exact: true }).click();
  await page.getByRole('textbox', { name: '正文宽度', exact: true }).click();
  await page.getByRole('option', { name: '宽 · 960px', exact: true }).click();
  await page.getByRole('switch', { name: '显示代码行号' }).uncheck();
  await page.getByRole('switch', { name: '括号与引号自动配对' }).uncheck();
  await page.getByRole('switch', { name: '专注模式', exact: true }).check();
  await page.getByRole('switch', { name: '打字机模式', exact: true }).check();
  await synced(page);
  await page.getByLabel('阅读预览').scrollIntoViewIfNeeded();
  await page
    .getByRole('dialog')
    .locator('section')
    .evaluate((el) => {
      el.scrollTop = 0;
    });
  await page.screenshot({
    path: '/tmp/madoc-preferences-desktop.png',
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(editor).toHaveAttribute('data-session-check', 'unchanged');
  await expect(editor).toHaveCSS('font-size', '20px');
  await expect(editor).toHaveCSS('line-height', '40px');
  await expect(editor.locator('h1')).toHaveCSS('font-size', '40px');
  await expect(page.locator('article')).toHaveCSS('width', '960px');
  await expect(page.locator('.cm-lineNumbers')).toBeHidden();
  expect(
    await (await page.request.get(`/api/items/${item.id}/export.md`)).text(),
  ).toBe(before);
  await page.reload();
  await expect(editor).toHaveCSS('font-size', '20px');
  await expect(page.locator('[data-focus-mode=true]')).toBeVisible();
  await page.getByRole('button', { name: '切换专注模式' }).click();
  await openAccount(page, 'Markdown 偏好');
  await expect(
    page.getByRole('switch', { name: '专注模式', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: '恢复默认设置', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await synced(page);
  await expect(editor).toHaveCSS('font-size', '16px');
  expect(
    await (await page.request.get(`/api/items/${item.id}/export.md`)).text(),
  ).toBe(before);
  expect(errors).toEqual([]);
});

test('auto pairing can be toggled without recreating the editor or changing escaping', async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL!);
  await openAccount(page, 'Markdown 偏好');
  await page.getByRole('switch', { name: '括号与引号自动配对' }).uncheck();
  await synced(page);
  await page.keyboard.press('Escape');
  const paragraph = page.locator('.ProseMirror p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('(');
  await expect(
    page.locator('.ProseMirror p').filter({ hasText: /^\($/ }),
  ).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('\\*');
  await expect(page.locator('.ProseMirror strong')).toHaveCount(0);
  await openAccount(page, 'Markdown 偏好');
  await page.getByRole('switch', { name: '括号与引号自动配对' }).check();
  await synced(page);
  await page.keyboard.press('Escape');
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('(');
  await expect(
    page.locator('.ProseMirror p').filter({ hasText: /^\(\)$/ }),
  ).toHaveCount(1);
});

test('same-browser tabs and another device synchronize field changes', async ({
  page,
  browser,
  baseURL,
}) => {
  await setup(page, baseURL!);
  const second = await page.context().newPage();
  await second.goto(page.url());
  await expect(second.locator('.ProseMirror')).toBeVisible();
  await openAccount(page, 'Markdown 偏好');
  await openAccount(second, 'Markdown 偏好');
  await page.getByRole('textbox', { name: '正文字号', exact: true }).fill('19');
  await second.getByRole('switch', { name: '专注模式', exact: true }).check();
  await synced(page);
  await synced(second);
  await expect(
    second.getByRole('textbox', { name: '正文字号', exact: true }),
  ).toHaveValue('19 px');
  await expect(
    page.getByRole('switch', { name: '专注模式', exact: true }),
  ).toBeChecked();
  const context = await browser.newContext();
  const device = await context.newPage();
  try {
    expect(
      (
        await device.request.post(`${baseURL}/api/auth/sign-in`, {
          data: { email: 'owner@example.test', password: 'password123' },
        })
      ).ok(),
    ).toBeTruthy();
    await device.goto(page.url());
    await expect(device.locator('.ProseMirror')).toHaveCSS('font-size', '19px');
    await openAccount(device, 'Markdown 偏好');
    await device
      .getByRole('switch', { name: '专注模式', exact: true })
      .uncheck();
    await synced(device);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByRole('switch', { name: '专注模式', exact: true }),
    ).not.toBeChecked();
  } finally {
    await context.close();
    await second.close();
  }
});

test('offline preferences remain usable, warn on logout, and sync on reconnect', async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL!);
  await openAccount(page, 'Markdown 偏好');
  await page.context().setOffline(true);
  await page.getByRole('textbox', { name: '正文字号', exact: true }).fill('22');
  await expect(page.getByLabel('偏好同步状态')).toHaveText('待同步');
  await expect(page.getByRole('button', { name: '重试同步' })).toBeVisible();
  await expect(page.locator('.ProseMirror')).toHaveCSS('font-size', '22px');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '退出登录', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '继续等待', exact: true }).click();
  await page.context().setOffline(false);
  await openAccount(page, 'Markdown 偏好');
  await synced(page);
  expect(
    (await (await page.request.get('/api/me/preferences')).json()).preferences
      .fontSize,
  ).toBe(22);
});

test('failed saves retain pending fields across reload and retry', async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL!);
  await page.route('**/api/me/preferences', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, json: {} })
      : route.continue(),
  );
  await openAccount(page, 'Markdown 偏好');
  await page.getByRole('textbox', { name: '正文字号', exact: true }).fill('21');
  await expect(page.getByRole('button', { name: '重试同步' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ProseMirror')).toHaveCSS('font-size', '21px');
  await openAccount(page, 'Markdown 偏好');
  await expect(page.getByRole('button', { name: '重试同步' })).toBeVisible();
  await page.unroute('**/api/me/preferences');
  await page.getByRole('button', { name: '重试同步' }).click();
  await synced(page);
  expect(
    (await (await page.request.get('/api/me/preferences')).json()).preferences
      .fontSize,
  ).toBe(21);
});

test('viewer preferences are isolated; legacy modes migrate only once; mobile fits', async ({
  page,
  browser,
  baseURL,
}) => {
  const { workspace, item } = await setup(page, baseURL!);
  await openAccount(page, 'Markdown 偏好');
  await page.getByRole('textbox', { name: '正文字号', exact: true }).fill('20');
  await synced(page);
  const invite = await (
    await page.request.post(`/api/workspaces/${workspace.id}/invites`, {
      headers: await accountHeaders(page, baseURL!),
      data: { email: `prefs-${workspace.id}@example.test`, role: 'viewer' },
    })
  ).json();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const viewer = await context.newPage();
  try {
    await viewer.request.post(`${baseURL}/api/invites/${invite.token}/accept`, {
      data: { name: 'Viewer', password: 'password123' },
    });
    await viewer.addInitScript(() =>
      localStorage.setItem('madoc.editor.focus-mode', 'true'),
    );
    await viewer.goto(`${baseURL}/workspace/${workspace.id}/${item.id}`);
    await expect(viewer.locator('.ProseMirror')).toHaveAttribute(
      'contenteditable',
      'false',
    );
    await expect(viewer.locator('.ProseMirror')).toHaveCSS('font-size', '16px');
    await expect(viewer.locator('[data-focus-mode=true]')).toBeVisible();
    await viewer.getByRole('button', { name: '打开内容导航' }).click();
    await openAccount(viewer, 'Markdown 偏好');
    await viewer
      .getByRole('switch', { name: '专注模式', exact: true })
      .uncheck();
    await viewer
      .getByRole('textbox', { name: '正文字号', exact: true })
      .fill('18');
    await synced(viewer);
    await viewer
      .getByRole('dialog')
      .locator('section')
      .evaluate((el) => {
        el.scrollTop = 0;
      });
    await viewer.screenshot({
      path: '/tmp/madoc-preferences-mobile.png',
      animations: 'disabled',
    });
    expect(
      await viewer.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await viewer.reload();
    await expect(viewer.locator('.ProseMirror')).toHaveCSS('font-size', '18px');
    await expect(viewer.locator('[data-focus-mode=true]')).toHaveCount(0);
    await expect(page.locator('.ProseMirror')).toHaveCSS('font-size', '20px');
  } finally {
    await context.close();
  }
});

test('outdated backend is explained and pending preferences sync after service recovery', async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL!);
  await page.route('**/api/me/preferences', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: '404 page not found',
    }),
  );
  await openAccount(page, 'Markdown 偏好');
  await page.getByRole('textbox', { name: '正文字号', exact: true }).fill('21');
  await expect(page.getByLabel('偏好同步状态')).toHaveText('待同步');
  await expect(page.getByRole('alert')).toContainText('更新并重启服务');
  await expect(page.locator('.ProseMirror')).toHaveCSS('font-size', '21px');
  await page.unroute('**/api/me/preferences');
  await page.getByRole('button', { name: '重试同步' }).click();
  await synced(page);
  expect(
    (await (await page.request.get('/api/me/preferences')).json()).preferences
      .fontSize,
  ).toBe(21);
  await page.reload();
  await expect(page.locator('.ProseMirror')).toHaveCSS('font-size', '21px');
});
