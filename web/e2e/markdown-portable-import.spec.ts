import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { readPortablePackageSelection } from '../src/features/workspaces/portable-package-selection';

const markdown = '# Report\n\n![image](assets/asset-123.png)';
const image = new Uint8Array([1, 2, 3, 4]);
const base = {
  format: 'madoc-markdown-package', version: 1,
  item: { id: 'source-item', title: 'Report' },
  content: { generation: 2, seq: 14, exportedAt: '2026-09-23T12:00:00.000Z' },
  markdown: 'Report.md',
  attachments: [{ id: '123', source: '/api/assets/123', path: 'assets/asset-123.png', mime: 'image/png', size: image.length }],
  unpackagedImages: ['https://example.com/unpacked.png'],
};

function archive(manifest: Record<string, unknown> = base, includeImage = true, extras: Record<string, Uint8Array> = {}) {
  return new File([zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'Report.md': strToU8(markdown),
    ...(includeImage ? { 'assets/asset-123.png': image } : {}),
    ...extras,
  })], 'Report.zip');
}

test('single-document Markdown ZIP is normalized to an import folder and retains relative assets', async () => {
  const result = await readPortablePackageSelection([archive()]);
  expect(result.manifest.root.title).toBe('Report');
  expect(result.directoryCount).toBe(0);
  expect(result.markdownCount).toBe(1);
  expect(result.whiteboardCount).toBe(0);
  expect(result.items).toEqual([expect.objectContaining({ id: 'source-item', parentId: result.manifest.root.id, type: 'markdown', title: 'Report', path: 'Report.md' })]);
  expect(new TextDecoder().decode(result.itemData.get('source-item'))).toBe(markdown);
  expect(result.attachments).toHaveLength(1);
  expect(result.attachmentData.get('123')).toEqual(image);
  expect(result.manifest.sourceFormat).toBe('madoc-markdown-package');
});

test('single-document Markdown ZIP rejects incomplete or ambiguous contents and invalid watermarks', async () => {
  await expect(readPortablePackageSelection([archive(base, false)])).rejects.toThrow('附件缺失');
  await expect(readPortablePackageSelection([archive(base, true, { 'notes.txt': strToU8('unlisted') })])).rejects.toThrow('未登记');
  await expect(readPortablePackageSelection([archive({ ...base, markdown: '../Report.md' })])).rejects.toThrow('路径无效');
  await expect(readPortablePackageSelection([archive({ ...base, content: { ...base.content, seq: -1 } })])).rejects.toThrow('水位无效');
  await expect(readPortablePackageSelection([archive({ ...base, unpackagedImages: ['ok', 1] })])).rejects.toThrow('清单无效');
  await expect(readPortablePackageSelection([archive({ ...base, attachments: [{ ...base.attachments[0], path: '../asset.png' }] })])).rejects.toThrow('路径不受支持');
});
