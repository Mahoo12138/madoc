import { strToU8, unzipSync, zipSync } from 'fflate';

export function portableFiles(split = true, itemCount = 1) {
  const root = { id: 'workspace', title: '导入资料', type: 'workspace', path: '导入资料' };
  const items = Array.from({ length: itemCount }, (_, index) => ({
    id: `doc-${index}`,
    parentId: null,
    type: 'markdown',
    title: `笔记 ${index + 1}`,
    path: `导入资料/笔记 ${index + 1}.md`,
  }));
  const attachment = {
    id: 'abc',
    path: 'assets/asset-abc.png',
    mime: 'image/png',
    size: 128,
    source: '/api/assets/abc',
  };
  const manifest = {
    format: 'madoc-workspace-package',
    version: 1,
    root,
    items,
    attachments: split ? [] : [attachment],
    unpackagedImages: [],
    unpackagedItemLinks: [],
    ...(split ? { packageSet: { id: 'set-1', role: 'content', part: 1, partCount: 2 } } : {}),
  };
  const contents: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    '导入资料/': new Uint8Array(),
  };
  for (const item of items) contents[item.path] = strToU8('# 笔记\n\n![image](../assets/asset-abc.png)');
  if (!split) contents[attachment.path] = new Uint8Array(128);
  const content = { name: 'content.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync(contents)) };
  if (!split) return [content];
  const assetManifest = {
    format: 'madoc-asset-part',
    version: 1,
    packageSet: { id: 'set-1', role: 'attachments', part: 2, partCount: 2 },
    attachments: [attachment],
  };
  const assets = {
    name: 'assets.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({ 'manifest.json': strToU8(JSON.stringify(assetManifest)), [attachment.path]: new Uint8Array(128) }),
    ),
  };
  const set = {
    format: 'madoc-package-set',
    version: 1,
    id: 'set-1',
    root,
    attachmentBytes: 128,
    parts: [
      { fileName: content.name, role: 'content', part: 1, itemIDs: items.map(({ id }) => id), attachmentIDs: [] },
      { fileName: assets.name, role: 'attachments', part: 2, itemIDs: [], attachmentIDs: ['abc'] },
    ],
    attachments: [{ ...attachment, partFileName: assets.name }],
  };
  return [
    { name: 'notes.package-set.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(set)) },
    content,
    assets,
  ];
}

// Actual image bytes for end-to-end imports; structural preview fixtures above
// deliberately do not claim to be valid image files.
export function portableImportFiles(split = true, itemCount = 2) {
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=',
    'base64',
  );
  return portableFiles(split, itemCount).map((file) => {
    if (file.name.endsWith('.json')) {
      const set = JSON.parse(file.buffer.toString());
      set.attachmentBytes = image.length;
      set.attachments[0].size = image.length;
      return { ...file, buffer: Buffer.from(JSON.stringify(set)) };
    }
    const entries = unzipSync(file.buffer);
    const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
    for (const asset of manifest.attachments) asset.size = image.length;
    entries['manifest.json'] = strToU8(JSON.stringify(manifest));
    if (entries['assets/asset-abc.png']) entries['assets/asset-abc.png'] = image;
    for (const item of manifest.items ?? []) {
      entries[item.path] = strToU8(
        '# ' + item.title + '\n\n![图片](../assets/asset-abc.png)\n\n[下一篇][next]\n\n[next]: ./笔记%202.md',
      );
    }
    return { ...file, buffer: Buffer.from(zipSync(entries)) };
  });
}
