import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { Node } from '@milkdown/kit/prose/model';
import { $prose } from '@milkdown/kit/utils';
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from 'y-prosemirror';
import type { RelativePosition } from 'yjs';
import {
  headingAtPosition,
  readOutline,
  mapOutlineFolds,
  outlineParentPositions,
  type OutlineHeading,
  type MarkdownOutline,
} from './markdown-outline-model';

type OutlineState = {
  headings: OutlineHeading[];
  decorations: DecorationSet;
  collapsed: ReadonlySet<number>;
};
type FoldAction =
  { type: 'toggle'; position: number } | { type: 'all'; collapsed: boolean };
const outlineKey = new PluginKey<OutlineState>('markdown-outline');

function headingFocusTargets(doc: Node, headings: OutlineHeading[]) {
  return DecorationSet.create(
    doc,
    headings.map(({ position }) =>
      Decoration.node(position, position + doc.nodeAt(position)!.nodeSize, {
        tabindex: '-1',
      }),
    ),
  );
}

export function markdownOutline(
  itemId: string,
  onChange: (outline: MarkdownOutline | null) => void,
) {
  return $prose(() => {
    let anchors: RelativePosition[] = [];
    return new Plugin({
      key: outlineKey,
      state: {
        init: (_, state): OutlineState => {
          const headings = readOutline(state.doc);
          return {
            headings,
            decorations: headingFocusTargets(state.doc, headings),
            collapsed: new Set(),
          };
        },
        apply: (transaction, previous, previousState) => {
          let next = previous;
          if (transaction.docChanged) {
            const headings = readOutline(transaction.doc);
            let collapsed = mapOutlineFolds(
              previous.collapsed,
              transaction.mapping,
              headings,
            );
            const sync = ySyncPluginKey.getState(previousState);
            if (
              transaction.getMeta(ySyncPluginKey) &&
              sync?.binding &&
              anchors.length
            ) {
              // Remote Yjs transactions replace the whole ProseMirror document.
              // Resolve anchors inside heading content, so deleting a heading cannot fold its sibling.
              collapsed = new Set();
              const parents = new Set(outlineParentPositions(headings));
              for (const anchor of anchors) {
                const position = relativePositionToAbsolutePosition(
                  sync.doc,
                  sync.type,
                  anchor,
                  sync.binding.mapping,
                );
                if (
                  position === null ||
                  position < 0 ||
                  position > transaction.doc.content.size
                )
                  continue;
                const resolved = transaction.doc.resolve(position);
                if (
                  resolved.parent.type.name !== 'heading' ||
                  resolved.depth === 0
                )
                  continue;
                const headingPosition = resolved.before();
                if (parents.has(headingPosition))
                  collapsed.add(headingPosition);
              }
            }
            next = {
              headings,
              decorations: headingFocusTargets(transaction.doc, headings),
              collapsed,
            };
          }
          const action = transaction.getMeta(outlineKey) as
            FoldAction | undefined;
          if (!action) return next;
          const parents = outlineParentPositions(next.headings);
          const collapsed = new Set(next.collapsed);
          if (action.type === 'all')
            return {
              ...next,
              collapsed: new Set(action.collapsed ? parents : []),
            };
          if (!parents.includes(action.position)) return next;
          if (collapsed.has(action.position)) collapsed.delete(action.position);
          else collapsed.add(action.position);
          return { ...next, collapsed };
        },
      },
      props: {
        decorations: (state) => outlineKey.getState(state)?.decorations,
      },
      view(view) {
        let { headings, collapsed } = outlineKey.getState(view.state)!;
        let published: MarkdownOutline | undefined;
        let activePosition: number | null = null;
        let frame = 0;
        let useSelection = false;
        let navigationScroll = false;
        let destroyed = false;

        const fold = (action: FoldAction) => {
          if (destroyed) return;
          // Metadata-only transactions never change the document, undo history, or Yjs state.
          view.dispatch(
            view.state.tr
              .setMeta(outlineKey, action)
              .setMeta('addToHistory', false),
          );
          publish();
        };
        const toggleCollapsed = (position: number) =>
          fold({ type: 'toggle', position });
        const setAllCollapsed = (collapsed: boolean) =>
          fold({ type: 'all', collapsed });

        const navigate = (position: number) => {
          if (
            destroyed ||
            !headings.some((heading) => heading.position === position)
          )
            return;
          const element = view.nodeDOM(position);
          if (!(element instanceof HTMLElement)) return;
          if (view.editable) {
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.near(view.state.doc.resolve(position + 1)),
              ),
            );
            view.focus();
          } else {
            // The drawer trigger disappears on mobile: give readers a real focus destination.
            element.focus({ preventScroll: true });
          }
          // Keep the heading below the sticky workspace header, including in the mobile drawer flow.
          window.scrollBy({
            top: element.getBoundingClientRect().top - 90,
            behavior: 'instant',
          });
          navigationScroll = true;
          activePosition = position;
          publish();
          schedule();
        };

        const publish = () => {
          if (
            published?.headings === headings &&
            published.activePosition === activePosition &&
            published.collapsed === collapsed
          )
            return;
          published = {
            itemId,
            headings,
            activePosition,
            navigate,
            collapsed,
            toggleCollapsed,
            setAllCollapsed,
          };
          onChange(published);
        };

        const schedule = () => {
          if (frame) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            if (useSelection && view.hasFocus()) {
              activePosition = headingAtPosition(
                headings,
                view.state.selection.from,
              );
            } else if (!navigationScroll) {
              activePosition = null;
              for (const heading of headings) {
                const element = view.nodeDOM(heading.position);
                if (
                  element instanceof HTMLElement &&
                  element.getBoundingClientRect().top <= 110
                ) {
                  activePosition = heading.position;
                } else break;
              }
            }
            useSelection = false;
            navigationScroll = false;
            publish();
          });
        };

        const resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(view.dom);
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        schedule();

        return {
          update(nextView, previous) {
            ({ headings, collapsed } = outlineKey.getState(nextView.state)!);
            // Wait for the later Yjs plugin view to synchronize its mapping.
            queueMicrotask(() => {
              if (destroyed) return;
              const sync = ySyncPluginKey.getState(view.state);
              anchors = sync?.binding
                ? [...collapsed].map((position) =>
                    absolutePositionToRelativePosition(
                      position + 1,
                      sync.type,
                      sync.binding.mapping,
                    ),
                  )
                : [];
            });
            if (!nextView.state.selection.eq(previous.selection))
              useSelection = true;
            schedule();
          },
          destroy() {
            destroyed = true;
            window.cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            window.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            onChange(null);
          },
        };
      },
    });
  });
}
