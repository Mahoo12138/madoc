import { expect, test } from '@playwright/test';
import { createPortableImportLinkResolver } from '../src/features/workspaces/portable-import-links';

const targets = new Map([
  ['资料/笔记 2.md', '/workspace/new/doc-2'],
  ['资料/图.excalidraw', '/workspace/new/board'],
  ['assets/asset.png', '/api/assets/new-image'],
  ['资料/100%.md', '/workspace/new/percent'],
]);
const resolve = createPortableImportLinkResolver('资料/子目录/笔记.md', targets);

test('import resolves shared cross-package resources and nested content with URL suffixes', () => {
  expect(resolve('../../assets/asset.png')).toBe('/api/assets/new-image');
  expect(resolve('../笔记%202.md#章节')).toBe('/workspace/new/doc-2#章节');
  expect(resolve('../笔记 2.md')).toBe('/workspace/new/doc-2');
  expect(resolve('../图.excalidraw?view=1#shape')).toBe('/workspace/new/board?view=1#shape');
  expect(resolve('../100%25.md')).toBe('/workspace/new/percent');
  expect(resolve('./.././笔记%202.md')).toBe('/workspace/new/doc-2');
});

test('import preserves external and unpackaged references without URL-origin guessing', () => {
  for (const href of [
    'https://example.com/assets/asset.png',
    '//example.com/assets/asset.png',
    '/api/assets/old',
    '/workspace/old/item',
    'mailto:a@example.com',
    'data:image/png;base64,abc',
    'javascript:alert(1)',
    '#heading',
    '?query',
    '',
    '../missing.md',
    '../../assets/missing.png',
  ])
    expect(resolve(href)).toBe(href);
});

test('import never normalizes traversal outside the archive or encoded separators into registered paths', () => {
  for (const href of [
    '../../../assets/asset.png',
    '../../%2Fassets/asset.png',
    '..%2f../assets/asset.png',
    '../../assets%5casset.png',
    '../../assets/asset.png\u0000',
    '../../assets/%FF.png',
    '../../assets/asset%ZZ.png',
    ' https://example.com',
    '..\\../assets/asset.png',
    '../%0a笔记%202.md',
  ])
    expect(resolve(href)).toBe(href);
});
