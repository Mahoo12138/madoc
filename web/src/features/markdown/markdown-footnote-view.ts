import type { NodeViewConstructor } from '@milkdown/kit/prose/view';
import { footnoteDefinitionSchema } from '@milkdown/kit/preset/gfm';
import { $view } from '@milkdown/kit/utils';
import { redo, undo, yUndoPluginKey } from 'y-prosemirror';
import { collectFootnotes, footnoteId, validFootnoteLabel } from './markdown-footnote-model';

/** Keep definition paragraphs in ProseMirror; only its identifier uses an input. */
export const footnoteDefinitionView = $view(footnoteDefinitionSchema.node, (): NodeViewConstructor => (node, view, getPos) => {
  const dom = document.createElement('dl');
  dom.dataset.type = 'footnote_definition';
  dom.className = 'madoc-footnote-definition';
  dom.tabIndex = -1;
  const header = document.createElement('dt');
  header.contentEditable = 'false';
  const prefix = document.createElement('span');
  prefix.textContent = '[^';
  const label = document.createElement('input');
  label.className = 'madoc-footnote-label';
  label.setAttribute('aria-label', '脚注标识');
  label.spellcheck = false;
  const suffix = document.createElement('span');
  suffix.textContent = ']:';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'madoc-footnote-back';
  back.textContent = '↩';
  back.setAttribute('aria-label', '返回脚注引用');
  // Navigation is handled by the footnote plugin, including readonly documents.
  back.dataset.footnoteBack = '';
  header.append(prefix, label, suffix, back);
  const contentDOM = document.createElement('dd');
  dom.append(header, contentDOM);
  let current = node;
  let composing = false;
  const refresh = () => {
    dom.dataset.label = current.attrs.label;
    label.readOnly = !view.editable;
    label.style.width = `${Math.max(1, label.value.length)}ch`;
    back.dataset.footnoteBack = current.attrs.label;
    const references = collectFootnotes(view.state.doc).references;
    back.hidden = !references.some((reference) => reference.id === footnoteId(current.attrs.label));
  };
  label.value = current.attrs.label;
  const reset = () => {
    label.value = current.attrs.label;
    label.removeAttribute('aria-invalid');
    label.removeAttribute('title');
    refresh();
  };
  const change = () => {
    if (!view.editable || composing) return;
    const pos = getPos();
    if (pos === undefined) return;
    const next = label.value;
    const { definitions, references } = collectFootnotes(view.state.doc);
    const oldId = footnoteId(current.attrs.label);
    const nextId = footnoteId(next);
    const collision = definitions.some((definition) => definition.pos !== pos && definition.id === nextId);
    if (!validFootnoteLabel(next) || collision) {
      label.setAttribute('aria-invalid', 'true');
      label.title = collision ? '此脚注标识已存在' : '脚注标识不能为空或包含括号、反斜杠、换行';
      return;
    }
    label.removeAttribute('aria-invalid');
    label.removeAttribute('title');
    const transaction = view.state.tr.setNodeAttribute(pos, 'label', next);
    // Only an unambiguous definition owns matching references.
    if (definitions.filter((definition) => definition.id === oldId).length === 1) {
      for (const reference of references) {
        if (reference.id === oldId) transaction.setNodeAttribute(reference.pos, 'label', next);
      }
    }
    view.dispatch(transaction);
    refresh();
  };
  label.addEventListener('input', change);
  label.addEventListener('compositionstart', () => { composing = true; });
  label.addEventListener('compositionend', () => { composing = false; change(); });
  label.addEventListener('focus', () => yUndoPluginKey.getState(view.state)?.undoManager.stopCapturing());
  label.addEventListener('blur', reset);
  label.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.shiftKey || event.key.toLowerCase() === 'y') redo(view.state); else undo(view.state);
    } else if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      reset();
      label.blur();
      dom.focus();
    }
  });
  refresh();
  return {
    dom, contentDOM,
    update(next) {
      if (next.type !== current.type) return false;
      const changed = next.attrs.label !== current.attrs.label;
      current = next;
      if (changed && !composing) label.value = next.attrs.label;
      refresh();
      return true;
    },
    stopEvent: (event) => header.contains(event.target as globalThis.Node) && !(event.target as Element).closest('[data-footnote-back]'),
    ignoreMutation: (mutation) => mutation.type !== 'selection' && header.contains(mutation.target),
  };
});
