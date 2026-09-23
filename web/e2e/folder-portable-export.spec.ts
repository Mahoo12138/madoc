import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openDocument } from './helpers/writing';
import { inspectPortablePackage } from '../src/features/workspaces/portable-package-inspector';
import { readPortableZip, type PortableZipLimits } from '../src/features/workspaces/portable-zip-reader';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=', 'base64');
const inspectionLimits: PortableZipLimits = { maxArchiveBytes: 25 << 20, maxExpandedBytes: 100 << 20, maxEntryBytes: 25 << 20, maxEntries: 5000 };

async function inspectExport(path: string) {
  const bytes = Uint8Array.from(await readFile(path));
  return inspectPortablePackage(await readPortableZip(new File([bytes], 'export.zip'), inspectionLimits));
}

async function downloadPackageSet(page: Page, start: () => Promise<void>) {
  const downloads: Download[] = [];
  const onDownload = (download: Download) => downloads.push(download);
  page.on('download', onDownload);
  await start();
  await expect.poll(() => downloads.some((download) => download.suggestedFilename().endsWith('.package-set.json'))).toBe(true);
  const setDownload = downloads.find((download) => download.suggestedFilename().endsWith('.package-set.json'))!;
  const packageSet = JSON.parse(await readFile(await setDownload.path(), 'utf8')) as { parts: { fileName: string }[] };
  await expect.poll(() => downloads.length).toBe(packageSet.parts.length + 1);
  page.off('download', onDownload);
  const paths = new Map<string, string>();
  for (const download of downloads) {
    const path = await download.path();
    if (!path) throw new Error(`下载未完成：${download.suggestedFilename()}`);
    paths.set(download.suggestedFilename(), path);
  }
  return { packageSet, paths };
}

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
  const downloaded = await downloadPackageSet(page, () => dialog.getByRole('button', { name: '生成 ZIP 分包' }).click());
  expect(downloaded.packageSet.format).toBe('madoc-package-set');
  expect(downloaded.packageSet.parts).toHaveLength(2);
  const parts = await Promise.all(downloaded.packageSet.parts.map(async (part) => {
    const path = downloaded.paths.get(part.fileName)!;
    const archive = unzipSync(new Uint8Array(await readFile(path)));
    const inspected = await inspectExport(path);
    expect(inspected.manifest.format).toBe('madoc-folder-package');
    return { archive, manifest: JSON.parse(strFromU8(archive['manifest.json']!)) };
  }));
  const archive = Object.assign({}, ...parts.map((part) => part.archive));
  const allItems = parts.flatMap((part) => part.manifest.items);
  const exportedIDs = allItems.map((item: { id: string }) => item.id).sort();
  const listedIDs = downloaded.packageSet.parts.flatMap((part: { itemIDs: string[] }) => part.itemIDs).sort();
  expect(parts.every((part) => part.manifest.packageSet.id === downloaded.packageSet.id && part.manifest.packageSet.partCount === 2)).toBe(true);
  expect(allItems).toHaveLength(4);
  expect(listedIDs).toEqual(exportedIDs);
  for (const [index, part] of parts.entries()) {
    expect(part.manifest.packageSet.part).toBe(index + 1);
    expect(downloaded.packageSet.parts[index]!.itemIDs.sort()).toEqual(part.manifest.items.map((item: { id: string }) => item.id).sort());
  }
  expect(allItems.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([markdown.id, markdown2.id, board.id]));
  const markdownManifest = parts.find((part) => part.manifest.items.some((item: { id: string }) => item.id === markdown.id))!.manifest;
  expect(markdownManifest.consistency).toBe('per-item-capture; not a workspace-wide atomic snapshot');

  const first = allItems.find((item: { id: string }) => item.id === markdown.id);
  const second = allItems.find((item: { id: string }) => item.id === markdown2.id);
  const boardEntry = allItems.find((item: { id: string }) => item.id === board.id);
  expect(first.path).toBe('Design/Notes/System.md');
  expect(second.path).toBe('Design/Notes/System (2).md');
  expect(boardEntry.path).toBe('Design/Architecture.excalidraw');
  const exportedMarkdown = strFromU8(archive[first.path]!);
  expect(exportedMarkdown).toContain('![pixel](../../assets/asset-' + asset.id + '.png)');
  expect(exportedMarkdown).toContain('[board](../Architecture.excalidraw)');
  expect(exportedMarkdown).toContain('![example](/api/assets/' + asset.id + ')');
  const markdownPartManifest = parts.find((part) => part.manifest.items.some((item: { id: string }) => item.id === markdown.id))!.manifest;
  const packedAsset = markdownPartManifest.attachments[0];
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

test('workspace ZIP captures root items beneath the workspace package directory', async ({ page }) => {
  const markdownId = await openDocument(page, '# Workspace package\n');
  const workspaceId = new URL(page.url()).pathname.split('/')[2]!;
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const created = await page.request.post(`/api/workspaces/${workspaceId}/items`, {
    headers: { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { type: 'whiteboard', title: 'Workspace board', parentId: null },
  });
  expect(created.ok()).toBeTruthy();
  const board = await created.json() as { id: string };

  await page.reload();
  await page.getByRole('button', { name: 'Workspace 菜单' }).click();
  await page.getByRole('menuitem', { name: '导出 Workspace ZIP' }).click();
  const dialog = page.getByRole('dialog', { name: '导出 Workspace：Writing regression' });
  await expect(dialog).toContainText('不是 Workspace 同一时刻的快照');
  const downloaded = await downloadPackageSet(page, () => dialog.getByRole('button', { name: '生成 ZIP 分包' }).click());
  const part = downloaded.packageSet.parts.find((candidate) => candidate.itemIDs.includes(markdownId))!;
  const path = downloaded.paths.get(part.fileName)!;
  const archive = unzipSync(new Uint8Array(await readFile(path)));
  const inspected = await inspectExport(path);
  const manifest = JSON.parse(strFromU8(archive['manifest.json']!));

  expect(inspected.manifest.format).toBe('madoc-workspace-package');
  expect(downloaded.packageSet.root).toMatchObject({ id: workspaceId, title: 'Writing regression', type: 'workspace', path: 'Writing regression' });
  expect(manifest.packageSet.partCount).toBe(downloaded.packageSet.parts.length);
  expect(manifest.consistency).toBe('per-item-capture; not a workspace-wide atomic snapshot');
  const markdown = manifest.items.find((item: { id: string }) => item.id === markdownId);
  const boardPart = downloaded.packageSet.parts.find((candidate) => candidate.itemIDs.includes(board.id))!;
  const boardPath = downloaded.paths.get(boardPart.fileName)!;
  const boardArchive = unzipSync(new Uint8Array(await readFile(boardPath)));
  const boardManifest = JSON.parse(strFromU8(boardArchive['manifest.json']!));
  const whiteboard = boardManifest.items.find((item: { id: string }) => item.id === board.id);
  expect(markdown.path).toBe('Writing regression/Inline writing.md');
  expect(strFromU8(archive[markdown.path]!)).toContain('# Workspace package');
  expect(whiteboard.path).toBe('Writing regression/Workspace board.excalidraw');
  expect(JSON.parse(strFromU8(boardArchive[whiteboard.path]!))).toMatchObject({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} });
});
