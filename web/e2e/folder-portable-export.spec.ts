import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openDocument } from './helpers/writing';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=', 'base64');

test('folder ZIP captures nested Markdown, whiteboard, image assets and stable links', async ({ page }) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2]!;
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  const create = async (type: 'folder' | 'markdown' | 'whiteboard', title: string, parentId: string | null) => {
    const response = await page.request.post(`/api/workspaces/${workspaceId}/items`, { headers, data: { type, title, parentId } });
    expect(response.ok()).toBeTruthy();
    return response.json() as Promise<{ id: string }>;
  };
  const root = await create('folder', 'Design', null);
  const nested = await create('folder', 'Notes', root.id);
  const markdown = await create('markdown', 'System', nested.id);
  const markdown2 = await create('markdown', 'System', nested.id);
  const board = await create('whiteboard', 'Architecture', root.id);
  const upload = await page.request.post(`/api/workspaces/${workspaceId}/assets`, {
    headers,
    multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: png }, itemId: markdown.id },
  });
  expect(upload.ok()).toBeTruthy();
  const asset = (await upload.json()).asset as { id: string };
  const source = [
    '# Design', '', `![pixel](/api/assets/${asset.id})`, '',
    `[board](http://127.0.0.1:3100/workspace/${workspaceId}/${board.id})`, '',
    '```md', `![example](/api/assets/${asset.id})`, '```', '',
  ].join('\n');
  for (const id of [markdown.id, markdown2.id]) {
    const response = await page.request.put(`/api/items/${id}/markdown`, { headers, data: { snapshot: '', markdown: source } });
    expect(response.ok()).toBeTruthy();
  }

  await page.reload();
  await page.getByRole('button', { name: 'Design 的操作' }).click();
  await page.getByRole('menuitem', { name: '导出文件夹 ZIP' }).click();
  const dialog = page.getByRole('dialog', { name: '导出文件夹：Design' });
  await expect(dialog).toContainText('不是文件夹同一时刻的快照');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '生成 ZIP' }).click();
  const download = await downloadPromise;
  const archive = unzipSync(new Uint8Array(await readFile(await download.path())));
  const manifest = JSON.parse(strFromU8(archive['manifest.json']!));
  expect(manifest.consistency).toBe('per-item-capture; not a workspace-wide atomic snapshot');
  expect(manifest.items.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([markdown.id, markdown2.id, board.id]));

  const first = manifest.items.find((item: { id: string }) => item.id === markdown.id);
  const second = manifest.items.find((item: { id: string }) => item.id === markdown2.id);
  const boardEntry = manifest.items.find((item: { id: string }) => item.id === board.id);
  expect(first.path).toBe('Design/Notes/System.md');
  expect(second.path).toBe('Design/Notes/System (2).md');
  expect(boardEntry.path).toBe('Design/Architecture.excalidraw');
  const exportedMarkdown = strFromU8(archive[first.path]!);
  expect(exportedMarkdown).toContain('![pixel](../../assets/asset-' + asset.id + '.png)');
  expect(exportedMarkdown).toContain('[board](../Architecture.excalidraw)');
  expect(exportedMarkdown).toContain('![example](/api/assets/' + asset.id + ')');
  const packedAsset = manifest.attachments[0];
  expect(Buffer.from(archive[packedAsset.path]!)).toEqual(png);
  expect(JSON.parse(strFromU8(archive[boardEntry.path]!))).toEqual({ type: 'excalidraw', version: 2, source: 'https://excalidraw.com', elements: [], appState: {}, files: {} });

  await page.goto(`/workspace/${workspaceId}/${board.id}`);
  await expect(page.getByRole('button', { name: '导出' })).toBeVisible();
  await page.getByRole('button', { name: '导出' }).click();
  await page.getByRole('menuitem', { name: '导入 Excalidraw JSON' }).click();
  await page.locator('input[type="file"][accept=".excalidraw,application/json"]').setInputFiles({
    name: 'Architecture.excalidraw', mimeType: 'application/json', buffer: Buffer.from(archive[boardEntry.path]!),
  });
  const importDialog = page.getByRole('dialog', { name: '导入 Excalidraw 预览' });
  await expect(importDialog).toContainText('元素：0');
  await importDialog.getByRole('button', { name: '创建为新白板' }).click();
  await expect(importDialog).toHaveCount(0);
  const importedBoardId = new URL(page.url()).pathname.split('/').at(-1)!;
  expect(importedBoardId).not.toBe(board.id);
  expect((await (await page.request.get(`/api/items/${importedBoardId}/whiteboard`)).json()).scene).toEqual({ elements: [], appState: {}, files: {} });

  const deleteAsset = await page.request.delete(`/api/assets/${asset.id}`, { headers });
  expect(deleteAsset.ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Design 的操作' }).click();
  await page.getByRole('menuitem', { name: '导出文件夹 ZIP' }).click();
  const retryDialog = page.getByRole('dialog', { name: '导出文件夹：Design' });
  const noDownload = page.waitForEvent('download', { timeout: 1500 }).catch(() => undefined);
  await retryDialog.getByRole('button', { name: '生成 ZIP' }).click();
  await expect(retryDialog.getByRole('alert')).toContainText('已不存在');
  expect(await noDownload).toBeUndefined();
});
