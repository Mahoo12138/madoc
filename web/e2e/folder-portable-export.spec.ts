import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test, type Download, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openDocument } from './helpers/writing';
import { inspectPortablePackageSet } from '../src/features/workspaces/portable-package-set-inspector';
import { inspectPortablePackage } from '../src/features/workspaces/portable-package-inspector';
import { readPortableZip, type PortableZipLimits } from '../src/features/workspaces/portable-zip-reader';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=', 'base64');
const inspectionLimits: PortableZipLimits = { maxArchiveBytes: 25 << 20, maxExpandedBytes: 100 << 20, maxEntryBytes: 25 << 20, maxEntries: 5000 };

async function inspectExport(path: string) {
  const bytes = Uint8Array.from(await readFile(path));
  return inspectPortablePackage(await readPortableZip(new File([bytes], 'export.zip'), inspectionLimits));
}

async function downloadPortableExport(page: Page, start: () => Promise<void>, expectSet: boolean) {
  const downloads: Download[] = [];
  const onDownload = (download: Download) => downloads.push(download);
  page.on('download', onDownload);
  await start();
  await expect.poll(() => downloads.length).toBeGreaterThan(0);
  let packageSet: { format: string; id: string; parts: { fileName: string; role: string; itemIDs: string[]; attachmentIDs: string[] }[]; root?: Record<string, unknown>; attachmentBytes?: number; attachmentSplitThresholdBytes?: number; attachments?: { id: string; size: number; partFileName: string }[] } | undefined;
  if (expectSet) {
    await expect.poll(() => downloads.some((download) => download.suggestedFilename().endsWith('.package-set.json'))).toBe(true);
    const setDownload = downloads.find((download) => download.suggestedFilename().endsWith('.package-set.json'))!;
    packageSet = JSON.parse(await readFile(await setDownload.path(), 'utf8'));
    await expect.poll(() => downloads.length).toBe(packageSet.parts.length + 1);
  } else {
    await expect.poll(() => downloads.length).toBe(1);
    expect(downloads[0]!.suggestedFilename()).toMatch(/\.zip$/);
  }
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
  const downloaded = await downloadPortableExport(page, () => dialog.getByRole('button', { name: '生成导出包' }).click(), false);
  const path = downloaded.paths.get([...downloaded.paths.keys()][0]!)!;
  const archive = unzipSync(new Uint8Array(await readFile(path)));
  const inspected = await inspectExport(path);
  const manifest = JSON.parse(strFromU8(archive['manifest.json']!));
  expect(downloaded.packageSet).toBeUndefined();
  expect(inspected.manifest.format).toBe('madoc-folder-package');
  expect(manifest.attachments).toHaveLength(1);
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
  await retryDialog.getByRole('button', { name: '生成导出包' }).click();
  await expect(retryDialog.getByRole('alert')).toContainText('已不存在');
  expect(await noDownload).toBeUndefined();
});

test('workspace export splits only oversized attachment sets while keeping content links intact', async ({ page }) => {
  await openDocument(page, '# Seed document\n');
  const workspaceId = new URL(page.url()).pathname.split('/')[2]!;
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  const createdMarkdown = await page.request.post(`/api/workspaces/${workspaceId}/items`, {
    headers,
    data: { type: 'markdown', title: 'Workspace package', parentId: null },
  });
  expect(createdMarkdown.ok()).toBeTruthy();
  const markdownId = (await createdMarkdown.json() as { id: string }).id;
  const created = await page.request.post(`/api/workspaces/${workspaceId}/items`, {
    headers,
    data: { type: 'whiteboard', title: 'Workspace board', parentId: null },
  });
  expect(created.ok()).toBeTruthy();
  const board = await created.json() as { id: string };
  const largePNG = Buffer.alloc(13 * 1024 * 1024);
  png.copy(largePNG);
  const largePNGHash = createHash('sha256').update(largePNG).digest('hex');
  const attachmentIDs: string[] = [];
  for (let index = 0; index < 4; index++) {
    const uploaded = await page.request.post(`/api/workspaces/${workspaceId}/assets`, {
      headers,
      multipart: { file: { name: `large-${index}.png`, mimeType: 'image/png', buffer: largePNG }, itemId: markdownId },
    });
    expect(uploaded.ok()).toBeTruthy();
    attachmentIDs.push(((await uploaded.json()).asset as { id: string }).id);
  }
  const markdownSource = `# Workspace package\n\n${attachmentIDs.map((id) => `![large](/api/assets/${id})`).join('\n\n')}\n\n[board](http://127.0.0.1:3100/workspace/${workspaceId}/${board.id})\n`;
  const updated = await page.request.put(`/api/items/${markdownId}/markdown`, { headers, data: { snapshot: '', markdown: markdownSource } });
  expect(updated.ok(), `${updated.status()} ${await updated.text()}`).toBeTruthy();

  await page.reload();
  await page.getByRole('button', { name: 'Workspace 菜单' }).click();
  await page.getByRole('menuitem', { name: '导出 Workspace ZIP' }).click();
  const dialog = page.getByRole('dialog', { name: '导出 Workspace：Writing regression' });
  await expect(dialog).toContainText('不是 Workspace 同一时刻的快照');
  const downloaded = await downloadPortableExport(page, () => dialog.getByRole('button', { name: '生成导出包' }).click(), true);
  const packageSet = downloaded.packageSet!;
  expect(packageSet.format).toBe('madoc-package-set');
  expect(packageSet.root).toMatchObject({ id: workspaceId, title: 'Writing regression', type: 'workspace', path: 'Writing regression' });
  expect(packageSet.attachmentBytes).toBe(52 * 1024 * 1024);
  expect(packageSet.attachmentSplitThresholdBytes).toBe(50 * 1024 * 1024);
  expect(packageSet.parts.map((part) => part.role)).toEqual(['content', 'attachments', 'attachments']);
  expect(packageSet.attachments).toHaveLength(4);
  expect(packageSet.attachments!.map(({ id }) => id).sort()).toEqual(attachmentIDs.sort());
  for (const part of packageSet.parts.filter((candidate) => candidate.role === 'attachments')) {
    const size = packageSet.attachments!.filter((attachment) => attachment.partFileName === part.fileName).reduce((sum, attachment) => sum + attachment.size, 0);
    expect(size).toBeLessThanOrEqual(50 * 1024 * 1024);
  }
  const part = packageSet.parts.find((candidate) => candidate.role === 'content' && candidate.itemIDs.includes(markdownId))!;
  const path = downloaded.paths.get(part.fileName)!;
  const archive = unzipSync(new Uint8Array(await readFile(path)));
  const inspected = await inspectExport(path);
  const manifest = JSON.parse(strFromU8(archive['manifest.json']!));

  expect(inspected.manifest.format).toBe('madoc-workspace-package');
  expect(manifest.packageSet.partCount).toBe(packageSet.parts.length);
  expect(manifest.consistency).toBe('per-item-capture; not a workspace-wide atomic snapshot');
  expect(manifest.attachments).toEqual([]);
  const markdown = manifest.items.find((item: { id: string }) => item.id === markdownId);
  const whiteboard = manifest.items.find((item: { id: string }) => item.id === board.id);
  expect(markdown.path).toBe('Writing regression/Workspace package.md');
  const markdownText = strFromU8(archive[markdown.path]!);
  expect(markdownText).toContain('# Workspace package');
  expect(markdownText).toContain('[board](./Workspace board.excalidraw)');
  expect(whiteboard.path).toBe('Writing regression/Workspace board.excalidraw');
  expect(JSON.parse(strFromU8(archive[whiteboard.path]!))).toMatchObject({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} });
  const attachmentRecords: { id: string; path: string; size: number }[] = [];
  for (const attachmentPart of packageSet.parts.filter((candidate) => candidate.role === 'attachments')) {
    const attachmentArchive = unzipSync(new Uint8Array(await readFile(downloaded.paths.get(attachmentPart.fileName)!)));
    const attachmentManifest = JSON.parse(strFromU8(attachmentArchive['manifest.json']!));
    expect(attachmentManifest.format).toBe('madoc-asset-part');
    expect(attachmentManifest.packageSet.id).toBe(packageSet.id);
    for (const record of attachmentManifest.attachments as { id: string; path: string; size: number }[]) {
      expect(attachmentArchive[record.path]).toHaveLength(record.size);
      expect(createHash('sha256').update(attachmentArchive[record.path]!).digest('hex')).toBe(largePNGHash);
      expect(markdownText).toContain(`![large](../${record.path})`);
      attachmentRecords.push(record);
    }
  }
  expect(attachmentRecords.map(({ id }) => id).sort()).toEqual(attachmentIDs.sort());
  const selectedParts = [];
  for (const descriptor of [...packageSet.parts].reverse()) {
    const bytes = Uint8Array.from(await readFile(downloaded.paths.get(descriptor.fileName)!));
    const entries = await readPortableZip(new File([bytes], descriptor.fileName), { ...inspectionLimits, maxArchiveBytes: 60 << 20 });
    selectedParts.push({ fileName: descriptor.fileName, entries });
  }
  const setPath = [...downloaded.paths].find(([name]) => name.endsWith('.package-set.json'))![1];
  const restored = inspectPortablePackageSet(new Uint8Array(await readFile(setPath)), selectedParts);
  expect(restored.attachments.map(({ id }) => id).sort()).toEqual(attachmentIDs.sort());
  expect(new TextDecoder().decode(restored.itemData.get(markdownId))).toBe(markdownText);
  for (const bytes of restored.attachmentData.values()) {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(largePNGHash);
  }
});
