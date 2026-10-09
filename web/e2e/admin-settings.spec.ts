import { expect, test, type Page } from '@playwright/test';
import { accountHeaders } from './helpers/account';
import { openDocument } from './helpers/writing';

const BASE_URL = 'http://127.0.0.1:3100';
const SETTINGS_API = '**/api/admin/settings';

// The site settings page is a constant-residence container whose only editable
// row saves on toggle. These cover the promises the product makes about it:
// the read-only section offers no controls at all, a failed save keeps the
// admin's choice visible instead of silently reverting it, and a revision
// conflict is resolved by a person rather than by an automatic retry.

async function openSiteSettings(page: Page) {
  await openDocument(page);
  await page.goto('/admin');
}

function settingsRow(page: Page) {
  return page
    .getByRole('region', { name: '新建账号的默认授权' })
    .getByRole('switch', { name: '受邀新账号默认可创建工作区' });
}

test('the admin entry redirects to the settings route', async ({ page }) => {
  await openSiteSettings(page);
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await expect(page.getByRole('main', { name: '站点管理' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: '新建账号的默认授权' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: '尚未接入的设置' })).toBeVisible();
});

test('settings that are not wired up render no interactive control', async ({
  page,
}) => {
  await openSiteSettings(page);
  await expect(
    page.getByRole('region', { name: '尚未接入的设置' }),
  ).toBeVisible();
  // One switch on the whole page: the single implemented setting. Anything
  // more would be a control that cannot take effect.
  await expect(page.locator('[role=switch],input[type=checkbox]')).toHaveCount(1);
  // No select/combobox anywhere: registration mode has no editable control.
  await expect(
    page.locator('[role=combobox],[role=listbox],select'),
  ).toHaveCount(0);
  // The unavailable state is carried by words, not by greying things out.
  await expect(page.getByText('未接入', { exact: true })).toHaveCount(3);
  for (const name of ['注册模式', '普通 owner 邀请新用户', '公开注册新账号默认创建授权']) {
    await expect(
      page.getByRole('region', { name: '尚未接入的设置' }).getByRole('heading', { name }),
    ).toBeVisible();
  }
});

test('toggling a setting saves it and survives a reload', async ({ page }) => {
  await openSiteSettings(page);
  const toggle = settingsRow(page);
  const before = await toggle.isChecked();
  // Keyboard, not a synthetic click on the input: Mantine's decorative track
  // sits above it, and DESIGN.md makes keyboard reachability a hard constraint.
  await toggle.press('Space');
  await expect(page.getByText('站点设置已保存', { exact: true })).toBeVisible();
  await expect(toggle).toBeChecked({ checked: !before });
  await expect(toggle).toBeEnabled();
  // Reload rather than trusting the local copy: the server is the only source
  // of truth for what the next invited account will be allowed to do.
  await page.reload();
  await expect(settingsRow(page)).toBeChecked({ checked: !before });
  await expect(page.getByText('尚未生效', { exact: true })).toHaveCount(0);
});

test('a failed save keeps the chosen value and offers a way forward', async ({
  page,
}) => {
  await openSiteSettings(page);
  const toggle = settingsRow(page);
  const before = await toggle.isChecked();
  await page.route(SETTINGS_API, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    return route.fulfill({
      status: 500,
      json: { error: { code: 'INTERNAL', message: 'boom' } },
    });
  });
  await toggle.press('Space');
  const alert = page
    .getByRole('region', { name: '新建账号的默认授权' })
    .getByRole('alert');
  await expect(alert).toContainText('操作未完成，请检查网络后重试。');
  // Silently snapping the switch back would hide that the change did not land.
  await expect(toggle).toBeChecked({ checked: !before });
  await expect(page.getByText('尚未生效', { exact: true })).toBeVisible();
  await expect(alert).toContainText(/服务端当前值：/);
  const retry = alert.getByRole('button', { name: '重试', exact: true });
  const useServer = alert.getByRole('button', { name: '使用服务端当前值' });
  await expect(retry).toBeVisible();
  await expect(useServer).toBeVisible();

  // Failure must not be a dead end: the same choice succeeds once the server
  // recovers.
  await page.unroute(SETTINGS_API);
  await retry.click();
  await expect(page.getByText('站点设置已保存', { exact: true })).toBeVisible();
  await expect(page.getByText('尚未生效', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(settingsRow(page)).toBeChecked({ checked: !before });
});

test('a revision conflict asks the admin instead of overwriting silently', async ({
  page,
}) => {
  await openSiteSettings(page);
  const toggle = settingsRow(page);
  const before = await toggle.isChecked();
  let patches = 0;
  await page.route(SETTINGS_API, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches++;
    return route.fulfill({
      status: 409,
      json: {
        error: {
          code: 'REVISION_CONFLICT',
          message: 'revision mismatch',
        },
      },
    });
  });
  await toggle.press('Space');
  const dialog = page.getByRole('dialog');
  // The dialog's own 关闭 sits next to the title-bar close button that shares
  // its accessible name, so target the modal content rather than the dialog.
  const dialogContent = page.locator('.mantine-Modal-content');
  await expect(dialog).toContainText('站点设置已被其他管理员修改');
  await expect(dialog.getByText('你的修改', { exact: true })).toBeVisible();
  await expect(dialog.getByText('服务端当前值', { exact: true })).toBeVisible();
  await expect(dialogContent.getByRole('button', { name: '使用服务端当前值' })).toBeVisible();
  // Filter on text so the icon-only title-bar close button, whose accessible
  // name is also 关闭, cannot be mistaken for the dialog's own action.
  const closeAction = dialogContent.getByRole('button').filter({ hasText: '关闭' });
  await expect(closeAction).toBeVisible();
  // Neither a silent retry nor a silent overwrite: exactly one write was sent.
  await page.waitForTimeout(500);
  expect(patches).toBe(1);
  // The other admin's value is the one the server still holds, so it — not the
  // rejected draft — is what the comparison column shows.
  await expect(
    dialog.getByText(before ? '不允许' : '允许', { exact: true }),
  ).toBeVisible();

  await closeAction.click();
  await expect(dialog).toHaveCount(0);
  await page.unroute(SETTINGS_API);
  // Closing keeps the draft so the admin can decide again; the server value is
  // untouched until they submit.
  await expect(toggle).toBeChecked({ checked: !before });
  await page.reload();
  await expect(settingsRow(page)).toBeChecked({ checked: before });
});

test('a non-admin sees a plain refusal and no settings data', async ({
  page,
  browser,
}) => {
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
    await memberPage.goto(`${BASE_URL}/admin/settings`);
    await expect(memberPage.getByText('没有站点管理权限')).toBeVisible();
    await expect(
      memberPage.getByText('此页面仅站点管理员可访问。'),
    ).toBeVisible();
    // A refusal must not leak the shape or the values of what is protected.
    await expect(
      memberPage.getByText('新建账号的默认授权', { exact: true }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByText('尚未接入的设置', { exact: true }),
    ).toHaveCount(0);
    await expect(memberPage.getByText('未接入', { exact: true })).toHaveCount(0);
    await expect(
      memberPage.locator('[role=switch],input[type=checkbox]'),
    ).toHaveCount(0);
    // Retrying cannot change an authorization decision, so it is not offered.
    await expect(memberPage.getByRole('button', { name: '重试' })).toHaveCount(0);

    // The entry point itself is offered by the session snapshot, so a plain
    // account must not even be pointed at the page.
    await memberPage.goto(`${BASE_URL}/workspaces`);
    await memberPage
      .getByRole('button', { name: '账号菜单', exact: true })
      .click();
    await expect(memberPage.getByRole('menuitem')).toHaveText([
      '设置',
      '退出登录',
    ]);
  } finally {
    await memberContext.close();
  }
});