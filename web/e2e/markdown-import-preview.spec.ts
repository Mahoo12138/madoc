import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

const importedMarkdown = '# Imported heading\n\nKeep **bold text** and a footnote[^source].\n\n[^source]: Footnote content';

test('Markdown import previews the file and creates a new document without replacing the current one', async ({ page }) => {
  const sourceID = await openDocument(page, 'Original document stays intact');
  await page.locator('input[type="file"][accept=".md,.markdown,text/markdown"]').setInputFiles({
    name: 'Imported note.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(importedMarkdown),
  });

  const dialog = page.getByRole('dialog', { name: '导入 Markdown 预览' });
  await expect(dialog.getByLabel('新文档名称')).toHaveValue('Imported note');
  await expect(dialog.getByLabel('内容预览')).toHaveValue(importedMarkdown);
  await expect(dialog).toContainText('不会覆盖当前文档');
  await expect(dialog).toContainText('不包含图片附件');
  expect((await (await page.request.get(`/api/items/${sourceID}/export.md`)).text()).trimEnd()).toBe('Original document stays intact');

  await dialog.getByRole('button', { name: '创建为新文档' }).click();
  await expect(dialog).toHaveCount(0);
  const importedID = new URL(page.url()).pathname.split('/').at(-1)!;
  expect(importedID).not.toBe(sourceID);
  await expect(page.getByLabel('文档标题')).toHaveValue('Imported note');
  await expect(page.locator('.ProseMirror h1')).toHaveText('Imported heading');
  await expect(page.locator('.ProseMirror')).toContainText('Footnote content');
  await expect.poll(async () => (await page.request.get(`/api/items/${importedID}/export.md`)).status()).toBe(200);
  const exported = await (await page.request.get(`/api/items/${importedID}/export.md`)).text();
  expect(exported).toContain('Keep **bold text**');
  expect(exported).toContain('[^source]: Footnote content');
  expect((await (await page.request.get(`/api/items/${sourceID}/export.md`)).text()).trimEnd()).toBe('Original document stays intact');
});

test('failed Markdown import keeps the preview and title for retry', async ({ page }) => {
  await openDocument(page, 'Source remains unchanged');
  await page.locator('input[type="file"][accept=".md,.markdown,text/markdown"]').setInputFiles({
    name: 'Retry me.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Retry content'),
  });
  const dialog = page.getByRole('dialog', { name: '导入 Markdown 预览' });
  await dialog.getByLabel('新文档名称').fill('Kept import title');
  await page.route('**/api/workspaces/*/items', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 500, json: { error: { code: 'TEST', message: '创建失败，请重试' } } });
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: '创建为新文档' }).click();
  await expect(dialog.getByRole('alert')).toContainText('创建失败');
  await expect(dialog.getByLabel('新文档名称')).toHaveValue('Kept import title');
  await expect(dialog.getByLabel('内容预览')).toHaveValue('# Retry content');
  await page.unroute('**/api/workspaces/*/items');
  await dialog.getByRole('button', { name: '创建为新文档' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('文档标题')).toHaveValue('Kept import title');
  await expect(page.locator('.ProseMirror h1')).toHaveText('Retry content');
});

test('oversized Markdown is rejected before loading or creating content', async ({ page }) => {
  const sourceID = await openDocument(page, 'Keep this source');
  await page.locator('input[type="file"][accept=".md,.markdown,text/markdown"]').setInputFiles({
    name: 'Too large.md',
    mimeType: 'text/markdown',
    buffer: Buffer.alloc(2 * 1024 * 1024, 0x61),
  });
  const dialog = page.getByRole('dialog', { name: '导入 Markdown 预览' });
  await expect(dialog.getByRole('alert')).toContainText('超过当前 2 MiB 请求上限');
  await expect(dialog.getByRole('button', { name: '创建为新文档' })).toBeDisabled();
  expect((await (await page.request.get(`/api/items/${sourceID}/export.md`)).text()).trimEnd()).toBe('Keep this source');
});
