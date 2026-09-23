import { expect, test } from '@playwright/test';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { readPortableZip, type PortableZipLimits } from '../src/features/workspaces/portable-zip-reader';

const normalLimits: PortableZipLimits = {
  maxArchiveBytes: 1024 * 1024,
  maxExpandedBytes: 1024 * 1024,
  maxEntryBytes: 512 * 1024,
  maxEntries: 20,
};

function archive(entries: Record<string, Uint8Array>) {
  return new File([zipSync(entries) as BlobPart], 'package.zip', { type: 'application/zip' });
}

test('streaming ZIP reader returns regular paths and directory entries', async () => {
  const result = await readPortableZip(archive({
    'Notes/': new Uint8Array(),
    'Notes/intro.md': strToU8('# Intro'),
    'assets/pixel.png': new Uint8Array([1, 2, 3]),
  }), normalLimits);

  expect(result.map((entry) => [entry.path, entry.directory])).toEqual([
    ['Notes', true], ['Notes/intro.md', false], ['assets/pixel.png', false],
  ]);
  expect(strFromU8(result[1]!.data)).toBe('# Intro');
  expect([...result[2]!.data]).toEqual([1, 2, 3]);
});

test('streaming ZIP reader rejects traversal, absolute paths and path collisions', async () => {
  for (const path of ['../escape.md', '/absolute.md', 'C:/escape.md', 'folder\\escape.md']) {
    await expect(readPortableZip(archive({ [path]: strToU8('x') }), normalLimits)).rejects.toThrow('不安全的路径');
  }
  await expect(readPortableZip(archive({ 'Notes.md': strToU8('x'), 'notes.MD': strToU8('y') }), normalLimits)).rejects.toThrow('重复路径');
  await expect(readPortableZip(archive({ 'Notes': strToU8('x'), 'Notes/child.md': strToU8('y') }), normalLimits)).rejects.toThrow('文件冲突');
});

test('streaming ZIP reader enforces archive, expanded, entry and count limits', async () => {
  const data = archive({ 'large.md': strToU8('x'.repeat(4096)), 'small.md': strToU8('ok') });
  await expect(readPortableZip(data, { ...normalLimits, maxArchiveBytes: data.size - 1 })).rejects.toThrow('大小上限');
  await expect(readPortableZip(data, { ...normalLimits, maxExpandedBytes: 4095 })).rejects.toThrow('总大小');
  await expect(readPortableZip(data, { ...normalLimits, maxEntryBytes: 4095 })).rejects.toThrow('单项大小');
  await expect(readPortableZip(data, { ...normalLimits, maxEntries: 1 })).rejects.toThrow('数量');
});

test('streaming ZIP reader rejects incomplete archives and honors cancellation', async () => {
  const data = archive({ 'notes.md': strToU8('notes') });
  await expect(readPortableZip(new File([data.slice(0, -8)], data.name), normalLimits)).rejects.toThrow('目录不完整');
  const controller = new AbortController();
  controller.abort();
  await expect(readPortableZip(data, normalLimits, controller.signal)).rejects.toThrow();
});
