import { decodeString } from 'micromark-util-decode-string';
import type { Ctx } from '@milkdown/kit/ctx';
import { footnoteReferenceSchema } from '@milkdown/kit/preset/gfm';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { $prose, $remark } from '@milkdown/kit/utils';
import { ySyncPluginKey } from 'y-prosemirror';
import { collectFootnotes, footnoteId } from './markdown-footnote-model';
import './markdown-footnote.css';

export function configureFootnotes(ctx: Ctx) {
  ctx.update(footnoteReferenceSchema.key, (previous) => (ctx) => ({
    ...previous(ctx),
    leafText: (node) => `[^${node.attrs.label}]`,
    toDOM: (node) => ['sup', {
      'data-type': 'footnote_reference', 'data-label': node.attrs.label,
      class: 'madoc-footnote-reference',
    }, ['span', { class: 'madoc-footnote-raw' }, `[^${node.attrs.label}]`]],
  }));
}

// GFM leaves references without a definition as text. Retain their intended
// syntax while users are still writing the definition (including after reload).
// Match source spelling so escaped or entity-encoded brackets remain literal.
type FootnoteAst = {
  type: string; value?: string; children?: FootnoteAst[];
  label?: string; identifier?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
};
export const preserveFootnoteReferences = $remark('madoc-footnote-references', () => () => (tree, file) => {
  const source = String(file.value);
  const walk = (node: FootnoteAst) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type !== 'text' || !child.value || child.position?.start.offset === undefined || child.position.end.offset === undefined) {
        walk(child); return [child];
      }
      const start = child.position.start.offset;
      const raw = source.slice(start, child.position.end.offset);
      if (decodeString(raw) !== child.value) return [child];
      const text = (from: number, to: number): FootnoteAst => ({
        type: 'text', value: decodeString(raw.slice(from, to)),
        position: { start: { offset: start + from }, end: { offset: start + to } },
      });
      const pieces: FootnoteAst[] = [];
      let offset = 0;
      for (const match of raw.matchAll(/\[\^([^\[\]\\\r\n]+)\]/g)) {
        let slashes = 0;
        for (let i = match.index! - 1; i >= 0 && raw[i] === '\\'; i -= 1) slashes += 1;
        if (!match[1].trim() || slashes % 2) continue;
        if (match.index! > offset) pieces.push(text(offset, match.index!));
        pieces.push({ type: 'footnoteReference', label: match[1], identifier: footnoteId(match[1]) });
        offset = match.index! + match[0].length;
      }
      if (!pieces.length) return [child];
      if (offset < raw.length) pieces.push(text(offset, raw.length));
      return pieces;
    });
  };
  walk(tree as FootnoteAst);
});

const key = new PluginKey<{ returnTo: number | null }>('madoc-footnotes');

function navigate(view: EditorView, position: number, returning = false) {
  const target = view.nodeDOM(position) as HTMLElement | null;
  if (view.editable) {
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position + 1))).setMeta('madoc-footnote-input', true).scrollIntoView());
    view.focus();
  }
  target?.scrollIntoView({ block: 'center', behavior: 'instant' });
  if (!view.editable || returning) {
    target?.setAttribute('tabindex', '-1');
    target?.focus({ preventScroll: true });
  }
}

export function jumpToFootnote(view: EditorView, from: number, label: string) {
  const definition = collectFootnotes(view.state.doc).definitions.find((entry) => entry.id === footnoteId(label));
  if (!definition) return false;
  view.dispatch(view.state.tr.setMeta(key, { returnTo: from }).setMeta('addToHistory', false));
  navigate(view, definition.pos);
  return true;
}

export const footnotes = $prose(() => {
  let editor: EditorView | undefined;
  return new Plugin({
    key,
    view(view) {
      editor = view;
      const refreshAccess = () => {
        // Crepe applies readonly after node views are constructed. setProps
        // updates plugin views even when the document itself has not changed.
        view.dom.querySelectorAll<HTMLInputElement>('.madoc-footnote-label').forEach((label) => {
          if (label.readOnly === view.editable) label.readOnly = !view.editable;
        });
      };
      refreshAccess();
      return { update: refreshAccess, destroy() { editor = undefined; } };
    },
    state: {
      init: () => ({ returnTo: null }),
      apply: (transaction, value) => ({ returnTo: transaction.getMeta(key)?.returnTo
        ?? (value.returnTo === null ? null : transaction.mapping.map(value.returnTo)) }),
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (!view.editable || view.composing || !text.endsWith(']')) return false;
        const $from = view.state.doc.resolve(from);
        if ($from.parent.type.name !== 'paragraph') return false;
        const before = $from.parent.textBetween(0, $from.parentOffset, '', '\ufffc') + text;
        if (!/\[\^([^\[\]\\\r\n]+)\]$/.test(before)) return false;
        const transaction = view.state.tr;
        // Respect the editor's auto-paired closing bracket, but distinguish
        // actual typing from moving the caret past a literal Markdown example.
        if (text === ']' && from === to && $from.nodeAfter?.isText && $from.nodeAfter.text?.startsWith(']')) {
          transaction.setSelection(TextSelection.create(transaction.doc, from + 1));
        } else transaction.insertText(text, from, to);
        view.dispatch(transaction.setMeta('madoc-footnote-typed', true));
        return true;
      },
      decorations(state) {
        const { references, definitions, numbers } = collectFootnotes(state.doc);
        const defined = new Set(definitions.map((definition) => definition.id));
        const decorations: Decoration[] = references.map((reference) => Decoration.node(reference.pos, reference.pos + 1, {
          'data-footnote-number': String(reference.number),
          'data-missing': String(!defined.has(reference.id)),
          'data-footnote-source': `[^${reference.label}]`,
          title: defined.has(reference.id) ? `脚注 ${reference.number}：${reference.label}（Ctrl / ⌘ 点击跳转）` : `未定义的脚注：${reference.label}`,
          'aria-label': `脚注 ${reference.number}：${reference.label}`,
        }));
        definitions.forEach((definition, index) => {
          decorations.push(Decoration.node(definition.pos, definition.pos + definition.node.nodeSize, {
            'data-footnote-number': numbers.has(definition.id) ? String(numbers.get(definition.id)) : '–',
            'data-footnote-start': String(index === 0),
          }));
        });
        return DecorationSet.create(state.doc, decorations);
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target as Element;
          const reference = target.closest('[data-type="footnote_reference"]');
          if (!reference || (view.editable && !event.ctrlKey && !event.metaKey)) return false;
          const found = jumpToFootnote(view, view.posAtDOM(reference, 0), (reference as HTMLElement).dataset.label!);
          if (found) event.preventDefault();
          return found;
        },
        click(view, event) {
          const back = (event.target as Element).closest<HTMLElement>('[data-footnote-back]');
          if (!back) return false;
          event.preventDefault();
          const id = footnoteId(back.dataset.footnoteBack!);
          const model = collectFootnotes(view.state.doc);
          const remembered = key.getState(view.state)?.returnTo;
          const reference = model.references.find((entry) => entry.id === id && entry.pos === remembered)
            ?? model.references.find((entry) => entry.id === id);
          if (reference) navigate(view, reference.pos, true);
          return true;
        },
      },
    },
    appendTransaction(transactions, _oldState, state) {
      if (!editor?.editable || !transactions.some((transaction) => transaction.docChanged || transaction.selectionSet)
        || transactions.some((transaction) => transaction.getMeta(key) || transaction.getMeta(ySyncPluginKey))
        || !state.selection.empty) return null;
      const { $from } = state.selection;
      if ($from.parent.type.name !== 'paragraph') return null;
      const first = $from.parent.firstChild;
      if (first?.type.name === 'footnote_reference' && $from.parent.childCount >= 2
        && $from.parent.child(1).isText && $from.parent.child(1).text?.startsWith(': ')) {
        const content = $from.parent.content.cut(3);
        const definition = state.schema.nodes.footnote_definition.create({ label: first.attrs.label },
          state.schema.nodes.paragraph.create(null, content));
        const from = $from.before();
        const transaction = state.tr.replaceWith(from, $from.after(), definition);
        return transaction.setSelection(TextSelection.near(transaction.doc.resolve(from + 2))).setMeta(key, {}).setMeta('madoc-footnote-input', true);
      }
      if (!transactions.some((transaction) => transaction.getMeta('madoc-footnote-typed'))) return null;
      const before = $from.parent.textBetween(0, $from.parentOffset, '', '\ufffc');
      const match = /\[\^([^\[\]\\\r\n]+)\]$/.exec(before);
      if (!match || !match[1].trim()) return null;
      const from = state.selection.from - match[0].length;
      let plain = true;
      state.doc.nodesBetween(from, state.selection.from, (node) => {
        if (node.isInline && (!node.isText || node.marks.some((mark) => ['inlineCode', 'escaped_text'].includes(mark.type.name)))) plain = false;
      });
      if (!plain) return null;
      return state.tr.replaceWith(from, state.selection.from, state.schema.nodes.footnote_reference.create({ label: match[1] }))
        .setMeta(key, {}).setMeta('madoc-footnote-input', true);
    },
  });
});
