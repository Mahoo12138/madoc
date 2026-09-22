import type { Ctx } from '@milkdown/kit/ctx';
import { remarkCtx } from '@milkdown/kit/core';
import { linkSchema } from '@milkdown/kit/preset/commonmark';
import { Plugin } from '@milkdown/kit/prose/state';
import { $nodeSchema, $prose, $remark } from '@milkdown/kit/utils';

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  identifier?: string;
  label?: string;
  url?: string;
  title?: string | null;
  alt?: string;
  referenceType?: string;
  value?: string;
  data?: Record<string, unknown>;
  position?: { start: { offset?: number }; end: { offset?: number } };
};

export function readDefinition(ctx: Ctx, raw: string) {
  const root = ctx.get(remarkCtx).parse(raw) as MarkdownNode;
  return root.children?.length === 1 && root.children[0].type === 'definition' ? root.children[0] : null;
}

// Keep definitions as editable Markdown lines, in the same Yjs document.
export const referenceDefinition = $nodeSchema('reference_definition', (ctx) => ({
  group: 'block', content: 'text*', marks: '', defining: true, code: true,
  parseDOM: [{ tag: 'div[data-reference-definition]' }],
  toDOM: () => ['div', { 'data-reference-definition': '', class: 'madoc-reference-definition' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'definition',
    runner: (state, node, type) => {
      state.openNode(type);
      state.addText(String((node.data as Record<string, unknown> | undefined)?.source ?? ''));
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'reference_definition',
    runner: (state, node) => {
      const definition = readDefinition(ctx, node.textContent);
      if (definition) {
        state.addNode('definition', undefined, undefined, {
          identifier: definition.identifier ?? '', label: definition.label ?? '',
          url: definition.url ?? '', title: definition.title ?? null,
        });
      } else {
        state.openNode('paragraph');
        state.addNode('text', undefined, node.textContent);
        state.closeNode();
      }
    },
  },
}));

export const preserveReferences = $remark('madoc-references', () => () => (tree, file) => {
  const root = tree as MarkdownNode;
  const definitions = new Map<string, MarkdownNode>();
  const walk = (node: MarkdownNode, visit: (node: MarkdownNode) => void) => {
    visit(node);
    node.children?.forEach((child) => walk(child, visit));
  };
  walk(root, (node) => {
    if (node.type !== 'definition') return;
    if (!definitions.has(node.identifier!)) definitions.set(node.identifier!, node);
    node.data = { ...node.data, source: String(file.value).slice(node.position?.start.offset, node.position?.end.offset) };
  });
  walk(root, (node) => {
    if (node.type !== 'linkReference' && node.type !== 'imageReference') return;
    const definition = definitions.get(node.identifier!);
    if (!definition) return;
    node.data = { ...node.data, referenceId: node.identifier, referenceLabel: node.label, referenceType: node.referenceType };
    node.type = node.type === 'linkReference' ? 'link' : 'image';
    node.url = definition.url;
    node.title = definition.title;
  });
});

export function configureReferences(ctx: Ctx) {
  ctx.update(linkSchema.key, (previous) => (ctx) => {
    const schema = previous(ctx);
    return {
      ...schema,
      attrs: {
        ...schema.attrs,
        referenceId: { default: null }, referenceLabel: { default: null }, referenceType: { default: null },
      },
      toDOM: (mark) => {
        const dom = schema.toDOM!(mark, true) as [string, Record<string, unknown>];
        // Retain Milkdown's URL sanitization without leaking internal metadata.
        const { href, title } = dom[1];
        return ['a', { href, title, 'data-reference': mark.attrs.referenceId }];
      },
      parseMarkdown: {
        match: (node) => node.type === 'link',
        runner: (state, node, type) => {
          state.openMark(type, {
            href: node.url, title: node.title,
            referenceId: (node.data as Record<string, unknown> | undefined)?.referenceId ?? null,
            referenceLabel: (node.data as Record<string, unknown> | undefined)?.referenceLabel ?? null,
            referenceType: (node.data as Record<string, unknown> | undefined)?.referenceType ?? null,
          });
          state.next(node.children);
          state.closeMark(type);
        },
      },
      toMarkdown: {
        match: (mark) => mark.type.name === 'link',
        runner: (state, mark, node) => {
          if (!mark.attrs.referenceId) return schema.toMarkdown.runner(state, mark, node);
          state.withMark(mark, 'linkReference', undefined, {
            identifier: mark.attrs.referenceId,
            label: mark.attrs.referenceLabel,
            referenceType: mark.attrs.referenceType,
          });
        },
      },
    };
  });
}

/** Update reference destinations when a definition is edited or removed. */
export const resolveReferences = $prose((ctx) => new Plugin({
  appendTransaction(transactions, _oldState, state) {
    if (!transactions.some((transaction) => transaction.docChanged)) return null;
    const definitions = new Map<string, MarkdownNode>();
    state.doc.descendants((node) => {
      if (node.type.name !== 'reference_definition') return;
      const definition = readDefinition(ctx, node.textContent);
      if (definition && !definitions.has(definition.identifier!)) definitions.set(definition.identifier!, definition);
    });
    const transaction = state.tr;
    state.doc.descendants((node, pos) => {
      for (const mark of node.marks) {
        if (mark.type.name !== 'link' || !mark.attrs.referenceId) continue;
        const definition = definitions.get(mark.attrs.referenceId);
        const href = definition?.url ?? '';
        const title = definition?.title ?? null;
        if (href === mark.attrs.href && title === mark.attrs.title) continue;
        transaction.addMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, href, title }));
      }
    });
    return transaction.docChanged ? transaction : null;
  },
}));
