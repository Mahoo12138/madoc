import type { Fragment, Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import type { EditorState } from '@milkdown/kit/prose/state';

export type InlineRange = { from: number; to: number; kind: string };
export type InlineSource = InlineRange & { raw: string; cursor: number };
type Parser = (markdown: string) => ProseMirrorNode | null | undefined;

/** A plain prefix keeps *, $$ and backticks in inline (rather than block) context. */
export function parseInline(raw: string, parse: Parser, state: EditorState): Fragment {
  const prefix = 'madoc ';
  const parsed = parse(prefix + raw);
  if (parsed?.childCount === 1 && parsed.firstChild?.type.name === 'paragraph') {
    return parsed.firstChild.content.cut(prefix.length);
  }
  return state.schema.nodes.paragraph.create(null, raw ? state.schema.text(raw) : undefined).content;
}

const editableMarks = new Set(['strong', 'emphasis', 'inlineCode']);

export function inlineRangeAt(state: Pick<EditorState, 'doc'>, position: number, preferredKind?: string): InlineRange | null {
  const $pos = state.doc.resolve(position);
  if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return null;
  const start = $pos.start();
  const children: { node: ProseMirrorNode; from: number; to: number }[] = [];
  $pos.parent.forEach((node, offset) => children.push({ node, from: start + offset, to: start + offset + node.nodeSize }));
  const index = children.findIndex(({ from, to }) => position >= from && position < to);
  const current = children[index < 0 ? children.length - 1 : index];
  if (!current) return null;
  if (current.node.type.name === 'math_inline') return { from: current.from, to: current.to, kind: 'math_inline' };
  const mark = current.node.marks.find((mark) => preferredKind ? mark.type.name === preferredKind : editableMarks.has(mark.type.name));
  if (!mark) return null;
  let first = children.indexOf(current);
  let last = first;
  while (first > 0 && mark.isInSet(children[first - 1].node.marks)) first -= 1;
  while (last + 1 < children.length && mark.isInSet(children[last + 1].node.marks)) last += 1;
  return { from: children[first].from, to: children[last].to, kind: mark.type.name };
}

function escaped(text: string, at: number) {
  let count = 0;
  while (at > 0 && text[--at] === '\\') count += 1;
  return count % 2 === 1;
}

/** Recognize the pair on both sides of the caret, never inside an existing code span. */
export function filledPairAt(state: EditorState, parse: Parser): InlineSource | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  if ($from.marks().some((mark) => mark.type.name === 'inlineCode')) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc');
  const after = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, '\n', '\ufffc');
  const codeFence = after.match(/^`+/)?.[0];
  const pairs = [
    { marker: '**', kind: 'strong' }, { marker: '__', kind: 'strong' },
    { marker: '*', kind: 'emphasis' }, { marker: '_', kind: 'emphasis' },
    ...(codeFence ? [{ marker: codeFence, kind: 'inlineCode' }] : []),
    { marker: '$', kind: 'math_inline' },
  ];
  for (const { marker, kind } of pairs) {
    if (!after.startsWith(marker)) continue;
    const opening = before.lastIndexOf(marker);
    if (opening < 0 || escaped(before, opening)) continue;
    if (marker.length === 1 && before[opening - 1] === marker) continue;
    const content = before.slice(opening + marker.length);
    if (!content.trim() || content.includes('\ufffc')) continue;
    if (marker.includes('_') && /[\p{L}\p{N}]/u.test(before[opening - 1] ?? '')) continue;
    const raw = marker + content + marker;
    const fragment = parseInline(raw, parse, state);
    if (!fragment.firstChild || !(kind === 'math_inline'
      ? fragment.firstChild.type.name === kind
      : fragment.firstChild.marks.some((mark) => mark.type.name === kind))) continue;
    const from = $from.start() + opening;
    // Do not reinterpret already marked text, images, or formulas across the pair.
    let plain = true;
    state.doc.nodesBetween(from, state.selection.from + marker.length, (node) => {
      if (node.isInline && (!node.isText || node.marks.length > 0)) plain = false;
    });
    if (!plain) continue;
    return { from, to: state.selection.from + marker.length, kind, raw, cursor: raw.length - marker.length };
  }
  return null;
}

/** Preserve the local caret when a collaborator changes the visible source. */
export function mapSourceOffset(previous: string, next: string, offset: number) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start += 1;
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd -= 1; newEnd -= 1; }
  return offset <= start ? offset : offset >= oldEnd ? offset + newEnd - oldEnd : newEnd;
}

/** Apply only the IME's local edit to the source received during composition. */
export function mergeComposition(base: string, edited: string, remote: string) {
  let start = 0;
  while (start < base.length && start < edited.length && base[start] === edited[start]) start += 1;
  let oldEnd = base.length;
  let newEnd = edited.length;
  while (oldEnd > start && newEnd > start && base[oldEnd - 1] === edited[newEnd - 1]) { oldEnd -= 1; newEnd -= 1; }
  const from = mapSourceOffset(base, remote, start);
  const to = mapSourceOffset(base, remote, oldEnd);
  return remote.slice(0, from) + edited.slice(start, newEnd) + remote.slice(to);
}
