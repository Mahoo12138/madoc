import { emphasisSchema, inlineCodeSchema } from '@milkdown/kit/preset/commonmark';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

const textPairs = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['"', '"'],
  ["'", "'"],
]);

const closingCharacters = new Set(textPairs.values());
const wordCharacter = /[\p{L}\p{N}]/u;

function characterAt(doc: Parameters<NonNullable<Plugin['props']['handleTextInput']>>[0]['state']['doc'], position: number) {
  if (position < 0 || position >= doc.content.size) return '';
  return doc.textBetween(position, position + 1, '\n', '\n');
}

/**
 * Adds the small input affordances writers expect from a desktop Markdown editor
 * without changing the Milkdown document model.
 */
export const comfortableMarkdownInput = $prose((ctx) => {
  const emphasisMark = emphasisSchema.type(ctx);
  const inlineCodeMark = inlineCodeSchema.type(ctx);

  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (view.composing) return false;

        const { state } = view;
        const $from = state.doc.resolve(from);
        if ($from.parent.type.spec.code || $from.marks().some((mark) => mark.type === inlineCodeMark)) return false;

        if (from !== to) {
          const mark = text === '*' || text === '_' ? emphasisMark : text === '`' ? inlineCodeMark : null;
          if (mark) {
            const transaction = state.tr.addMark(from, to, mark.create());
            transaction.setSelection(TextSelection.create(transaction.doc, from, to));
            view.dispatch(transaction);
            return true;
          }

          const closing = textPairs.get(text);
          if (!closing) return false;
          const transaction = state.tr.insertText(closing, to).insertText(text, from);
          transaction.setSelection(TextSelection.create(transaction.doc, from + text.length, to + text.length));
          view.dispatch(transaction);
          return true;
        }

        const next = characterAt(state.doc, from);
        if (closingCharacters.has(text) && next === text) {
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from + 1)));
          return true;
        }

        const closing = textPairs.get(text);
        if (!closing) return false;

        const previous = characterAt(state.doc, from - 1);
        if (text === "'" && wordCharacter.test(previous)) return false;
        if (next && !/[\s)\]}]/u.test(next)) return false;

        const transaction = state.tr.insertText(`${text}${closing}`, from, to);
        transaction.setSelection(TextSelection.create(transaction.doc, from + text.length));
        view.dispatch(transaction);
        return true;
      },

      handleKeyDown(view, event) {
        if (event.key !== 'Backspace' || !view.state.selection.empty) return false;
        const { from } = view.state.selection;
        if (from <= 0) return false;

        const previous = characterAt(view.state.doc, from - 1);
        const next = characterAt(view.state.doc, from);
        if (textPairs.get(previous) !== next) return false;

        const transaction = view.state.tr.delete(from - 1, from + 1);
        transaction.setSelection(TextSelection.create(transaction.doc, from - 1));
        view.dispatch(transaction);
        return true;
      },
    },
  });
});

/** Marks the selected top-level block through ProseMirror decorations. */
export const activeBlockDecoration = $prose(() => new Plugin({
  props: {
    decorations(state) {
      const { $from } = state.selection;
      if ($from.depth < 1) return null;
      let depth = $from.depth;
      while (depth > 1 && !$from.node(depth).isTextblock) depth -= 1;
      const node = $from.node(depth);
      const from = $from.before(depth);
      return DecorationSet.create(state.doc, [
        Decoration.node(from, from + node.nodeSize, { class: 'madoc-current-block' }),
      ]);
    },
  },
}));
