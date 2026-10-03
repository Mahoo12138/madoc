import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

test('workspace role labels are localized while API role values remain unchanged', async ({
  page,
}) => {
  await openDocument(page);
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const invite = await page.request.post(
    `/api/workspaces/${workspace}/invites`,
    {
      headers,
      data: { email: 'localized-viewer@example.test', role: 'viewer' },
    },
  );
  expect(invite.ok()).toBeTruthy();

  await page.goto('/workspaces');
  await expect(page.getByText('所有者', { exact: true }).first()).toBeVisible();
  await page.goto(`/workspace/${workspace}`);
  await page.getByRole('button', { name: '工作区菜单' }).click();
  await page.getByRole('menuitem', { name: '管理' }).click();
  await page
    .getByRole('navigation', { name: '工作区管理导航' })
    .getByRole('button', { name: '成员管理' })
    .click();

  const drawer = page.getByRole('main', { name: '工作区管理' });
  await expect(drawer.getByText('所有者', { exact: true })).toBeVisible();
  await drawer.getByRole('tab', { name: '邀请' }).click();
  const pendingInvite = drawer.getByRole('group', {
    name: '邀请：localized-viewer@example.test',
  });
  await expect(pendingInvite).toContainText('查看者');
  await expect(pendingInvite).toContainText('待接受');
  await drawer.getByRole('button', { name: '创建邀请' }).click();
  const inviteDialog = page.getByRole('dialog', { name: '创建邀请' });
  const roleSelect = inviteDialog.getByRole('textbox', { name: '邀请角色' });
  await roleSelect.click();
  await expect(page.getByRole('option', { name: '编辑者' })).toBeVisible();
  await expect(page.getByRole('option', { name: '查看者' })).toBeVisible();
  await expect(inviteDialog).toContainText('可创建、编辑和管理工作区内容。');
  await page.getByRole('option', { name: '查看者' }).click();
  await expect(inviteDialog).toContainText('仅可查看工作区内容，不能修改。');
});
