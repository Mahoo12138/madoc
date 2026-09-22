import { Plugin } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

/** Visible hard breaks are presentation only; the arrow never enters Markdown. */
export const hardbreakIndicators = $prose(() => new Plugin({
  props: {
    decorations(state) {
      const markers: Decoration[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name !== 'hardbreak' || node.attrs.isInline) return;
        markers.push(Decoration.widget(pos, () => {
          const marker = document.createElement('span');
          marker.className = 'madoc-hardbreak';
          marker.textContent = '↵';
          marker.setAttribute('aria-hidden', 'true');
          return marker;
        }, { side: -1, key: `hardbreak-${pos}`, ignoreSelection: true }));
      });
      return DecorationSet.create(state.doc, markers);
    },
  },
}));
