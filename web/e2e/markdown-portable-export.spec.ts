import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { openDocument } from './helpers/writing';

const assetID = '8e1d4c7b-a9be-4c90-8c86-a43be9df7c11';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7xoAAAAASUVORK5CYII=', 'base64');

test('portable export packages confirmed Markdown with relative Madoc assets and records its watermark', async ({ page }) => {
  await page.route(`**/api/assets/${assetID}`, route => route.fulfill({ status: 200, contentType: 'image/png', body: image }));
  const id = await openDocument(page, `![图表](/api/assets/${assetID} "说明")\n\n![外部图片](https://example.com/diagram.png)\n\n\`\`\`text\n![代码示例](/api/assets/${assetID})\n\`\`\`\n\n行内代码：\`![代码行内](/api/assets/${assetID})\``);
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Markdown 和附件 ZIP' }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe('Inline writing.zip');

  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const markdown = strFromU8(files['Inline writing.md']);
  expect(markdown).toContain(`![图表](assets/asset-${assetID}.png "说明")`);
  expect(markdown).toContain('![外部图片](https://example.com/diagram.png)');
  expect(markdown).toContain(`![代码示例](/api/assets/${assetID})`);
  expect(markdown).toContain(`\`![代码行内](/api/assets/${assetID})\``);
  expect(Buffer.from(files[`assets/asset-${assetID}.png`]).equals(image)).toBe(true);

  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as {
    format: string;
    item: { id: string; title: string };
    content: { generation: number; seq: number; exportedAt: string };
    markdown: string;
    attachments: { id: string; source: string; path: string; mime: string; size: number }[];
    unpackagedImages: string[];
  };
  expect(manifest.format).toBe('madoc-markdown-package');
  expect(manifest.item).toEqual({ id, title: 'Inline writing' });
  expect(manifest.content.generation).toBe(1);
  expect(manifest.content.seq).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(manifest.content.exportedAt))).toBe(false);
  expect(manifest.markdown).toBe('Inline writing.md');
  expect(manifest.attachments).toEqual([{ id: assetID, source: `/api/assets/${assetID}`, path: `assets/asset-${assetID}.png`, mime: 'image/png', size: image.length }]);
  expect(manifest.unpackagedImages).toEqual(['https://example.com/diagram.png']);
  await expect(page.getByText('导出完成，包含 1 个 Madoc 附件；1 个外部或相对图片仍使用原地址。')).toBeVisible();

  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  const packagePath = await download.path();
  expect(packagePath).toBeTruthy();
  await page.locator('aside').getByRole('button', { name: '新建内容' }).click();
  await page.getByRole('menuitem', { name: '导入内容包' }).click();
  const importDialog = page.getByRole('dialog', { name: '导入内容包', exact: true });
  await importDialog.locator('input[type=file]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/zip',
    buffer: await readFile(packagePath!),
  });
  await expect(importDialog).toContainText('导入包校验通过');
  await expect(importDialog).toContainText('包内根目录：Inline writing');
  await expect(importDialog.getByRole('table')).toContainText('Inline writing.md');
  await importDialog.getByRole('textbox', { name: '新目录名称' }).fill('Restored note');
  await importDialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(importDialog).toContainText('导入完成');
  await importDialog.getByRole('button', { name: '完成', exact: true }).click();
  const imported = await (await page.request.get(`/api/workspaces/${workspaceId}/items`)).json();
  const importedRoot = imported.find((item: { title: string }) => item.title === 'Restored note');
  const importedMarkdown = imported.find((item: { title: string; parentId: string }) => item.title === 'Inline writing' && item.parentId === importedRoot.id);
  await page.goto(`/workspace/${workspaceId}/${importedMarkdown.id}`);
  const importedImage = page.locator('.ProseMirror img').first();
  await expect(importedImage).toHaveAttribute('alt', '图表');
  const importedImageURL = await importedImage.getAttribute('src');
  expect(importedImageURL).toMatch(/^\/api\/assets\/[0-9a-f-]+$/i);
  expect(importedImageURL).not.toBe(`/api/assets/${assetID}`);
  expect(await (await page.request.get(importedImageURL!)).body()).toEqual(image);
  expect(await (await page.request.get(`/api/items/${importedMarkdown.id}/export.md`)).text()).toContain(
    'https://example.com/diagram.png',
  );

  // The same validator must reject a declared attachment with no ZIP bytes.
  const missingAssetEntries = { ...files };
  delete missingAssetEntries[`assets/asset-${assetID}.png`];
  await page.goto(`/workspace/${workspaceId}/${id}`);
  await page.locator('aside').getByRole('button', { name: '新建内容' }).click();
  await page.getByRole('menuitem', { name: '导入内容包' }).click();
  const invalidDialog = page.getByRole('dialog', { name: '导入内容包', exact: true });
  const brokenArchive = Buffer.from(zipSync(Object.fromEntries(Object.entries(missingAssetEntries).map(([name, bytes]) => [name, bytes!]))));
  await invalidDialog.locator('input[type=file]').setInputFiles({ name: 'broken.zip', mimeType: 'application/zip', buffer: brokenArchive });
  await expect(invalidDialog.getByRole('alert')).toContainText('附件缺失');
  expect((await page.request.get(`/api/workspaces/${workspaceId}/items`)).status()).toBe(200);
});

test('portable export fails without downloading a package when a Madoc attachment is missing', async ({ page }) => {
  await page.route(`**/api/assets/${assetID}`, route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await openDocument(page, `![缺失图片](/api/assets/${assetID})`);
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.getByRole('button', { name: '导出 Markdown 和附件 ZIP' }).click();
  await expect(page.getByRole('alert')).toContainText('已不存在，未生成不完整的导出包');
  expect(downloads).toBe(0);
});
