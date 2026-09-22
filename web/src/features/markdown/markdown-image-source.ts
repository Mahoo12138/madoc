import type { Ctx } from '@milkdown/kit/ctx';
import { nodeViewCtx, parserCtx, serializerCtx } from '@milkdown/kit/core';
import { imageBlockSchema } from '@milkdown/kit/component/image-block';
import { imageSchema } from '@milkdown/kit/preset/commonmark';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';
import { $view } from '@milkdown/kit/utils';
import { redo, undo, yUndoPluginKey } from 'y-prosemirror';
import { mapSourceOffset, mergeComposition } from './markdown-inline-codec';

/** Crepe used alt for its resize ratio. Preserve real alt text independently. */
export function configureImageSource(ctx: Ctx) {
  ctx.update(imageBlockSchema.key, (previous) => (ctx) => {
    const schema = previous(ctx);
    return {
      ...schema,
      attrs: { ...schema.attrs, alt: { default: null } },
      parseMarkdown: {
        match: schema.parseMarkdown.match,
        runner: (state, node, type) => {
          state.addNode(type, { src: node.url ?? '', caption: node.title ?? '', alt: node.alt ?? '', ratio: 1 });
        },
      },
      toMarkdown: {
        match: schema.toMarkdown.match,
        runner: (state, node) => {
          state.openNode('paragraph');
          state.addNode('image', undefined, undefined, {
            url: node.attrs.src, title: node.attrs.caption,
            // Old persisted images have no alt attribute; keep their export stable.
            alt: node.attrs.alt ?? `${Number.parseFloat(node.attrs.ratio).toFixed(2)}`,
          });
          state.closeNode();
        },
      },
    };
  });
}

function withImageSource(ctx: Ctx, original: NodeViewConstructor): NodeViewConstructor {
  return (initialNode, view, getPos, decorations, innerDecorations) => {
    const inner = original(initialNode, view, getPos, decorations, innerDecorations);
    let node = initialNode;
    let selected = false;
    let failed = false;
    let invalid = false;
    let composing = false;
    let syncing = false;
    let compositionBase = '';
    let compositionRemote: string | undefined;
    const block = node.type.name === 'image-block';
    const dom = document.createElement(block ? 'div' : 'span');
    dom.className = `madoc-image-source-view ${block ? 'is-block' : 'is-inline'}`;
    dom.contentEditable = 'false';
    const source = document.createElement('textarea');
    source.className = 'madoc-image-source';
    source.setAttribute('aria-label', '编辑图片 Markdown 源码');
    source.spellcheck = false;
    source.draggable = false;
    source.rows = 1;
    const sourceRow = document.createElement('span');
    sourceRow.className = 'madoc-image-source-row';
    const indicator = document.createElement('span');
    indicator.className = 'madoc-image-source-indicator';
    indicator.setAttribute('role', 'img');
    indicator.setAttribute('aria-label', '无法渲染图片');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M3 3l18 18M3 8v11a2 2 0 0 0 2 2h11M8 3h11a2 2 0 0 1 2 2v11M3 17l5-5 9 9M15 7h.01');
    svg.append(path);
    indicator.append(svg);
    sourceRow.append(indicator, source);
    dom.append(sourceRow, inner.dom);

    // stopEvent isolates editor handlers, but cannot stop the browser dragging
    // a draggable ancestor when the pointer starts over selected textarea text.
    let selectingSource = false;
    const onPointerDown = (event: Event) => {
      selectingSource = source.contains(event.target as Node);
      dom.draggable = !selectingSource && Boolean(node.type.spec.draggable);
    };
    dom.addEventListener('pointerdown', onPointerDown, true);
    dom.addEventListener('mousedown', onPointerDown, true);
    dom.addEventListener('dragstart', (event) => {
      if (!selectingSource && !source.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    const serialize = () => {
      const content = block ? node : node.type.schema.nodes.paragraph.create(null, node);
      return ctx.get(serializerCtx)(node.type.schema.topNodeType.create(null, content)).trimEnd();
    };
    const resize = () => {
      source.style.height = 'auto';
      source.style.height = `${source.scrollHeight}px`;
    };
    const refreshVisibility = () => {
      source.readOnly = !view.editable;
      source.hidden = !(selected || failed || source === document.activeElement || invalid);
      sourceRow.hidden = source.hidden;
      indicator.hidden = !(failed || invalid);
      dom.classList.toggle('is-failed', failed);
      if (!source.hidden) resize();
    };
    const sync = () => {
      if (composing || !view.editable) return;
      let image: ProseNode | undefined;
      try {
        const parsed = ctx.get(parserCtx)(source.value);
        if (parsed?.childCount === 1) {
          const first = parsed.firstChild!;
          if (first.type.name === 'image-block') image = first;
          if (first.type.name === 'paragraph' && first.childCount === 1 && first.firstChild?.type.name === 'image') image = first.firstChild;
        }
      } catch { /* An incomplete Markdown token remains editable locally. */ }
      source.setAttribute('aria-invalid', String(!image));
      invalid = !image;
      refreshVisibility();
      if (!image) { resize(); return; }
      const pos = getPos();
      if (pos === undefined) return;
      const attrs = image.type.name === 'image-block'
        ? { src: image.attrs.src, alt: image.attrs.alt ?? '', title: image.attrs.caption }
        : image.attrs;
      const nextAttrs = block
        ? { ...node.attrs, src: attrs.src, alt: attrs.alt, caption: attrs.title ?? '' }
        : { ...node.attrs, src: attrs.src, alt: attrs.alt, title: attrs.title ?? '' };
      if (Object.entries(nextAttrs).some(([key, value]) => value !== node.attrs[key])) {
        syncing = true;
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, nextAttrs));
        syncing = false;
      }
      resize();
    };
    source.value = serialize();
    source.addEventListener('input', sync);
    source.addEventListener('compositionstart', () => {
      composing = true;
      compositionBase = source.value;
      compositionRemote = undefined;
    });
    source.addEventListener('compositionend', () => {
      composing = false;
      if (compositionRemote !== undefined) {
        const edited = source.value;
        const offset = source.selectionStart;
        source.value = mergeComposition(compositionBase, edited, compositionRemote);
        const cursor = mapSourceOffset(edited, source.value, offset);
        source.setSelectionRange(cursor, cursor);
      }
      sync();
    });
    const leave = () => {
      const pos = getPos();
      if (pos === undefined) return;
      const transaction = view.state.tr;
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(pos + node.nodeSize), 1));
      view.dispatch(transaction);
      view.focus();
      refreshVisibility();
    };
    source.addEventListener('keydown', (event) => {
      if (event.isComposing || !view.editable) return;
      if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.shiftKey || event.key.toLowerCase() === 'y') redo(view.state); else undo(view.state);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        source.value = serialize();
        invalid = false;
        source.removeAttribute('aria-invalid');
        leave();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        sync();
        if (!invalid) leave();
      }
    });
    const onFocusChange = () => {
      yUndoPluginKey.getState(view.state)?.undoManager.stopCapturing();
      refreshVisibility();
    };
    source.addEventListener('focus', onFocusChange);
    source.addEventListener('blur', onFocusChange);
    const onClick = (event: Event) => {
      const target = event.target;
      if (!view.editable || !(target instanceof Element)) return;
      if (!target.closest('.image-wrapper, img') || target.closest('.operation, .image-resize-handle')) return;
      const pos = getPos();
      if (pos === undefined) return;
      event.preventDefault();
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      selected = true;
      refreshVisibility();
      source.focus({ preventScroll: true });
    };
    const onError = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      failed = true;
      refreshVisibility();
    };
    const bindImageText = () => {
      if (!block) return;
      const image = (inner.dom as HTMLElement).querySelector('img');
      if (!image) return;
      const alt = node.attrs.alt ?? node.attrs.caption;
      if (image.alt !== alt) image.alt = alt;
      if (image.title !== node.attrs.caption) image.title = node.attrs.caption;
    };
    const observer = new MutationObserver(bindImageText);
    observer.observe(inner.dom, { subtree: true, childList: true, attributes: true, attributeFilter: ['alt', 'title'] });
    bindImageText();
    const onLoad = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      failed = false;
      refreshVisibility();
    };
    dom.addEventListener('click', onClick);
    dom.addEventListener('error', onError, true);
    dom.addEventListener('load', onLoad, true);
    window.addEventListener('resize', resize);
    refreshVisibility();
    return {
      dom,
      update(next, decorations, innerDecorations) {
        if (next.type !== node.type || inner.update?.(next, decorations, innerDecorations) === false) return false;
        const previous = node;
        node = next;
        if (previous.attrs.src !== next.attrs.src) failed = false;
        if (!syncing && !previous.eq(next)) {
          const raw = serialize();
          if (composing) compositionRemote = raw;
          else {
            const cursor = mapSourceOffset(source.value, raw, source.selectionStart);
            source.value = raw;
            source.setSelectionRange(cursor, cursor);
            invalid = false;
          }
        }
        refreshVisibility();
        return true;
      },
      selectNode() { selected = true; inner.selectNode?.(); refreshVisibility(); },
      deselectNode() { selected = false; inner.deselectNode?.(); refreshVisibility(); },
      stopEvent(event) { return source.contains(event.target as Node) || (inner.stopEvent?.(event) ?? false); },
      ignoreMutation: () => true,
      destroy() {
        window.removeEventListener('resize', resize);
        observer.disconnect();
        inner.destroy?.();
      },
    };
  };
}

// Wrap Crepe's views instead of replacing its upload/resize/preview machinery.
export const blockImageSource = $view(imageBlockSchema.node, (ctx) => withImageSource(ctx, ctx.get(nodeViewCtx).find(([name]) => name === 'image-block')![1]));
export const inlineImageSource = $view(imageSchema.node, (ctx) => withImageSource(ctx, ctx.get(nodeViewCtx).find(([name]) => name === 'image')![1]));
