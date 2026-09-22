import { expect, test } from '@playwright/test';
import { accountFixture, accountHeaders, openAccount } from './helpers/account';

test('profile save preserves editor, undo and Markdown; cancel protects the draft', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { item } = await accountFixture(page, baseURL!);
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.insertText('An account change preserves this text.');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await editor.evaluate((el) =>
    el.setAttribute('data-session-check', 'original'),
  );
  await openAccount(page);
  await page.getByLabel('显示名称', { exact: true }).fill('Changed owner');
  await page.getByRole('button', { name: '账号安全', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '保存个人资料？' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  await page.screenshot({
    path: '/tmp/madoc-account-desktop.png',
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '保存更改', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '保存更改', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveAttribute('data-session-check', 'original');
  await expect(
    page.getByRole('button', { name: '账号菜单', exact: true }),
  ).toContainText('Changed owner');
  await editor.click();
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('An account change');
  await editor.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('An account change');
  await expect
    .poll(async () =>
      (await page.request.get(`/api/items/${item.id}/export.md`)).text(),
    )
    .toContain('An account change');
  expect(errors).toEqual([]);
});

test('avatar upload, validation, partial-save retry and removal', async ({
  page,
  baseURL,
}) => {
  const { user } = await accountFixture(page, baseURL!);
  await openAccount(page);
  const image = await page.screenshot({
    clip: { x: 0, y: 0, width: 48, height: 48 },
  });
  await page.locator('input[type=file]').last().setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: image,
  });
  await page.getByLabel('显示名称', { exact: true }).fill('Avatar name');
  await page.route('**/api/me', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, json: {} })
      : route.continue(),
  );
  await page.getByRole('button', { name: '保存更改', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('头像已保存');
  await expect(page.getByLabel('显示名称', { exact: true })).toHaveValue(
    'Avatar name',
  );
  await page.unroute('**/api/me');
  await page.getByRole('button', { name: '保存更改', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '保存更改', exact: true }),
  ).toHaveCount(0);
  expect(
    (await page.request.get(`/api/users/${user.id}/avatar`)).status(),
  ).toBe(200);
  const headers = await accountHeaders(page, baseURL!);
  const bad = await page.request.put('/api/me/avatar', {
    headers,
    multipart: {
      file: {
        name: 'fake.png',
        mimeType: 'image/png',
        buffer: Buffer.from('<svg/>'),
      },
    },
  });
  expect(bad.status()).toBe(400);
  await page.getByRole('button', { name: '恢复默认', exact: true }).click();
  await page.getByRole('button', { name: '保存更改', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '保存更改', exact: true }),
  ).toHaveCount(0);
  expect(
    (await page.request.get(`/api/users/${user.id}/avatar`)).status(),
  ).toBe(404);
});

test('password keeps this browser and revokes another live collaboration session', async ({
  page,
  browser,
  baseURL,
}) => {
  const { workspace, item } = await accountFixture(page, baseURL!);
  const headers = await accountHeaders(page, baseURL!);
  const email = `security-${workspace.id}@example.test`;
  const invite = await (
    await page.request.post(`/api/workspaces/${workspace.id}/invites`, {
      headers,
      data: { email, role: 'editor' },
    })
  ).json();
  const first = await browser.newContext();
  const second = await browser.newContext();
  const member = await first.newPage();
  const other = await second.newPage();
  try {
    expect(
      (
        await member.request.post(
          `${baseURL}/api/invites/${invite.token}/accept`,
          { data: { name: 'Security member', password: 'password123' } },
        )
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await other.request.post(`${baseURL}/api/auth/sign-in`, {
          data: { email, password: 'password123' },
        })
      ).ok(),
    ).toBeTruthy();
    await member.goto(`${baseURL}/workspace/${workspace.id}/${item.id}`);
    await other.goto(member.url());
    await expect(member.locator('.ProseMirror')).toBeVisible();
    await expect(other.getByText('已保存', { exact: true })).toBeVisible();
    await openAccount(member, '账号安全');
    await member.getByLabel('当前密码', { exact: true }).fill('incorrect');
    await member.getByLabel('新密码', { exact: true }).fill('nextpassword123');
    await member
      .getByLabel('确认新密码', { exact: true })
      .fill('nextpassword123');
    await member.getByRole('button', { name: '修改密码', exact: true }).click();
    await expect(member.getByRole('alert')).toContainText('当前密码不正确');
    await member.getByLabel('当前密码', { exact: true }).fill('password123');
    await member.getByRole('button', { name: '修改密码', exact: true }).click();
    await expect(member.getByRole('status')).toContainText('密码已修改');
    await expect(other).toHaveURL(`${baseURL}/sign-in`);
    expect((await member.request.get(`${baseURL}/api/me`)).ok()).toBeTruthy();
    expect((await other.request.get(`${baseURL}/api/me`)).status()).toBe(401);
    expect(
      (
        await other.request.post(`${baseURL}/api/auth/sign-in`, {
          data: { email, password: 'password123' },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await other.request.post(`${baseURL}/api/auth/sign-in`, {
          data: { email, password: 'nextpassword123' },
        })
      ).ok(),
    ).toBeTruthy();
  } finally {
    await first.close();
    await second.close();
  }
});

test('mobile personal settings and shared menu on workspace list', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await accountFixture(page, baseURL!);
  await page.getByRole('button', { name: '打开内容导航' }).click();
  await openAccount(page);
  await expect(page.getByLabel('登录邮箱', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  );
  await page.screenshot({
    path: '/tmp/madoc-account-mobile.png',
    animations: 'disabled',
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByLabel('显示名称', { exact: true }).fill('Discard');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '放弃更改' }).click();
  await page.goto('/workspaces');
  await openAccount(page, '快捷键');
  await expect(page.getByText('编辑快捷键', { exact: true })).toBeVisible();
});

test('account menu keyboard navigation restores trigger focus', async ({
  page,
  baseURL,
}) => {
  await accountFixture(page, baseURL!);
  const trigger = page.getByRole('button', { name: '账号菜单', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.locator('[data-menu-dropdown] [data-autofocus]'),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('menuitem', { name: '设置', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: '个人设置', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('account entries are grouped under settings with a shortcuts navigation item', async ({
  page,
  baseURL,
}) => {
  await accountFixture(page, baseURL!);
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['设置', '退出登录']);
  await page.getByRole('menuitem', { name: '设置', exact: true }).click();
  const nav = page.getByRole('navigation', { name: '个人设置分类' });
  await expect(nav.getByRole('button')).toHaveText([
    '个人资料',
    'Markdown 偏好',
    '账号安全',
    '快捷键',
  ]);
  await nav.getByRole('button', { name: '快捷键', exact: true }).click();
  await expect(
    nav.getByRole('button', { name: '快捷键', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('编辑快捷键', { exact: true })).toBeVisible();
  await page.screenshot({
    path: '/tmp/madoc-settings-shortcuts-desktop.png',
    animations: 'disabled',
  });
});
