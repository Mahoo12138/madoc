import { expect, test } from '@playwright/test';
import { accountHeaders } from './helpers/account';
import { openDocument } from './helpers/writing';

test('owners can revoke pending invites and confirm role changes and removals', async ({
  page,
  browser,
}) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const pending = await (
    await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
      headers,
      data: { email: `pending-${Date.now()}@example.test`, role: 'viewer' },
    })
  ).json();

  const inviteResponse = await page.request.post(
    `/api/workspaces/${workspaceId}/invites`,
    {
      headers,
      data: { email: `member-${Date.now()}@example.test`, role: 'editor' },
    },
  );
  expect(inviteResponse.ok()).toBeTruthy();
  const invitation = await inviteResponse.json();
  const memberContext = await browser.newContext();
  try {
    const accepted = await memberContext.request.post(
      `http://127.0.0.1:3100/api/invites/${invitation.token}/accept`,
      {
        data: { name: 'Managed Member', password: 'password123' },
      },
    );
    expect(accepted.ok()).toBeTruthy();
    const { user } = await accepted.json();

    await page.getByRole('button', { name: '工作区菜单' }).click();
    await page.getByRole('menuitem', { name: '管理' }).click();
    await page
      .getByRole('navigation', { name: '工作区管理导航' })
      .getByRole('button', { name: '成员管理' })
      .click();
    const drawer = page.getByRole('main', { name: '工作区管理' });
    await drawer.getByRole('tab', { name: '邀请' }).click();
    const pendingCard = drawer
      .locator('.mantine-Paper-root')
      .filter({ hasText: pending.invite.email });
    await pendingCard.getByRole('button', { name: '撤销' }).click();
    const revokeDialog = page.getByRole('dialog', { name: '确认撤销邀请' });
    await expect(revokeDialog).toContainText('原邀请链接将立即失效');
    await page.keyboard.press('Escape');
    await expect(revokeDialog).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await pendingCard.getByRole('button', { name: '撤销' }).click();
    await revokeDialog.getByRole('button', { name: '撤销邀请' }).click();
    await expect(pendingCard).toContainText('已撤销');
    expect(
      (await page.request.get(`/api/invites/${pending.token}`)).status(),
    ).toBe(409);

    await drawer.getByRole('tab', { name: '成员' }).click();
    await page.screenshot({
      path: '/tmp/madoc-management-members.png',
      animations: 'disabled',
    });
    const memberCard = drawer
      .locator('.mantine-Paper-root')
      .filter({ hasText: user.name });
    await expect(memberCard.getByText('编辑者', { exact: true })).toBeVisible();
    await memberCard.getByRole('button', { name: '编辑角色' }).click();
    const memberRole = memberCard.getByRole('textbox');
    await expect(memberRole).toHaveValue('编辑者');
    await memberRole.click();
    await page.getByRole('option', { name: '查看者' }).click();
    const roleDialog = page.getByRole('dialog', { name: '确认调整角色' });
    await expect(roleDialog).toContainText('角色变更会立即生效');
    await roleDialog.getByRole('button', { name: '确认调整' }).click();
    await expect(memberCard.getByText('查看者', { exact: true })).toBeVisible();

    await memberCard.getByRole('button', { name: `移除 ${user.name}` }).click();
    const removeDialog = page.getByRole('dialog', { name: '确认移除成员' });
    await expect(removeDialog).toContainText('立即失去此工作区访问权限');
    await removeDialog.getByRole('button', { name: '移除成员' }).click();
    await expect(memberCard).toHaveCount(0);
    const members = await (
      await page.request.get(`/api/workspaces/${workspaceId}/members`)
    ).json();
    expect(
      members.some((member: { userId: string }) => member.userId === user.id),
    ).toBe(false);
  } finally {
    await memberContext.close();
  }
});

test('one-time invite link survives section navigation until leaving management', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDocument(page);
  const documentURL = page.url();
  await page.getByRole('button', { name: '工作区菜单' }).click();
  await page.getByRole('menuitem', { name: '管理' }).click();
  const management = page.getByRole('main', { name: '工作区管理' });
  const navigation = page.getByRole('navigation', { name: '工作区管理导航' });
  await navigation.getByRole('button', { name: '成员管理' }).click();
  await management.getByRole('tab', { name: '邀请' }).click();
  await management.getByRole('button', { name: '创建邀请' }).click();
  const createDialog = page.getByRole('dialog', { name: '创建邀请' });
  await createDialog
    .getByRole('textbox', { name: '邀请邮箱' })
    .fill(`navigation-${Date.now()}@example.test`);
  await createDialog.getByRole('button', { name: '创建链接' }).click();
  const inviteLink = management.getByRole('textbox', { name: '邀请链接' });
  await expect(inviteLink).toHaveValue(/\/invite\//);
  const url = await inviteLink.inputValue();

  await navigation.getByRole('button', { name: '活动记录' }).click();
  await expect(
    management.getByRole('heading', { name: '活动记录', exact: true }),
  ).toBeVisible();
  await navigation.getByRole('button', { name: '成员管理' }).click();
  await management.getByRole('tab', { name: '邀请' }).click();
  await expect(inviteLink).toHaveValue(url);
  await management.getByRole('button', { name: '复制邀请链接' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(url);

  await management.getByRole('button', { name: '返回工作区' }).click();
  await expect(page).toHaveURL(documentURL);
  await page.getByRole('button', { name: '工作区菜单' }).click();
  await page.getByRole('menuitem', { name: '管理' }).click();
  await page
    .getByRole('navigation', { name: '工作区管理导航' })
    .getByRole('button', { name: '成员管理' })
    .click();
  await management.getByRole('tab', { name: '邀请' }).click();
  await expect(inviteLink).toHaveCount(0);
});
