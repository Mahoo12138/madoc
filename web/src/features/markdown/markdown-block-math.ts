import { CodeMirrorBlock } from '@milkdown/kit/component/code-block';
import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import './markdown-block-math.css';

const isMath = (language: unknown) => String(language ?? '').toLowerCase() === 'latex';

/** Keep Crepe's CodeMirror, KaTeX and collaboration; only change math's local presentation. */
export function presentBlockMath(inner: NodeView, node: Node, view: EditorView): NodeView {
  const math = isMath(node.attrs.language);
  const update = inner.update?.bind(inner);
  let refreshPresentation = () => {};
  // Language changes must recreate the per-node configuration in either direction.
  inner.update = (next, nextDecorations, nextInnerDecorations) => {
    if (math !== isMath(next.attrs.language)) return false;
    const accepted = update?.(next, nextDecorations, nextInnerDecorations) ?? false;
    if (accepted) refreshPresentation();
    return accepted;
  };
  if (!math || !(inner instanceof CodeMirrorBlock)) return inner;

  const dom = inner.dom;
  dom.classList.add('madoc-block-math');
  dom.contentEditable = 'false';
  dom.setAttribute('role', 'group');
  dom.setAttribute('aria-label', '块级公式');
  dom.tabIndex = 0;
  // Reuse the existing button, but keep preview/source visibility as local
  // focus state, independent of the document and other collaborators.
  inner.config = {
    ...inner.config,
    previewOnlyByDefault: false,
    previewToggleButton: () => '<span aria-label="完成公式编辑">Math ✓</span>',
  };
  const setEditing = (editing: boolean) => {
    dom.dataset.editing = String(view.editable && (editing || !inner.node.textContent));
  };
  refreshPresentation = () => setEditing(dom.dataset.editing === 'true');
  setEditing(false);
  const open = () => {
    if (!view.editable) return;
    setEditing(true);
    // setSelection also initializes an off-screen CodeMirror when necessary.
    inner.setSelection(inner.node.content.size, inner.node.content.size);
  };
  const mousedown = (event: MouseEvent) => {
    // Keep source focus until click; otherwise its blur can hide the button
    // between pointerdown and click and retarget the click to the preview.
    if ((event.target as Element).closest('.preview-toggle-button')) event.preventDefault();
  };
  const click = (event: MouseEvent) => {
    const target = event.target as Element;
    if (target.closest('.preview-toggle-button')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      inner.cm?.contentDOM.blur();
      setEditing(false);
      dom.focus({ preventScroll: true });
    } else if (target.closest('.preview-panel') || target === dom) {
      open();
    }
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.target === dom && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      open();
    }
  };
  const focusin = (event: FocusEvent) => {
    if ((event.target as Element).closest('.cm-editor')) setEditing(true);
  };
  const focusout = () => {
    queueMicrotask(() => {
      if (!dom.contains(dom.ownerDocument.activeElement)) setEditing(false);
    });
  };
  dom.addEventListener('mousedown', mousedown);
  dom.addEventListener('click', click, true);
  dom.addEventListener('keydown', keydown);
  dom.addEventListener('focusin', focusin);
  dom.addEventListener('focusout', focusout);
  const setSelection = inner.setSelection.bind(inner);
  inner.setSelection = (anchor, head) => {
    setEditing(true);
    setSelection(anchor, head);
  };
  const selectNode = inner.selectNode.bind(inner);
  inner.selectNode = () => { setEditing(true); selectNode(); };
  const destroy = inner.destroy.bind(inner);
  inner.destroy = () => {
    dom.removeEventListener('mousedown', mousedown);
    dom.removeEventListener('click', click, true);
    dom.removeEventListener('keydown', keydown);
    dom.removeEventListener('focusin', focusin);
    dom.removeEventListener('focusout', focusout);
    destroy();
  };
  return inner;
}

// A collapsed node view has no native text caret target. Move the ProseMirror
// selection into adjacent math explicitly so setSelection can reveal its source.
export const blockMathNavigation = $prose(() => new Plugin({
  props: {
    handleKeyDown(view, event) {
      if (!view.editable || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
      const directions: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      };
      const direction = directions[event.key];
      if (!direction || !view.state.selection.empty) return false;
      const { $head } = view.state.selection;
      if (!$head.depth || !view.endOfTextblock(direction)) return false;
      const forward = direction === 'right' || direction === 'down';
      const boundary = forward ? $head.after() : $head.before();
      const resolved = view.state.doc.resolve(boundary);
      const next = forward ? resolved.nodeAfter : resolved.nodeBefore;
      if (next?.type.name !== 'code_block' || !isMath(next.attrs.language)) return false;
      const position = forward ? boundary + 1 : boundary - 1;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)).scrollIntoView());
      return true;
    },
  },
}));
