import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

// The workspace shell, the account settings page and the workspace management
// page all mutate server state through dialogs. These cover the recovery paths
// that used to be silent: a failed mutation left the user staring at a dialog
// that looked busy, and destructive actions used the browser's own confirm().

async function openRenameDialog(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '工作区菜单' }).click();
  await page.getByRole('menuitem', { name: '管理' }).click();
}

test('a failed rename keeps the dialog, the draft and an explanation', async ({
  page,
}) => {
  await openDocument(page);
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '重命名' });
  const field = dialog.getByRole('textbox', { name: '名称' });
  await field.fill('重命名后的草稿');
  let attempts = 0;
  await page.route('**/api/items/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    attempts++;
    return route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'upstream down' } },
    });
  });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('重命名未完成');
  // The draft must survive so a retry does not cost the user's typing.
  await expect(field).toHaveValue('重命名后的草稿');
  await expect(dialog).toBeVisible();
  // Let the route through so the retry proves the dialog recovers.
  await page.unroute('**/api/items/*');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Only the mocked attempt is counted; the retry goes to the real endpoint.
  expect(attempts).toBe(1);
  await expect(page.getByLabel('文档标题', { exact: true })).toHaveValue(
    '重命名后的草稿',
  );
});

test('an over-long title is rejected before any request is sent', async ({
  page,
}) => {
  await openDocument(page);
  let writes = 0;
  await page.route('**/api/items/*', async (route) => {
    if (route.request().method() === 'PATCH') writes++;
    return route.continue();
  });
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '重命名' });
  const field = dialog.getByRole('textbox', { name: '名称' });
  await field.fill('长'.repeat(121));
  // Validation belongs to the field, so it is not an alert region.
  await expect(dialog.getByText(/名称不能超过 120 个字符/)).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  await field.fill('长短合适的名称');
  await expect(dialog.getByText(/名称不能超过/)).toHaveCount(0);
  expect(writes).toBe(0);
  await page.unroute('**/api/items/*');
});

test('repeated activation of the rename dialog cannot double-submit', async ({
  page,
}) => {
  await openDocument(page);
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '重命名' });
  await dialog.getByRole('textbox', { name: '名称' }).fill('并发名称');
  let requests = 0;
  await page.route('**/api/items/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return route.continue();
  });
  const save = dialog.getByRole('button', { name: '保存', exact: true });
  await Promise.all([save.click(), save.click(), save.click()]);
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
  expect(requests).toBe(1);
  await page.unroute('**/api/items/*');
});

test('deleting content uses an in-app confirmation that reports failure', async ({
  page,
}) => {
  await openDocument(page);
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.dismiss();
  });
  const treeRow = page.getByRole('button', { name: /Inline writing/ }).first();
  await treeRow.hover();
  await page
    .getByRole('button', { name: 'Inline writing 的操作' })
    .click();
  await page.getByRole('menuitem', { name: /移入回收站|删除/ }).first().click();
  const dialog = page.getByRole('dialog', { name: '移入回收站' });
  await expect(dialog).toBeVisible();
  // The native confirm() would have produced a 'confirm' page dialog instead.
  expect(dialogs).toEqual([]);
  await page.route('**/api/items/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    return route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'down' } },
    });
  });
  await dialog.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('未完成');
  // A failed delete must keep the entry reachable rather than dropping it.
  await expect(treeRow).toBeVisible();
  await page.unroute('**/api/items/*');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('the delete confirmation stays inside the viewport for a very long name', async ({
  page,
}) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const name = '工作区'.repeat(40);
  expect(
    (
      await page.request.patch(`/api/workspaces/${workspaceId}`, {
        headers,
        data: { name },
      })
    ).ok(),
  ).toBeTruthy();
  await openRenameDialog(page);
  await page
    .getByRole('navigation', { name: '工作区管理导航' })
    .getByRole('button', { name: '工作区信息' })
    .click();
  await page.getByRole('button', { name: '删除工作区', exact: true }).click();
  const confirm = page.getByRole('textbox', {
    name: '输入工作区名称以确认',
  });
  await expect(confirm).toBeVisible();
  await confirm.fill('工');
  await expect(
    page.getByText('名称与上方不一致，请完整输入'),
  ).toBeVisible();
  await confirm.fill(name);
  await expect(page.getByText('名称与上方不一致，请完整输入')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.getByRole('button', { name: '取消删除' }).click();
});

test('a workspace rename explains the length rule and keeps the draft on failure', async ({
  page,
}) => {
  await openDocument(page);
  await openRenameDialog(page);
  await page.getByRole('button', { name: '编辑名称' }).click();
  const dialog = page.getByRole('dialog', { name: '编辑工作区名称' });
  const field = dialog.getByRole('textbox', { name: '工作区名称' });
  await field.fill('名'.repeat(81));
  await expect(dialog.getByText(/工作区名称不能超过 80 个字符/)).toBeVisible();
  await field.fill('改名后的工作区');
  await page.route('**/api/workspaces/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    return route.fulfill({
      status: 403,
      json: { error: { code: 'FORBIDDEN', message: 'forbidden' } },
    });
  });
  await dialog.getByRole('button', { name: '保存名称' }).click();
  await expect(dialog.getByRole('alert')).toContainText('无权管理此工作区');
  await expect(field).toHaveValue('改名后的工作区');
  await page.unroute('**/api/workspaces/*');
  await dialog.getByRole('button', { name: '取消' }).click();
});

test('member management states why a role cannot be changed instead of only disabling it', async ({
  page,
}) => {
  await openDocument(page);
  await openRenameDialog(page);
  await page
    .getByRole('navigation', { name: '工作区管理导航' })
    .getByRole('button', { name: '成员管理' })
    .click();
  const pane = page.getByRole('main', { name: '工作区管理' });
  await expect(
    pane.getByText('你不能更改或移除自己的角色。'),
  ).toBeVisible();
});

test('an invalid invite address is explained in the field before submitting', async ({
  page,
}) => {
  await openDocument(page);
  await openRenameDialog(page);
  await page
    .getByRole('navigation', { name: '工作区管理导航' })
    .getByRole('button', { name: '成员管理' })
    .click();
  await page.getByRole('tab', { name: '邀请', exact: true }).click();
  await page.getByRole('button', { name: '创建邀请' }).click();
  const dialog = page.getByRole('dialog', { name: '创建邀请' });
  const email = dialog.getByRole('textbox', { name: '邀请邮箱', exact: true });
  let posts = 0;
  await page.route('**/api/workspaces/*/invites', async (route) => {
    if (route.request().method() === 'POST') posts++;
    return route.continue();
  });
  for (const [value, message] of [
    ['a@', '请输入完整的邮箱地址'],
    ['@example.com', '请输入完整的邮箱地址'],
    ['name@example', '域名部分需要包含点号'],
    ['a b@example.com', '邮箱不能包含空格'],
  ] as const) {
    await email.fill(value);
    await expect(dialog.getByText(message)).toBeVisible();
  }
  expect(posts).toBe(0);
  await email.fill('invitee@example.com');
  await expect(
    dialog.getByRole('button', { name: '创建链接' }),
  ).toBeEnabled();
  await page.unroute('**/api/workspaces/*/invites');
  await dialog.getByRole('button', { name: '取消' }).click();
});

test('a failed member action reports a product-language reason and stays open', async ({
  page,
}) => {
  await openDocument(page);
  await openRenameDialog(page);
  await page
    .getByRole('navigation', { name: '工作区管理导航' })
    .getByRole('button', { name: '成员管理' })
    .click();
  await page.getByRole('tab', { name: '邀请', exact: true }).click();
  // Create an invite first so there is a second row this owner may act on.
  await page.getByRole('button', { name: '创建邀请' }).click();
  const create = page.getByRole('dialog', { name: '创建邀请' });
  await create.getByRole('textbox', { name: '邀请邮箱', exact: true }).fill('invitee@example.com');
  await create.getByRole('button', { name: '创建链接' }).click();
  await expect(page.getByRole('button', { name: '创建邀请' })).toBeVisible();
  const inviteRow = page
    .getByRole('group', { name: /^邀请：/ })
    .filter({ hasText: 'invitee@example.com' });
  const invitePattern = '**/api/workspaces/*/invites/*';
  await page.route(invitePattern, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    return route.fulfill({
      status: 403,
      json: { error: { code: 'FORBIDDEN', message: 'forbidden' } },
    });
  });
  await inviteRow.getByRole('button', { name: '撤销' }).click();
  const dialog = page.getByRole('dialog', { name: '确认撤销邀请' });
  await dialog.getByRole('button', { name: '撤销邀请' }).click();
  await expect(dialog.getByRole('alert')).toContainText('管理权限已被移除');
  // A raw server message would leak the English identifier here.
  await expect(dialog.getByText('forbidden')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.unroute(invitePattern);
  await dialog.getByRole('button', { name: '取消' }).click();
});

test('activity records from unordered pages keep one heading per day', async ({
  page,
}) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  await openRenameDialog(page);
  await page
    .getByRole('navigation', { name: '工作区管理导航' })
    .getByRole('button', { name: '活动记录' })
    .click();
  const headings = page.getByRole('main', { name: '工作区管理' }).getByRole('heading');
  // Day headings read "今天 / 昨天 / 2026年10月5日" — the near dates are relative,
  // so the filter has to accept both vocabularies to still target day headings.
  const dayHeading = /今天|昨天|\d+月/;
  await expect(headings.filter({ hasText: dayHeading }).first()).toBeVisible();
  // Duplicate React keys and repeated day headings both come from merging an
  // unsorted list; assert no day label appears twice.
  await expect
    .poll(async () => {
      const labels = await headings
        .filter({ hasText: dayHeading })
        .allTextContents();
      return labels.length === new Set(labels).size;
    })
    .toBe(true);
  await page.goto(`/workspace/${workspaceId}`);
});