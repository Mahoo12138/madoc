import { Crepe } from '@milkdown/crepe';
import { editorStateCtx } from '@milkdown/kit/core';
import { prosemirrorToYDoc } from 'y-prosemirror';
import { encodeStateAsUpdate } from 'yjs';
import { toBase64 } from '@/features/realtime/client';

// Compile only the small built-in templates. Ordinary document reuse is handled
// by server-side duplication, preserving its full existing collaboration state.
export async function compileTemplate(markdown: string) {
  const root = document.createElement('div');
  const editor = new Crepe({ root, defaultValue: markdown });
  try {
    await editor.create();
    return editor.editor.action((ctx) => {
      const doc = prosemirrorToYDoc(ctx.get(editorStateCtx).doc);
      try {
        return {
          snapshot: toBase64(encodeStateAsUpdate(doc)),
          markdown: editor.getMarkdown(),
        };
      } finally {
        doc.destroy();
      }
    });
  } finally {
    await editor.destroy();
    root.remove();
  }
}
