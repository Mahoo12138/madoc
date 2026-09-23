import { expect, test } from '@playwright/test';
import { localMadocAssetID } from '../src/features/markdown/asset-reference';

test('only exact same-origin Madoc asset URLs produce canonical version asset IDs', () => {
  const origin = 'https://madoc.example';
  const id = '8e1d4c7b-a9be-4c90-8c86-a43be9df7c11';
  expect(localMadocAssetID(`/api/assets/${id}`, origin)).toBe(id);
  expect(localMadocAssetID(`https://madoc.example/api/assets/${id.toUpperCase()}`, origin)).toBe(id);
  for (const source of [
    `https://evil.example/api/assets/${id}`,
    `//evil.example/api/assets/${id}`,
    `/api/assets/${id}?download=1`,
    `/api/assets/${id}#fragment`,
    `/api/assets/${id}/extra`,
    '/api/assets/not-a-uuid',
    '/api/assets/00000000-0000-0000-0000-000000000000',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
  ]) {
    expect(localMadocAssetID(source, origin), source).toBeUndefined();
  }
});
