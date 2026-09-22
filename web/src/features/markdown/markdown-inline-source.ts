import { parserCtx, serializerCtx } from '@milkdown/kit/core';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import {
  absolutePositionToRelativePosition, relativePositionToAbsolutePosition,
  redo, undo, ySyncPluginKey, yUndoPluginKey,
} from 'y-prosemirror';
import { createAbsolutePositionFromRelativePosition, createRelativePositionFromTypeIndex, type RelativePosition } from 'yjs';
import {
  escapeSourceOffset, filledPairAt, inlineRangeAt, mapSourceOffset, mergeComposition, parseInline,
  type InlineRange, type InlineSource,
} from './markdown-inline-codec';
import { createInlinePresentation, type InlineMathPreview } from './markdown-inline-presentation';

const sourceKey = new PluginKey<InlineRange | null>('madoc-inline-source');
type SourceMeta = { range: InlineRange | null; activate?: InlineSource };
const labels: Record<string, string> = {
  escaped_text: '编辑转义文本源码',
  link: '编辑链接源码',
  strong: '编辑加粗源码',
  emphasis: '编辑斜体源码',
  inlineCode: '编辑行内代码源码',
  math_inline: '编辑行内公式',
  footnote_reference: '编辑脚注引用源码',
};

/**
 * The source field is a local editing view. Every input is parsed into standard
 * Milkdown nodes/marks and applied as a minimal transaction to the same Y.Doc.
 * No draft waits for blur, and remote updates map the range and refresh the field.
 */
export const inlineSourceEditing = (onPreviewChange: (preview: InlineMathPreview | null) => void) => $prose((ctx) => {
  let view: EditorView;
  let composing = false;
  let syncing = false;
  let opening = false;
  let generation = 0;
  let pendingActivation: InlineSource | undefined;
  let anchors: { from: RelativePosition; to: RelativePosition } | undefined;
  let focused = false;
  let compositionBase = '';
  let compositionRemote: string | undefined;
  let source: HTMLInputElement;
  let shell: HTMLSpanElement;
  let presentation: ReturnType<typeof createInlinePresentation>;

  const serialize = (range: InlineRange) => {
    const state = view.state;
    const fragment = state.doc.slice(range.from, range.to).content;
    if (range.kind === 'escaped_text') {
      let raw = '';
      let literal = true;
      fragment.forEach((node) => {
        if (!node.isText || node.marks.some((mark) => mark.type.name !== 'escaped_text')) literal = false;
        raw += node.marks.some((mark) => mark.type.name === 'escaped_text')
          ? (node.text ?? '').replace(/[!-/:-@\[-`{-~]/g, '\\$&') : node.text ?? '';
      });
      if (literal) return raw;
    }
    let plain = true;
    fragment.forEach((node) => { if (!node.isText || node.marks.length > 0) plain = false; });
    if (plain) return fragment.textBetween(0, fragment.size);
    const paragraph = state.schema.nodes.paragraph.create(null, fragment);
    return ctx.get(serializerCtx)(state.schema.topNodeType.create(null, paragraph)).replace(/\n+$/, '');
  };
  const resize = () => {
    const range = sourceKey.getState(view.state);
    if (range) presentation.update(view, range);
  };
  const open = (range: InlineRange, cursor?: number, raw?: string) => {
    if (!view.editable || composing) return;
    source.value = raw ?? serialize(range);
    source.setAttribute('aria-label', labels[range.kind]);
    yUndoPluginKey.getState(view.state)?.undoManager.stopCapturing();
    opening = true;
    view.dispatch(view.state.tr.setMeta(sourceKey, { range } satisfies SourceMeta).setMeta('addToHistory', false));
    opening = false;
    resize();
    source.focus({ preventScroll: true });
    const offset = cursor ?? Math.max(0, source.value.length - (range.kind === 'strong' ? 2 : 1));
    source.setSelectionRange(offset, offset);
  };
  const close = (position?: number, focus = true) => {
    const range = sourceKey.getState(view.state);
    if (!range) return;
    const transaction = view.state.tr.setMeta(sourceKey, { range: null } satisfies SourceMeta).setMeta('addToHistory', false);
    // Removing a line-start escape can turn a complete paragraph into a
    // heading, quote or list. Apply that block change when leaving source.
    const $start = view.state.doc.resolve(range.from);
    if (range.kind === 'escaped_text' && $start.parent.type.name === 'paragraph'
      && range.from === $start.start() && range.to === $start.end()) {
      const parsed = ctx.get(parserCtx)(source.value);
      if (parsed?.childCount === 1 && parsed.firstChild?.isBlock && parsed.firstChild.type.name !== 'paragraph') {
        const from = $start.before();
        transaction.replaceWith(from, $start.after(), parsed.content).setMeta('addToHistory', true);
        transaction.setSelection(TextSelection.near(transaction.doc.resolve(from + 1)));
        position = undefined;
      }
    }
    if (position !== undefined) {
      const $position = transaction.doc.resolve(position);
      transaction.setSelection(TextSelection.near($position));
      if (position === range.from || position === range.to) {
        const outside = position === range.from ? $position.nodeBefore : $position.nodeAfter;
        transaction.setStoredMarks(outside?.marks ?? []);
      }
    }
    view.dispatch(transaction);
    yUndoPluginKey.getState(view.state)?.undoManager.stopCapturing();
    if (focus) view.focus();
  };
  const sync = () => {
    const range = sourceKey.getState(view.state);
    if (!range || !view.editable) return;
    if (composing) { resize(); return; }
    const parsed = parseInline(source.value, ctx.get(parserCtx), view.state);
    const current = view.state.doc.slice(range.from, range.to).content;
    const start = current.findDiffStart(parsed);
    if (start === null) { resize(); return; }
    const end = current.findDiffEnd(parsed)!;
    const overlap = start - Math.min(end.a, end.b);
    if (overlap > 0) { end.a += overlap; end.b += overlap; }
    const transaction = view.state.tr.replaceWith(range.from + start, range.from + end.a, parsed.cut(start, end.b));
    const next = { ...range, to: range.from + parsed.size };
    // The native field owns the exact source selection; the shared cursor stays
    // inside its canonical range and never points into synthetic delimiters.
    const offset = Math.min(parsed.size, Math.max(0, range.kind === 'escaped_text' ? escapeSourceOffset(source.value, source.selectionStart ?? 0, false) : (source.selectionStart ?? 0) - (range.kind === 'strong' ? 2 : 1)));
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(range.from + offset)));
    transaction.setMeta(sourceKey, { range: next } satisfies SourceMeta);
    syncing = true;
    view.dispatch(transaction);
    syncing = false;
    resize();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || composing) return;
    const range = sourceKey.getState(view.state);
    if (!range) return;
    if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.shiftKey || event.key.toLowerCase() === 'y') redo(view.state); else undo(view.state);
      return;
    }
    if (!event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const atStart = source.selectionStart === 0 && source.selectionEnd === 0;
      const atEnd = source.selectionStart === source.value.length && source.selectionEnd === source.value.length;
      if ((event.key === 'ArrowLeft' && atStart) || (event.key === 'ArrowRight' && atEnd)) {
        event.preventDefault();
        close(event.key === 'ArrowLeft' ? range.from : range.to);
        return;
      }
    }
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const offset = Math.min(range.to - range.from, Math.max(0, range.kind === 'escaped_text' ? escapeSourceOffset(source.value, source.selectionStart ?? 0, false) : (source.selectionStart ?? 0) - (range.kind === 'strong' ? 2 : 1)));
      close(range.from + offset);
      if (event.key !== 'Escape') view.someProp('handleKeyDown', (handler) => handler(view, event));
    }
  };

  const activateAt = (editor: EditorView, position: number, event: MouseEvent) => {
    const target = event.target;
    if (!editor.editable || !(target instanceof Element) || shell?.contains(target)) return false;
    if ((event.ctrlKey || event.metaKey) && target.closest('[data-type="footnote_reference"]')) return false;
    const active = sourceKey.getState(editor.state);
    if (active && position >= active.from && position <= active.to) {
      // The source widget hides the canonical text, so posAtCoords can report
      // its start even when clicking beyond its right edge. Use the visible
      // field's bounds without reserializing an in-progress source edit.
      const bounds = source.getBoundingClientRect();
      if (event.clientY >= bounds.top && event.clientY <= bounds.bottom
        && (event.clientX <= bounds.left || event.clientX >= bounds.right)) {
        const cursor = event.clientX >= bounds.right ? source.value.length : 0;
        source.focus({ preventScroll: true });
        source.setSelectionRange(cursor, cursor);
        return true;
      }
    }
    const element = target.closest('a') ?? target.closest('strong, em, code, [data-type="math_inline"], [data-type="footnote_reference"]');
    if (target.closest('pre')) return false;
    const kind = !element ? undefined : element.matches('a') ? 'link' : element.matches('strong') ? 'strong' : element.matches('em') ? 'emphasis' : element.matches('code') ? 'inlineCode' : element.matches('[data-type="footnote_reference"]') ? 'footnote_reference' : 'math_inline';
    const range = inlineRangeAt(editor.state, position, kind) ?? inlineRangeAt(editor.state, Math.max(0, position - 1), kind);
    if (!range) return false;
    const raw = serialize(range);
    const markerLength = range.kind === 'strong' ? 2 : range.kind === 'inlineCode' ? (raw.match(/^`+/)?.[0].length ?? 1) : 1;
    // A click outside the rendered span maps to its document boundary. Keep
    // that boundary outside the complete source, including closing delimiters
    // and link destinations, rather than clamping it into the visible label.
    const cursor = position <= range.from ? 0 : position >= range.to ? raw.length
      : range.kind === 'escaped_text' ? escapeSourceOffset(raw, position - range.from, true)
        : Math.min(raw.length - markerLength, markerLength + position - range.from);
    open(range, cursor, raw);
    return true;
  };

  return new Plugin<InlineRange | null>({
    key: sourceKey,
    state: {
      init: () => null,
      apply(transaction, range, previousState) {
        const meta = transaction.getMeta(sourceKey) as SourceMeta | undefined;
        if (meta) {
          if (meta.activate) pendingActivation = meta.activate;
          return meta.range;
        }
        if (!range || !transaction.docChanged) return range;
        if (transaction.getMeta(ySyncPluginKey) && anchors) {
          // y-prosemirror replaces the document in remote transactions. Ordinary
          // step mapping cannot preserve an interior range; use Yjs anchors.
          const sync = ySyncPluginKey.getState(previousState);
          const from = relativePositionToAbsolutePosition(sync.doc, sync.type, anchors.from, sync.binding.mapping);
          const to = relativePositionToAbsolutePosition(sync.doc, sync.type, anchors.to, sync.binding.mapping);
          if (from === null || to === null || from >= to) return null;
          return { ...range, from, to };
        }
        const from = transaction.mapping.mapResult(range.from, -1);
        const to = transaction.mapping.mapResult(range.to, 1);
        if ((from.deletedAcross && to.deletedAcross) || from.pos > to.pos) return null;
        return { ...range, from: from.pos, to: to.pos };
      },
    },
    props: {
      decorations(state) {
        const range = sourceKey.getState(state);
        if (!range || !shell) return null;
        const decorations = [Decoration.widget(range.from, shell, {
          key: 'inline-source', side: -1, marks: [], ignoreSelection: true,
          stopEvent: (event) => shell.contains(event.target as Node),
        })];
        if (range.to > range.from) decorations.push(Decoration.inline(range.from, range.to, { class: 'madoc-inline-hidden' }));
        return DecorationSet.create(state.doc, decorations);
      },
      handleClick(editor, position, event) {
        return activateAt(editor, position, event);
      },
      handleKeyDown(editor, event) {
        if (!editor.editable || !editor.state.selection.empty || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
        const position = editor.state.selection.from;
        const target = event.key === 'ArrowLeft' ? position - 1 : position;
        if (target < 0) return false;
        const range = inlineRangeAt(editor.state, target);
        if (!range) return false;
        const raw = serialize(range);
        // Enter through the outside delimiter so each arrow has a real position.
        const cursor = position <= range.from ? 1 : position >= range.to ? raw.length - 1 : range.kind === 'escaped_text' ? escapeSourceOffset(raw, position - range.from, true) : Math.min(raw.length, position - range.from + (range.kind === 'strong' ? 2 : 1));
        open(range, cursor, raw);
        return true;
      },
      handleDOMEvents: {
        mousedown(editor, event) {
          if (event.button !== 0 || event.shiftKey) return false;
          const position = editor.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!position || !activateAt(editor, position.pos, event)) return false;
          event.preventDefault();
          return true;
        },
        compositionend() {
          // Input rules do not run while IME composition is active.
          const currentGeneration = generation;
          queueMicrotask(() => {
            if (generation === currentGeneration && !sourceKey.getState(view.state)) view.dispatch(view.state.tr.setMeta('inline-composition-end', true));
          });
          return false;
        },
      },
    },
    appendTransaction(transactions, _oldState, state) {
      if (!view?.editable || view.composing || sourceKey.getState(state)) return null;
      if (transactions.some((transaction) => transaction.getMeta(sourceKey) || transaction.getMeta('madoc-footnote-input') || transaction.getMeta(ySyncPluginKey))) return null;
      // DOM selections can land on the adjacent plain text node at either edge.
      // Listen to selection changes, not only clicks whose target is a mark.
      if (view.hasFocus() && state.selection.empty && transactions.some((transaction) => transaction.selectionSet && !transaction.docChanged)) {
        const position = state.selection.from;
        const range = inlineRangeAt(state, position) ?? inlineRangeAt(state, Math.max(0, position - 1));
        if (range) {
          const raw = serialize(range);
          const cursor = position <= range.from ? 0 : position >= range.to ? raw.length : range.kind === 'escaped_text' ? escapeSourceOffset(raw, position - range.from, true) : position - range.from + (range.kind === 'strong' ? 2 : 1);
          return state.tr.setMeta(sourceKey, { range, activate: { ...range, raw, cursor } } satisfies SourceMeta).setMeta('addToHistory', false);
        }
      }
      if (!transactions.some((transaction) => transaction.docChanged || transaction.getMeta('inline-composition-end'))) return null;
      const pair = filledPairAt(state, ctx.get(parserCtx));
      if (!pair) return null;
      const parsed = parseInline(pair.raw, ctx.get(parserCtx), state);
      const range = { from: pair.from, to: pair.from + parsed.size, kind: pair.kind };
      const transaction = state.tr.replaceWith(pair.from, pair.to, parsed);
      return transaction.setSelection(TextSelection.near(transaction.doc.resolve(range.to)))
        .setMeta(sourceKey, { range, activate: { ...pair, ...range } } satisfies SourceMeta);
    },
    view(editor) {
      view = editor;
      shell = document.createElement('span');
      shell.className = 'madoc-inline-source-shell';
      shell.contentEditable = 'false';
      source = document.createElement('input');
      source.className = 'madoc-inline-source';
      source.spellcheck = false;
      shell.append(source);
      presentation = createInlinePresentation(shell, source, onPreviewChange);
      source.addEventListener('focus', () => { focused = true; });
      source.addEventListener('input', sync);
      window.addEventListener('resize', resize);
      document.fonts.addEventListener('loadingdone', resize);
      source.addEventListener('compositionstart', () => {
        composing = true;
        compositionBase = source.value;
        compositionRemote = undefined;
      });
      source.addEventListener('compositionend', () => {
        composing = false;
        if (compositionRemote !== undefined) {
          const previous = source.value;
          const merged = mergeComposition(compositionBase, previous, compositionRemote);
          const cursor = mapSourceOffset(previous, merged, source.selectionStart ?? previous.length);
          source.value = merged;
          source.setSelectionRange(cursor, cursor);
          compositionRemote = undefined;
        }
        sync();
      });
      source.addEventListener('keydown', keydown);
      source.addEventListener('blur', () => {
        const currentGeneration = generation;
        queueMicrotask(() => {
          if (generation === currentGeneration && !opening && document.activeElement !== source) {
            focused = false;
            close(undefined, false);
          }
        });
      });
      return {
        update(nextView, previousState) {
          view = nextView;
          const range = sourceKey.getState(view.state);
          if (!range) presentation.hidePreview();
          if (pendingActivation) {
            const pending = pendingActivation;
            pendingActivation = undefined;
            source.value = pending.raw;
            source.setAttribute('aria-label', labels[pending.kind]);
            resize();
            source.focus({ preventScroll: true });
            source.setSelectionRange(pending.cursor, pending.cursor);
          } else if (range && composing && !previousState.doc.eq(view.state.doc)) {
            compositionRemote = serialize(range);
            if (focused) source.focus({ preventScroll: true });
          } else if (range && !syncing && !opening && !composing && !previousState.doc.eq(view.state.doc)) {
            const previous = source.value;
            const next = serialize(range);
            const from = mapSourceOffset(previous, next, source.selectionStart ?? 0);
            const to = mapSourceOffset(previous, next, source.selectionEnd ?? 0);
            source.value = next;
            source.setSelectionRange(from, to);
            resize();
            if (focused) source.focus({ preventScroll: true });
          }
          // Milkdown appends the Yjs plugin after editor plugins. Capture anchors
          // after its view update has written this transaction into the Y.Doc.
          const currentGeneration = generation;
          queueMicrotask(() => {
            if (generation !== currentGeneration) return;
            const currentRange = sourceKey.getState(view.state);
            const sync = ySyncPluginKey.getState(view.state);
            if (currentRange && sync?.binding) {
              const from = absolutePositionToRelativePosition(currentRange.from, sync.type, sync.binding.mapping);
              const absolute = createAbsolutePositionFromRelativePosition(from, sync.doc);
              anchors = {
                from: absolute ? createRelativePositionFromTypeIndex(absolute.type, absolute.index, -1) : from,
                to: absolutePositionToRelativePosition(currentRange.to, sync.type, sync.binding.mapping),
              };
            } else anchors = undefined;
          });
        },
        destroy() {
          generation += 1;
          pendingActivation = undefined;
          window.removeEventListener('resize', resize);
          document.fonts.removeEventListener('loadingdone', resize);
          presentation.hidePreview();
        },
      };
    },
  });
});
