import type { Ctx } from '@milkdown/kit/ctx';
import { editorStateOptionsCtx, inputRulesCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import type { InputRule } from '@milkdown/kit/prose/inputrules';
import { $markSchema, $remark } from '@milkdown/kit/utils';
import { decodeString } from 'micromark-util-decode-string';

export const escapable = /^[!-/:-@\[-`{-~]$/;

/** Invisible semantic mark: literal punctuation must not become Markdown on a later edit. */
export const escapedText = $markSchema('escaped_text', () => ({
  inclusive: false,
  parseDOM: [{ tag: 'span[data-markdown-escape]' }],
  toDOM: () => ['span', { 'data-markdown-escape': '' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'escapedText',
    runner: (state, node, type) => {
      state.openMark(type);
      state.addText(String(node.value));
      state.closeMark(type);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'escaped_text',
    runner: (state, mark, node) => {
      state.withMark(mark, 'escapedText', node.text ?? '');
      return true;
    },
  },
}));

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

export const preserveEscapes = $remark('madoc-escapes', () => function (this: { data(key: string): unknown }) {
  // Keep GFM's tokenizer-based autolinks, but skip its second pass over
  // decoded text: that pass incorrectly relinks escaped URLs and discards
  // source positions needed to preserve escapes on import/export.
  type Extension = { enter?: Record<string, unknown>; transforms?: unknown[] };
  const extensions = this.data('fromMarkdownExtensions') as (Extension | Extension[])[] | undefined;
  const retainTokenizedLinks = (items: (Extension | Extension[])[]) => {
    for (const extension of items) {
      if (Array.isArray(extension)) retainTokenizedLinks(extension);
      else if (extension.enter?.literalAutolink) extension.transforms = [];
    }
  };
  if (extensions) retainTokenizedLinks(extensions);
  return (tree, file) => {
    const source = String(file.value);
    const raw = (node: MarkdownNode) => source.slice(node.position?.start.offset, node.position?.end.offset);
    const visit = (parent: MarkdownNode) => {
      if (!parent.children) return;
      // GFM bare autolinks consume the backslash before an escaped closing
      // parenthesis. An explicitly escaped link destination remains literal.
      for (let i = 1; i < parent.children.length; i += 1) {
        const previous = parent.children[i - 1];
        const node = parent.children[i];
        const next = parent.children[i + 1];
        if (!previous.position || !node.position || previous.type !== 'text' || node.type !== 'link'
          || !/\]\\\($/.test(raw(previous)) || !/^https?:\/\//.test(raw(node))) continue;
        // The tokenizer may put the escaped closing parenthesis in the link
        // itself when more text follows it, or split it into the next text node.
        const tail = next?.type === 'text' && next.position ? next : node;
        const suffix = source.slice(node.position.start.offset, tail.position!.end.offset);
        if (!suffix.includes('\\)')) continue;
        const position = { start: previous.position.start, end: tail.position!.end };
        const merged = { type: 'text', position, value: decodeString(source.slice(position.start.offset, position.end.offset)) };
        parent.children.splice(i - 1, tail === node ? 2 : 3, merged);
        i -= 1;
      }
      parent.children = parent.children.flatMap((node) => {
        if (node.type !== 'text' || !node.position) { visit(node); return [node]; }
        const original = raw(node);
        if (!/\\[!-/:-@\[-`{-~]/.test(original)) return [node];
        const parts: MarkdownNode[] = [];
        let offset = 0;
        for (const match of original.matchAll(/\\([!-/:-@\[-`{-~])/g)) {
          if (match.index! > offset) parts.push({ type: 'text', value: decodeString(original.slice(offset, match.index)) });
          parts.push({ type: 'escapedText', value: match[1] });
          offset = match.index! + match[0].length;
        }
        if (offset < original.length) parts.push({ type: 'text', value: decodeString(original.slice(offset)) });
        // Block prefixes and CRLF can make source offsets differ from decoded
        // text. Keep the parser's text and protect its literal punctuation.
        if (parts.map((part) => part.value).join('') !== node.value) {
          return [...(node.value ?? '')].map((value) => ({ type: escapable.test(value) ? 'escapedText' : 'text', value }));
        }
        return parts;
      });
    };
    visit(tree as MarkdownNode);
  };
});

export function configureEscapes(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      escapedText: (node: { value?: string }) => String(node.value ?? '').replace(/[!-/:-@\[-`{-~]/g, '\\$&'),
    },
  }));
  // Wrap after all input rules have been registered, retaining each rule's
  // own matching behavior while rejecting matches across literal punctuation.
  ctx.update(editorStateOptionsCtx, (previous) => (options) => {
    for (const rule of ctx.get(inputRulesCtx)) {
      const mutable = rule as typeof rule & { handler: Exclude<ConstructorParameters<typeof InputRule>[1], string> };
      const handler = mutable.handler;
      mutable.handler = (state, match, start, end) => state.doc.rangeHasMark(start, end, escapedText.type(ctx))
        ? null : handler(state, match, start, end);
    }
    return previous(options);
  });
}
