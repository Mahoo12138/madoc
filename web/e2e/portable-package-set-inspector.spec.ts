import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { inspectPortablePackageSet } from '../src/features/workspaces/portable-package-set-inspector';
import { readPortableZip } from '../src/features/workspaces/portable-zip-reader';

function fixture() {
  const root = { id: 'workspace', title: 'Design', type: 'workspace', path: 'Design' };
  const item = { id: 'doc', parentId: null, type: 'markdown', title: 'Notes', path: 'Design/Notes.md' };
  const attachments = ['a', 'b'].map((id, index) => ({
    id,
    path: `assets/asset-${id}.png`,
    mime: 'image/png',
    size: 3,
    source: `/api/assets/${id}`,
    partFileName: `assets-${index}.zip`,
  }));
  const parts = [
    { fileName: 'content.zip', role: 'content', part: 1, itemIDs: ['doc'], attachmentIDs: [] as string[] },
    ...attachments.map((attachment, index) => ({
      fileName: attachment.partFileName,
      role: 'attachments',
      part: index + 2,
      itemIDs: [] as string[],
      attachmentIDs: [attachment.id],
    })),
  ];
  const set = { format: 'madoc-package-set', version: 1, id: 'batch', root, attachmentBytes: 6, parts, attachments };
  const content = {
    format: 'madoc-workspace-package',
    version: 1,
    root,
    items: [item],
    attachments: [],
    unpackagedImages: [],
    unpackagedItemLinks: [],
    packageSet: { id: 'batch', role: 'content', part: 1, partCount: 3 },
  };
  const assetManifests = attachments.map(({ partFileName: _part, ...attachment }, index) => ({
    format: 'madoc-asset-part',
    version: 1,
    packageSet: { id: 'batch', role: 'attachments', part: index + 2, partCount: 3 },
    attachments: [attachment],
  }));
  const files: Record<string, Uint8Array>[] = [
    {
      'Design/': new Uint8Array(),
      'Design/Notes.md': strToU8('![a](../assets/asset-a.png)\n![b](../assets/asset-b.png)'),
    },
    ...attachments.map((attachment) => ({ [attachment.path]: new Uint8Array([1, 2, 3]) })),
  ];
  return { set, content, assetManifests, files };
}

async function inspect(input: ReturnType<typeof fixture>, selection = [0, 1, 2]) {
  const manifests = [input.content, ...input.assetManifests];
  const archives = await Promise.all(
    selection.map(async (index) => {
      const fileName = ['content.zip', 'assets-0.zip', 'assets-1.zip'][index];
      const file = new File(
        [zipSync({ ...input.files[index], 'manifest.json': strToU8(JSON.stringify(manifests[index])) }) as BlobPart],
        fileName,
      );
      const entries = await readPortableZip(file, {
        maxArchiveBytes: 100_000,
        maxExpandedBytes: 100_000,
        maxEntryBytes: 50_000,
        maxEntries: 20,
      });
      return { fileName, entries };
    }),
  );
  return inspectPortablePackageSet(strToU8(JSON.stringify(input.set)), archives);
}

test('package set maps content and attachments independently of selection and descriptor order', async () => {
  const input = fixture();
  input.set.parts.reverse();
  const result = await inspect(input, [2, 0, 1]);
  expect(result.packageSetID).toBe('batch');
  expect(result.markdownCount).toBe(1);
  expect(new TextDecoder().decode(result.itemData.get('doc'))).toContain('../assets/asset-b.png');
  expect([...result.attachmentData.keys()]).toEqual(['a', 'b']);
  expect(result.attachmentData.get('b')).toEqual(new Uint8Array([1, 2, 3]));
});

test('package set rejects missing, duplicate, renamed and mixed-batch archives', async () => {
  await expect(inspect(fixture(), [0, 1])).rejects.toThrow('分包数量');
  await expect(inspect(fixture(), [0, 1, 1])).rejects.toThrow('重复的分包');
  const renamed = fixture();
  renamed.set.parts[2].fileName = 'other.zip';
  await expect(inspect(renamed)).rejects.toThrow('缺少分包');
  const mixed = fixture();
  mixed.assetManifests[1].packageSet.id = 'other-batch';
  await expect(inspect(mixed)).rejects.toThrow('元数据');
});

test('package set rejects invalid numbering, root, roles and item inventories', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.set.parts[2].part = 2;
    },
    (f: ReturnType<typeof fixture>) => {
      f.assetManifests[0].packageSet.partCount = 4;
    },
    (f: ReturnType<typeof fixture>) => {
      f.set.root = { ...f.set.root, id: 'other' };
    },
    (f: ReturnType<typeof fixture>) => {
      f.set.parts[1].role = 'content';
    },
    (f: ReturnType<typeof fixture>) => {
      f.set.parts[0].itemIDs = ['missing'];
    },
    (f: ReturnType<typeof fixture>) => {
      f.set.parts[0].itemIDs = ['doc', 'doc'];
    },
  ]) {
    const input = fixture();
    mutate(input);
    await expect(inspect(input)).rejects.toThrow();
  }
});

test('package set rejects duplicate, missing, misplaced and inconsistent attachment records', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.set.attachments.push({ ...f.set.attachments[0] });
    },
    (f: ReturnType<typeof fixture>) => {
      f.set.attachments[1].path = f.set.attachments[0].path;
    },
    (f: ReturnType<typeof fixture>) => {
      f.set.attachments[1].partFileName = 'assets-0.zip';
    },
    (f: ReturnType<typeof fixture>) => {
      f.set.attachmentBytes = 7;
    },
    (f: ReturnType<typeof fixture>) => {
      f.assetManifests[0].attachments[0].size = 4;
    },
    (f: ReturnType<typeof fixture>) => {
      f.set.attachments[0].source = '/api/assets/other';
    },
    (f: ReturnType<typeof fixture>) => {
      f.set.parts[1].attachmentIDs = [];
    },
    (f: ReturnType<typeof fixture>) => {
      delete f.files[2]['assets/asset-b.png'];
    },
    (f: ReturnType<typeof fixture>) => {
      f.files[1]['assets/asset-a.png'] = new Uint8Array([1]);
    },
    (f: ReturnType<typeof fixture>) => {
      f.files[1]['assets/extra.png'] = new Uint8Array([1]);
    },
  ]) {
    const input = fixture();
    mutate(input);
    await expect(inspect(input)).rejects.toThrow();
  }
});

test('package set rejects malformed external JSON and unsupported versions', async () => {
  expect(() => inspectPortablePackageSet(new Uint8Array([255]), [])).toThrow('UTF-8 JSON');
  const input = fixture();
  input.set.version = 2;
  await expect(inspect(input)).rejects.toThrow('格式或版本');
});

test('package set rejects content directories colliding with attachment files across ZIPs', async () => {
  const input = fixture();
  input.set.root.path = 'assets';
  input.content.items[0] = {
    id: 'doc',
    parentId: null,
    type: 'folder',
    title: 'asset-a.png',
    path: 'assets/asset-a.png',
  };
  input.files[0] = { 'assets/': new Uint8Array(), 'assets/asset-a.png/': new Uint8Array() };
  await expect(inspect(input)).rejects.toThrow('重复文件或目录路径');
});
