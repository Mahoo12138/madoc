import { parserCtx } from '@milkdown/kit/core';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { $inputRule } from '@milkdown/kit/utils';
import { parseInline } from './markdown-inline-codec';

/** Resolve an asymmetric star run once typing has moved past its closing star. */
export const asymmetricEmphasisInput = $inputRule((ctx) => new InputRule(
  /(?:^|\s)(\*{2,}[^*\n]+\*)([^*])$/,
  (state, match, start, end) => {
    const raw = match[1] + match[2];
    const from = start + match[0].length - raw.length;
    let plain = true;
    state.doc.nodesBetween(from, end, (node) => {
      if (node.isInline && (!node.isText || node.marks.length > 0)) plain = false;
    });
    if (!plain) return null;
    // Preserve trailing whitespace while letting the parser see the character
    // after the closing star (it affects Markdown delimiter matching).
    const suffix = 'madoc';
    const withSuffix = parseInline(raw + suffix, ctx.get(parserCtx), state);
    const parsed = withSuffix.cut(0, withSuffix.size - suffix.length);
    let emphasis = false;
    parsed.forEach((node) => {
      if (node.marks.some((mark) => mark.type.name === 'emphasis')) emphasis = true;
    });
    if (!emphasis) return null;
    // Wait for a non-star so **text** still reaches the normal strong rule.
    // Keep the following character outside emphasis and retain leftover stars.
    return state.tr.replaceWith(from, end, parsed).setStoredMarks([]);
  },
));
