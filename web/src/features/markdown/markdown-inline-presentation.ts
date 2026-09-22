import { DOMSerializer } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { InlineRange } from './markdown-inline-codec';

export type InlineMathPreview = { target: HTMLInputElement; content: Node };

/** Use the schema's actual typography and measured glyph widths, not ch estimates. */
export function createInlinePresentation(shell: HTMLElement, source: HTMLInputElement, onPreviewChange: (preview: InlineMathPreview | null) => void) {
  const measure = document.createElement('span');
  measure.className = 'madoc-inline-measure';
  measure.setAttribute('aria-hidden', 'true');
  shell.append(measure);
  let previewCode: string | undefined;

  const hidePreview = () => {
    if (previewCode === undefined) return;
    previewCode = undefined;
    source.removeAttribute('aria-describedby');
    onPreviewChange(null);
  };

  return {
    update(view: EditorView, range: InlineRange) {
      const fragment = view.state.doc.slice(range.from, range.to).content;
      // Only inherit marks shared by the range; a nested emphasis must not make
      // the whole surrounding bold span italic.
      const first = fragment.firstChild;
      let marks = first?.marks ?? [];
      fragment.forEach((node) => { marks = marks.filter((mark) => mark.isInSet(node.marks)); });
      const sample = view.state.schema.text('M', marks);
      measure.replaceChildren(DOMSerializer.fromSchema(view.state.schema).serializeNode(sample));
      let styled = measure;
      while (styled.firstElementChild) styled = styled.firstElementChild as HTMLSpanElement;
      const style = getComputedStyle(styled);
      const typography = {
        fontFamily: style.fontFamily, fontSize: style.fontSize,
        fontWeight: style.fontWeight, fontStyle: style.fontStyle,
        fontVariant: style.fontVariant, fontFeatureSettings: style.fontFeatureSettings,
        letterSpacing: style.letterSpacing, lineHeight: style.lineHeight,
      };
      Object.assign(source.style, typography);
      source.style.color = style.color;
      source.style.backgroundColor = style.backgroundColor;
      source.style.borderRadius = style.borderRadius;
      measure.replaceChildren();
      Object.assign(measure.style, typography);
      measure.textContent = source.value;
      source.style.width = `${Math.max(1, Math.ceil(measure.getBoundingClientRect().width) + 1)}px`;
      // The measuring span inherits paragraph typography on the next update.
      measure.removeAttribute('style');
      if (range.kind !== 'math_inline') {
        hidePreview();
        return;
      }
      const code = source.value.replace(/^\$/, '').replace(/\$$/, '');
      if (code === previewCode) return;
      previewCode = code;
      // The schema already owns KaTeX options and safe HTML generation. Reuse it
      // instead of adding a second renderer or a second formula editor.
      const node = view.state.schema.nodes.math_inline.create({ value: code });
      const content = DOMSerializer.fromSchema(view.state.schema).serializeNode(node);
      source.setAttribute('aria-describedby', 'madoc-inline-math-preview');
      onPreviewChange({ target: source, content });
    },
    hidePreview,
  };
}
