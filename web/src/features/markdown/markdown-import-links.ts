import { remarkCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { Fragment, type Node as ProseNode } from '@milkdown/kit/prose/model';
import { readDefinition } from './markdown-reference';

/** Transform parsed content, never raw Markdown text or rendered editor DOM. */
export function rewriteMarkdownImportLinks(
  ctx: Ctx,
  document: ProseNode,
  resolve: (href: string) => string,
): ProseNode {
  const visit = (node: ProseNode): ProseNode => {
    if (node.type.name === 'reference_definition') {
      const definition = readDefinition(ctx, node.textContent);
      if (definition?.url) {
        const url = resolve(definition.url);
        if (url !== definition.url) {
          // Definitions remain editable source lines; serialize with remark so
          // labels, titles and URL escaping use the active Markdown rules.
          const raw = ctx
            .get(remarkCtx)
            .stringify({
              type: 'root',
              children: [
                {
                  type: 'definition',
                  identifier: definition.identifier ?? '',
                  label: definition.label,
                  title: definition.title,
                  url,
                },
              ],
            })
            .trimEnd();
          return node.copy(Fragment.from(node.type.schema.text(raw)));
        }
      }
      return node;
    }
    const marks = node.marks.map((mark) => {
      if (mark.type.name !== 'link' || typeof mark.attrs.href !== 'string') return mark;
      return mark.type.create({ ...mark.attrs, href: resolve(mark.attrs.href) });
    });
    if (node.isText) return node.mark(marks);
    let attrs = node.attrs;
    if ((node.type.name === 'image' || node.type.name === 'image-block') && typeof attrs.src === 'string') {
      attrs = { ...attrs, src: resolve(attrs.src) };
    }
    const children: ProseNode[] = [];
    node.forEach((child) => children.push(visit(child)));
    return node.type.create(attrs, children, marks);
  };
  return visit(document);
}
