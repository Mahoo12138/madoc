import { expect, test } from '@playwright/test';
import { planPortableAttachmentPackages, type PortableAssetPayload } from '../src/features/workspaces/portable-package-policy';

function asset(id: string, bytes: number): PortableAssetPayload {
  return { id, data: new Uint8Array(bytes) };
}

test('portable export keeps a single ZIP when attachments are absent or at the exact threshold', () => {
  expect(planPortableAttachmentPackages([], 10)).toMatchObject({ mode: 'single', totalBytes: 0, parts: [] });
  expect(planPortableAttachmentPackages([asset('one', 4), asset('two', 6)], 10)).toMatchObject({ mode: 'single', totalBytes: 10, parts: [] });
});

test('portable export splits attachments over the threshold into deterministic bounded parts', () => {
  const plan = planPortableAttachmentPackages([asset('c', 5), asset('a', 6), asset('b', 5)], 10);
  expect(plan.mode).toBe('set');
  if (plan.mode !== 'set') throw new Error('expected a package set');
  expect(plan.totalBytes).toBe(16);
  expect(plan.parts.map((part) => part.map(({ id }) => id))).toEqual([['a'], ['b', 'c']]);
  expect(plan.parts.map((part) => part.reduce((size, entry) => size + entry.data.byteLength, 0))).toEqual([6, 10]);
});

test('portable export keeps a single oversized attachment intact in its own part', () => {
  const plan = planPortableAttachmentPackages([asset('large', 12), asset('small', 1)], 10);
  expect(plan.mode).toBe('set');
  if (plan.mode !== 'set') throw new Error('expected a package set');
  expect(plan.parts.map((part) => part.map(({ id }) => id))).toEqual([['large'], ['small']]);
});

test('portable export rejects invalid thresholds and impossible aggregate sizes', () => {
  expect(() => planPortableAttachmentPackages([], 0)).toThrow('阈值无效');
  expect(() => planPortableAttachmentPackages([{ id: 'invalid', data: new Uint8Array() }], Number.NaN)).toThrow('阈值无效');
  const oversizedLength = { id: 'impossible', data: { byteLength: Number.MAX_SAFE_INTEGER + 1 } } as unknown as PortableAssetPayload;
  expect(() => planPortableAttachmentPackages([oversizedLength], 10)).toThrow('超出可处理范围');
});
