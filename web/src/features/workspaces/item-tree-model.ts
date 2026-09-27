import type { Item } from '@/api/types';

/** Index one server snapshot without sorting or mutating the shared query data. */
export function indexChildren(items: readonly Item[]) {
  const children = new Map<string | null, Item[]>();
  for (const item of items) {
    const siblings = children.get(item.parentId);
    if (siblings) siblings.push(item);
    else children.set(item.parentId, [item]);
  }
  for (const siblings of children.values())
    siblings.sort((a, b) => a.sortKey - b.sortKey);
  return children;
}
