import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { inspectPortablePackage } from '../src/features/workspaces/portable-package-inspector';
import { readPortableZip, type PortableZipLimits } from '../src/features/workspaces/portable-zip-reader';

const limits: PortableZipLimits = { maxArchiveBytes: 1024 * 1024, maxExpandedBytes: 1024 * 1024, maxEntryBytes: 512 * 1024, maxEntries: 20 };
const root = { id: 'workspace-1', title: 'Design', type: 'workspace', path: 'Design' };
const item = { id: 'doc-1', parentId: null, type: 'markdown', title: 'Notes', path: 'Design/Notes.md' };
const image = new Uint8Array([1, 2, 3]);

function packageFile(manifest: Record<string, unknown>, extra: Record<string, Uint8Array> = {}) {
  return new File([zipSync({
    'Design/': new Uint8Array(),
    'Design/Notes.md': strToU8('# Notes'),
    'assets/asset-123.png': image,
    'manifest.json': strToU8(JSON.stringify(manifest)),
    ...extra,
  }) as BlobPart], 'package.zip');
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    format: 'madoc-workspace-package',
    version: 1,
    root,
    items: [item],
    attachments: [{ id: '123', path: 'assets/asset-123.png', mime: 'image/png', size: image.length, source: '/api/assets/123' }],
    unpackagedImages: [],
    unpackagedItemLinks: [],
    ...overrides,
  };
}

async function inspect(file: File) {
  const entries = await readPortableZip(file, limits);
  return inspectPortablePackage(entries);
}

test('portable package inspector maps manifest entries to validated ZIP content', async () => {
  const result = await inspect(packageFile(manifest()));
  expect(result.manifest.root).toEqual(root);
  expect(result.items).toEqual([item]);
  expect(result.markdownCount).toBe(1);
  expect(result.whiteboardCount).toBe(0);
  expect(result.attachments).toHaveLength(1);
  expect(result.itemData.has('doc-1')).toBeTruthy();
});

test('portable package inspector rejects unsupported manifests and missing content', async () => {
  await expect(inspect(packageFile(manifest({ version: 2 })))).rejects.toThrow('格式或版本');
  await expect(inspect(packageFile(manifest({ items: [{ ...item, path: 'Design/missing.md' }] })))).rejects.toThrow('缺少内容文件');
  await expect(inspect(packageFile(manifest({ items: [{ ...item, parentId: 'missing-parent' }] })))).rejects.toThrow('没有有效的父级');
  await expect(inspect(packageFile(manifest(), { 'Design/unlisted.md': strToU8('unlisted') }))).rejects.toThrow('未登记的文件');
});

test('portable package inspector rejects invalid whiteboards and mismatched attachment metadata', async () => {
  const board = { id: 'board-1', parentId: null, type: 'whiteboard', title: 'Board', path: 'Design/Board.excalidraw' };
  const invalidBoard = packageFile(manifest({ items: [board] }), { 'Design/Board.excalidraw': strToU8('{"type":"excalidraw","version":1}') });
  await expect(inspect(invalidBoard)).rejects.toThrow('结构无效或版本不受支持');
  await expect(inspect(packageFile(manifest({ attachments: [{ ...manifest().attachments[0], size: 99 }] })))).rejects.toThrow('大小与 manifest 不一致');
});
