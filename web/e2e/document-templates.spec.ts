import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

for (const template of ['技术设计', '会议纪要']) {
  test(`creates editable ${template} without repeating initial content across tabs`, async ({
    page,
    context,
  }) => {
    await openDocument(page, 'Existing source');
    await page.getByRole('button', { name: '新建内容' }).click();
    await page.getByRole('menuitem', { name: '文档', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建文档' });
    await dialog.getByLabel('名称', { exact: true }).fill(`${template}实例`);
    await dialog.getByLabel('初始内容').click();
    await page.getByRole('option', { name: template, exact: true }).click();
    await expect(dialog.getByLabel('模板预览')).toHaveAttribute('readonly', '');
    await expect(dialog.getByLabel('模板预览')).toContainText(template);
    const create = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url().endsWith('/items'),
    );
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    const payload = (await create).postDataJSON();
    expect(payload.initialMarkdown.snapshot.length).toBeGreaterThan(10);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.ProseMirror h1')).toHaveText(template);
    const url = page.url();
    const peer = await context.newPage();
    await peer.goto(url);
    await expect(peer.locator('.ProseMirror h1')).toHaveText(template);
    await expect(page.locator('.ProseMirror h1')).toHaveCount(1);
    await peer.locator('.ProseMirror').click();
    await peer.keyboard.press('ControlOrMeta+End');
    await peer.keyboard.insertText(' Shared addition');
    await expect(page.locator('.ProseMirror')).toContainText('Shared addition');
    await page.reload();
    await expect(page.locator('.ProseMirror h1')).toHaveText(template);
    await expect(page.locator('.ProseMirror')).toContainText('Shared addition');
    await peer.close();
  });
}

test('mobile template creation retains input on failure and closes navigation on success', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDocument(page);
  await page.getByRole('button', { name: '打开内容导航' }).click();
  await page.getByRole('button', { name: '新建内容' }).click();
  await page.getByRole('menuitem', { name: '文档', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建文档' });
  await dialog
    .getByLabel('名称', { exact: true })
    .fill('Retained template name');
  await dialog.getByLabel('初始内容').click();
  await page.getByRole('option', { name: '会议纪要', exact: true }).click();
  await page.route('**/items', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 500,
        json: { error: { code: 'TEST', message: '创建失败，请重试' } },
      });
    else await route.continue();
  });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('创建失败');
  await expect(dialog.getByLabel('名称', { exact: true })).toHaveValue(
    'Retained template name',
  );
  await expect(dialog.getByLabel('初始内容')).toHaveValue('会议纪要');
  await page.unroute('**/items');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ProseMirror h1')).toHaveText('会议纪要');
});
