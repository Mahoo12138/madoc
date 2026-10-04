import type { Ctx } from '@milkdown/kit/ctx';
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core';

/** A leading line group is metadata even when CommonMark calls it a language. */
export function startsWithCodeLineGroup(info: string) {
  return /^\{\s*\d+(?=\s*[,}-])[^{}]*\}(?=\s|$)/.test(info);
}

export function parseCodeFenceInfo(language: string, meta: string) {
  const info = language + (meta ? ` ${meta}` : '');
  if (startsWithCodeLineGroup(info)) return { language: '', meta: info };
  // Plain text needs an explicit marker when arbitrary metadata could itself
  // be mistaken for a language. Keep every other unknown language unchanged.
  if (language === 'text' && meta) return { language: '', meta };
  return { language, meta };
}

export function configureCodeFenceMetadata(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, (options) => {
    type CodeHandler = NonNullable<
      NonNullable<typeof options.handlers>['code']
    >;
    const plainCode: CodeHandler = (node, parent, state, info) => {
      const plain = node as typeof node & { value: string; meta: string };
      // The standard code handler omits metadata without a language. Give
      // it a temporary plain-text marker, then remove only that marker from
      // the opening line. It still owns escaping, fence length and nesting.
      const fenced = state.handlers.code(
        {
          type: 'code',
          value: plain.value,
          lang: 'text',
          meta: plain.meta,
        },
        parent,
        state,
        info,
      );
      return fenced.replace(/^(`{3,}|~{3,})text(?= )/, '$1');
    };
    return {
      ...options,
      handlers: { ...options.handlers, madocPlainCode: plainCode },
    };
  });
}
