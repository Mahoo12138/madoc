import { Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView as CodeMirror, keymap } from '@codemirror/view';
import { nodesCtx, nodeViewCtx } from '@milkdown/kit/core';
import { CodeMirrorBlock } from '@milkdown/kit/component/code-block';
import { codeBlockSchema } from '@milkdown/kit/preset/commonmark';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';
import { $node, $view } from '@milkdown/kit/utils';
import { presentBlockMath } from './markdown-block-math';
import { highlightedCodeLines } from './markdown-code-lines';
import { presentCodeLanguagePicker } from './markdown-code-language-view';
import { parseCodeFenceInfo, startsWithCodeLineGroup } from './markdown-code-fence';

const refreshHighlights = StateEffect.define<null>();

// Crepe extends code blocks for block math. Extend the final registered schema
// so both fence metadata and its existing math serialization remain intact.
export const codeHighlightSchema = $node('code_block', (ctx) => {
  const schema = ctx.get(nodesCtx).find(([name]) => name === 'code_block')![1];
  return {
    ...schema,
    attrs: { ...schema.attrs, meta: { default: '', validate: 'string' } },
    parseDOM: [{
      tag: 'pre', preserveWhitespace: 'full',
      getAttrs: (dom) => ({ language: dom.dataset.language ?? '', meta: dom.dataset.codeMeta ?? '' }),
    }],
    toDOM: (node) => {
      const dom = schema.toDOM!(node) as [string, Record<string, unknown>, ...unknown[]];
      dom[1] = { ...dom[1], 'data-code-meta': node.attrs.meta || null };
      return dom as ReturnType<NonNullable<typeof schema.toDOM>>;
    },
    parseMarkdown: {
      match: (node) => node.type === 'code',
      runner: (state, node, type) => {
        state.openNode(type, parseCodeFenceInfo(String(node.lang ?? ''), String(node.meta ?? '')));
        if (node.value) state.addText(String(node.value));
        state.closeNode();
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'code_block',
      runner: (state, node) => {
        if (!node.attrs.meta) return schema.toMarkdown.runner(state, node);
        const plain = !node.attrs.language;
        const meta = String(node.attrs.meta);
        state.addNode(plain && startsWithCodeLineGroup(meta) ? 'madocPlainCode' : 'code', undefined, node.textContent, {
          lang: node.attrs.language || 'text',
          meta: node.attrs.meta || null,
        });
      },
    },
  };
});

/** Extend Crepe's existing, lazily created CodeMirror view rather than replacing it. */
export const codeHighlights = (root: HTMLElement) => $view(codeBlockSchema.node, (ctx): NodeViewConstructor => {
  const create = ctx.get(nodeViewCtx).find(([name]) => name === 'code_block')![1];
  return (node, view, getPos, decorations, innerDecorations) => {
    const inner = create(node, view, getPos, decorations, innerDecorations);
    if (!(inner instanceof CodeMirrorBlock)) return inner;
    let meta = String(node.attrs.meta ?? '');
    const highlights = StateField.define({
      create(state) {
        return Decoration.set(highlightedCodeLines(meta, state.doc.lines).map((line) =>
          Decoration.line({ class: 'madoc-code-highlight' }).range(state.doc.line(line).from)));
      },
      update(value, transaction) {
        if (!transaction.docChanged && !transaction.effects.some((effect) => effect.is(refreshHighlights))) return value;
        return Decoration.set(highlightedCodeLines(meta, transaction.state.doc.lines).map((line) =>
          Decoration.line({ class: 'madoc-code-highlight' }).range(transaction.state.doc.line(line).from)));
      },
      provide: (field) => CodeMirror.decorations.from(field),
    });
    // The constructor waits for IntersectionObserver before creating CodeMirror.
    // Keep this per-node configuration for off-screen teardown/recreation too.
    // These Crepe shortcuts dispatch ProseMirror changes directly, bypassing
    // CodeMirror's readOnly facet/change filter. Check live editor permissions
    // before its keymap while leaving navigation and copying available.
    const readonlyShortcuts = Prec.highest(keymap.of(
      ['Backspace', 'Mod-Enter', 'Mod-z', 'Mod-y', 'Shift-Mod-z'].map((key) => ({
        key, run: () => !view.editable,
      })),
    ));
    inner.config = { ...inner.config, extensions: [...inner.config.extensions, readonlyShortcuts, highlights] };
    const update = inner.update.bind(inner);
    inner.update = (next) => {
      if (next.type !== node.type) return false;
      const nextMeta = String(next.attrs.meta ?? '');
      const changed = nextMeta !== meta;
      meta = nextMeta;
      const accepted = update(next);
      if (accepted && changed && inner.cm?.dom.isConnected) inner.cm.dispatch({ effects: refreshHighlights.of(null) });
      return accepted;
    };
    presentCodeLanguagePicker(inner, root);
    return presentBlockMath(inner, node, view);
  };
});
