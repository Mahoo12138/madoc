import { jumpToFootnote } from './markdown-footnote';
import { DOMSerializer } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { InlineRange } from './markdown-inline-codec';

export type InlineMathPreview = { target: HTMLInputElement; content: Node };

/** Use the schema's actual typography and measured glyph widths, not ch estimates. */
export function createInlinePresentation(shell: HTMLElement, source: HTMLInputElement, onPreviewChange: (preview: InlineMathPreview | null) => void) {
  const measure = document.createElement('span');
  measure.className = 'madoc-inline-measure';
  measure.setAttribute('aria-hidden', 'true');
  // Measure full source width inside a clipped box so long, invisible text
  // cannot enlarge the document's horizontal scroll area.
  const measureClip = document.createElement('span');
  measureClip.className = 'madoc-inline-measure-clip';
  measureClip.setAttribute('aria-hidden', 'true');
  measureClip.append(measure);
  shell.append(measureClip);
  const literal = document.createElement('span');
  literal.className = 'madoc-escape-source-paint';
  literal.setAttribute('aria-hidden', 'true');
  literal.hidden = true;
  shell.append(literal);
  const footnoteJump = document.createElement('button');
  footnoteJump.type = 'button';
  footnoteJump.className = 'madoc-footnote-jump';
  footnoteJump.textContent = '↗';
  footnoteJump.setAttribute('aria-label', '转到脚注');
  footnoteJump.title = '转到脚注';
  footnoteJump.hidden = true;
  footnoteJump.addEventListener('mousedown', (event) => event.preventDefault());
  shell.append(footnoteJump);
  let previewCode: string | undefined;

  const hidePreview = () => {
    if (previewCode === undefined) return;
    previewCode = undefined;
    source.removeAttribute('aria-describedby');
    onPreviewChange(null);
  };

  return {
    update(view: EditorView, range: InlineRange) {
      footnoteJump.hidden = range.kind !== 'footnote_reference';
      footnoteJump.onclick = () => {
        const match = /^\[\^([^\[\]\\\r\n]+)\]$/.exec(source.value);
        if (match) jumpToFootnote(view, range.from, match[1]);
      };
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
      const isEscape = range.kind === 'escaped_text';
      shell.classList.toggle('madoc-escape-source-shell', isEscape);
      literal.hidden = !isEscape;
      literal.replaceChildren();
      if (isEscape) {
        Object.assign(literal.style, typography);
        literal.style.color = style.color;
        for (let i = 0; i < source.value.length; i += 1) {
          const character = document.createElement('span');
          character.textContent = source.value[i];
          if (source.value[i] === '\\' && /^[!-/:-@\[-`{-~]$/.test(source.value[i + 1] ?? '')) {
            character.className = 'madoc-escape-marker';
            literal.append(character, document.createTextNode(source.value[++i]));
          } else literal.append(character);
        }
        // Native input owns caret/selection/IME; the inert mirror colors only
        // the synthetic escape prefix without changing editable characters.
        source.style.color = 'transparent';
      }
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
