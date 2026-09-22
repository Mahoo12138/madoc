import type { Node } from '@milkdown/kit/prose/model';
import type { Mapping } from '@milkdown/kit/prose/transform';

export type OutlineHeading = {
  position: number;
  level: number;
  depth: number;
  text: string;
};

export type MarkdownOutline = {
  itemId: string;
  headings: OutlineHeading[];
  activePosition: number | null;
  collapsed: ReadonlySet<number>;
  toggleCollapsed: (position: number) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  navigate: (position: number) => void;
};

/** Read the editor model so code fences and Markdown-like text never become headings. */
export function readOutline(doc: Node): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const ancestors: number[] = [];
  doc.descendants((node, position) => {
    if (node.type.name !== 'heading') return;
    const level = Number(node.attrs.level);
    while (ancestors.length && ancestors[ancestors.length - 1] >= level)
      ancestors.pop();
    const text = node
      .textBetween(0, node.content.size, ' ', (leaf) =>
        String(leaf.attrs.alt ?? leaf.attrs.value ?? ''),
      )
      .replace(/\s+/g, ' ')
      .trim();
    headings.push({
      position,
      level,
      depth: ancestors.length,
      text: text || '未命名标题',
    });
    ancestors.push(level);
    return false;
  });
  return headings;
}

export function headingAtPosition(
  headings: OutlineHeading[],
  position: number,
): number | null {
  let active: number | null = null;
  for (const heading of headings) {
    if (heading.position > position) break;
    active = heading.position;
  }
  return active;
}

export type OutlineBranch = OutlineHeading & { children: OutlineBranch[] };

export function buildOutlineTree(headings: OutlineHeading[]): OutlineBranch[] {
  const roots: OutlineBranch[] = [];
  const ancestors: OutlineBranch[] = [];
  for (const heading of headings) {
    while (
      ancestors.length &&
      ancestors[ancestors.length - 1].level >= heading.level
    )
      ancestors.pop();
    const branch = { ...heading, children: [] };
    (ancestors.at(-1)?.children ?? roots).push(branch);
    ancestors.push(branch);
  }
  return roots;
}

export function outlineParentPositions(headings: OutlineHeading[]) {
  return headings
    .filter((heading, index) => headings[index + 1]?.level > heading.level)
    .map((heading) => heading.position);
}

/** Keep UI-only folds attached to headings across local and remote editor transactions. */
export function mapOutlineFolds(
  collapsed: ReadonlySet<number>,
  mapping: Mapping,
  headings: OutlineHeading[],
) {
  const parents = new Set(outlineParentPositions(headings));
  const next = new Set<number>();
  for (const position of collapsed) {
    const mapped = mapping.mapResult(position, 1);
    if (!mapped.deleted && parents.has(mapped.pos)) next.add(mapped.pos);
  }
  return next;
}
