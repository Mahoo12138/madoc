import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

test('workspace role labels are localized while API role values remain unchanged', async ({ page }) => {
  await openDocument(page);
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const invite = await page.request.post(`/api/workspaces/${workspace}/invites`, {
    headers,
    data: { email: 'localized-viewer@example.test', role: 'viewer' },
  });
  expect(invite.ok()).toBeTruthy();

  await page.goto('/workspaces');
  await expect(page.getByText('所有者', { exact: true }).first()).toBeVisible();
  await page.goto(`/workspace/${workspace}`);
  await page.getByRole('button', { name: '成员管理' }).click();

  const drawer = page.getByRole('dialog', { name: '成员与邀请' });
  await expect(drawer.getByRole('textbox').first()).toHaveValue('所有者');
  await drawer.getByRole('tab', { name: '邀请' }).click();
  await expect(drawer).toContainText('查看者 · pending');
  const roleSelect = drawer.getByRole('textbox').nth(1);
  await roleSelect.click();
  await expect(page.getByRole('option', { name: '编辑者' })).toBeVisible();
  await expect(page.getByRole('option', { name: '查看者' })).toBeVisible();
});
