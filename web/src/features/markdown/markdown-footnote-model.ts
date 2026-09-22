import type { Node } from '@milkdown/kit/prose/model';

export const footnoteId = (label: string) => label.trim().replace(/\s+/g, ' ').toUpperCase().toLowerCase();
export const validFootnoteLabel = (label: string) => !!label.trim() && !/[\[\]\\\r\n]/.test(label);

export function collectFootnotes(doc: Node) {
  const references: { pos: number; label: string; id: string; number: number }[] = [];
  const definitions: { pos: number; node: Node; id: string }[] = [];
  const numbers = new Map<string, number>();
  doc.descendants((node, pos) => {
    const id = footnoteId(String(node.attrs.label ?? ''));
    if (node.type.name === 'footnote_reference') {
      if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
      references.push({ pos, label: node.attrs.label, id, number: numbers.get(id)! });
    }
    if (node.type.name === 'footnote_definition') definitions.push({ pos, node, id });
  });
  return { references, definitions, numbers };
}
