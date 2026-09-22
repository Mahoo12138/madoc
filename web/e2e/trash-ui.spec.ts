import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

for (const mobile of [false, true]) {
  test(`trash restoration and permanent confirmation ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await openDocument(page);
    const workspace = new URL(page.url()).pathname.split('/')[2];
    const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
    const create = async (
      title: string,
      type: string,
      parentId: string | null = null,
    ) => {
      const response = await page.request.post(
        `/api/workspaces/${workspace}/items`,
        { headers, data: { title, type, parentId } },
      );
      expect(response.ok()).toBeTruthy();
      return response.json();
    };
    const folder = await create('Deleted parent', 'folder');
    const child = await create('Separate child', 'markdown', folder.id);
    await page.request.delete(`/api/items/${child.id}`, { headers });
    await page.request.delete(`/api/items/${folder.id}`, { headers });
    await page.reload();
    if (!mobile)
      await page.getByRole('button', { name: 'Workspace 菜单' }).click();
    await page
      .getByRole(mobile ? 'button' : 'menuitem', {
        name: '回收站',
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog', { name: '回收站' });
    const batch = dialog.getByRole('group', {
      name: '删除批次：Separate child',
    });
    await batch.getByRole('button', { name: '查看内容' }).click();
    await expect(
      batch.getByText('Separate child', { exact: true }),
    ).toHaveCount(2);
    await page.screenshot({
      path: testInfo.outputPath('trash.png'),
      fullPage: true,
    });
    await batch.getByRole('button', { name: '恢复', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('原目录不可用');
    await expect(
      dialog.getByRole('button', { name: '确认恢复' }),
    ).toBeDisabled();
    await dialog.getByLabel('恢复位置').click();
    await page.getByRole('option', { name: 'Workspace 根目录' }).click();
    await dialog.getByRole('button', { name: '确认恢复' }).click();
    await expect(batch).toHaveCount(0);
    expect(
      (await (await page.request.get(`/api/items/${child.id}`)).json())
        .parentId,
    ).toBeNull();
    await dialog
      .getByRole('group', { name: '删除批次：Deleted parent' })
      .getByRole('button', { name: '彻底删除' })
      .click();
    const purge = dialog.getByRole('button', { name: '确认永久删除' });
    await expect(purge).toBeDisabled();
    await dialog.getByLabel('输入完整名称以确认').fill('Deleted');
    await expect(purge).toBeDisabled();
    await dialog.getByLabel('输入完整名称以确认').fill('Deleted parent');
    await page.route('**/trash/*', async (route) => {
      if (route.request().method() === 'DELETE')
        await route.fulfill({
          status: 500,
          json: { error: { code: 'TEST', message: 'failure' } },
        });
      else await route.continue();
    });
    await purge.click();
    await expect(dialog.getByRole('alert')).toContainText('操作未完成');
    await expect(dialog.getByLabel('输入完整名称以确认')).toHaveValue(
      'Deleted parent',
    );
    await page.unroute('**/trash/*');
    await purge.click();
    await expect(dialog.getByText('回收站为空')).toBeVisible();
    expect(
      (await page.request.get(`/api/items/${child.id}`)).ok(),
    ).toBeTruthy();
  });
}
