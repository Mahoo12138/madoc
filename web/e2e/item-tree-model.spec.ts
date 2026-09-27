import { expect, test } from '@playwright/test';
import type { Item } from '../src/api/types';
import { indexChildren } from '../src/features/workspaces/item-tree-model';

test('indexing preserves shared snapshots, stable ties and parent identity across move updates', () => {
  const item = (id: string, parentId: string | null, sortKey: number) =>
    Object.freeze({ id, parentId, sortKey, type: 'folder' }) as Item;
  const snapshot = Object.freeze([
    item('child-b', 'root', 1),
    item('root', null, 2),
    item('child-a', 'root', 0),
    item('same-order', 'root', 1),
    item('earlier-root', null, -1),
    item('orphan', 'missing', 0),
    item('special-id', '__proto__', 0),
  ]);
  const indexed = indexChildren(snapshot);
  expect(indexed.get(null)?.map((item) => item.id)).toEqual([
    'earlier-root',
    'root',
  ]);
  expect(indexed.get('root')?.map((item) => item.id)).toEqual([
    'child-a',
    'child-b',
    'same-order',
  ]);
  expect(indexed.get('__proto__')?.map((item) => item.id)).toEqual([
    'special-id',
  ]);
  expect(indexed.get('missing')?.map((item) => item.id)).toEqual(['orphan']);
  expect(snapshot[0].id).toBe('child-b');
  const moved = indexChildren(
    snapshot.map((entry) =>
      entry.id === 'child-a' ? { ...entry, parentId: null } : entry,
    ),
  );
  expect(moved.get('root')?.map((item) => item.id)).toEqual([
    'child-b',
    'same-order',
  ]);
  expect(moved.get(null)?.map((item) => item.id)).toEqual([
    'earlier-root',
    'child-a',
    'root',
  ]);
  expect(indexed.get('root')?.[0]).toBe(snapshot[2]);
  expect(indexChildren([]).size).toBe(0);
});
