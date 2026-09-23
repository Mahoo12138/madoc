import { expect, test } from '@playwright/test';
import { portableFiles } from './helpers/portable-packages';
import { readPortablePackageSelection } from '../src/features/workspaces/portable-package-selection';

const limits = { maxArchiveBytes: 100_000, maxExpandedBytes: 100_000, maxEntryBytes: 50_000, maxEntries: 100 };
const files = (split = true) => portableFiles(split).map(({ name, buffer }) => new File([buffer], name));

test('selection reads a single ZIP or a complete reversed set with shared accounting', async () => {
  const single = await readPortablePackageSelection(files(false), limits);
  expect(single.packageSetID).toBeUndefined();
  expect(single.attachmentData.get('abc')).toHaveLength(128);
  const selected = files().reverse();
  const progress: number[] = [];
  const result = await readPortablePackageSelection(selected, limits, undefined, (done) => progress.push(done));
  expect(result.packageSetID).toBe('set-1');
  expect(result.fileCount).toBe(3);
  expect(result.entryCount).toBe(6);
  expect(result.compressedBytes).toBe(selected.reduce((sum, file) => sum + file.size, 0));
  expect(progress).toEqual([0, 1, 2, 3]);
});

test('selection rejects aggregate compressed, expanded and entry limits across valid parts', async () => {
  const selected = files();
  const valid = await readPortablePackageSelection(selected, limits);
  await expect(
    readPortablePackageSelection(selected, { ...limits, maxArchiveBytes: valid.compressedBytes - 1 }),
  ).rejects.toThrow('整组压缩');
  await expect(
    readPortablePackageSelection(selected, { ...limits, maxExpandedBytes: valid.expandedBytes - 1 }),
  ).rejects.toThrow('总大小');
  await expect(readPortablePackageSelection(selected, { ...limits, maxEntries: valid.entryCount - 1 })).rejects.toThrow(
    '数量',
  );
  const exact = await readPortablePackageSelection(selected, {
    ...limits,
    maxArchiveBytes: valid.compressedBytes,
    maxExpandedBytes: valid.expandedBytes,
    maxEntries: valid.entryCount,
  });
  expect(exact.itemData.size).toBe(1);
});

test('selection rejects malformed choices before reading and never accepts a lone content part', async () => {
  const selected = files();
  await expect(readPortablePackageSelection([], limits)).rejects.toThrow('请选择');
  await expect(readPortablePackageSelection([selected[1]], limits)).rejects.toThrow('全部附件分包');
  await expect(readPortablePackageSelection(selected.slice(1), limits)).rejects.toThrow('一份包集清单');
  await expect(readPortablePackageSelection([...selected, selected[2]], limits)).rejects.toThrow('重复名称');
  let reads = 0;
  const bad = new File(['x'], 'bad.exe');
  Object.defineProperty(bad, 'stream', {
    value: () => {
      reads++;
      throw new Error('unexpected read');
    },
  });
  await expect(readPortablePackageSelection([bad], limits)).rejects.toThrow('请选择 ZIP');
  expect(reads).toBe(0);
  for (const value of [0, -1, NaN, Infinity, 1.5]) {
    await expect(readPortablePackageSelection(selected, { ...limits, maxExpandedBytes: value })).rejects.toThrow(
      '正整数',
    );
  }
});

test('selection cancels between parts and during manifest reads, then supports a clean retry', async () => {
  const controller = new AbortController();
  await expect(
    readPortablePackageSelection(files(), limits, controller.signal, (done) => {
      if (done === 2) controller.abort();
    }),
  ).rejects.toThrow();
  const selected = files();
  const pending = new AbortController();
  let cancelled = false;
  Object.defineProperty(selected[0], 'stream', {
    value: () =>
      new ReadableStream({
        pull() {
          pending.abort();
        },
        cancel() {
          cancelled = true;
        },
      }),
  });
  await expect(readPortablePackageSelection(selected, limits, pending.signal)).rejects.toThrow();
  expect(cancelled).toBe(true);
  expect((await readPortablePackageSelection(files(), limits)).attachments).toHaveLength(1);
});
