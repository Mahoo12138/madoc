import { parserCtx, serializerCtx } from '@milkdown/kit/core';
import { prosemirrorToYDoc } from 'y-prosemirror';
import { encodeStateAsUpdate } from 'yjs';
import { toBase64 } from '@/features/realtime/client';
import { createMarkdownCrepe } from './markdown-session-editor';
import { rewriteMarkdownImportLinks } from './markdown-import-links';

// Compile initial Markdown using the same schema as live documents, without joining a room.
export async function compileMarkdownSnapshot(markdown: string, resolveLink?: (href: string) => string) {
  const root = document.createElement('div');
  const editor = createMarkdownCrepe({
    root,
    itemId: 'initial-markdown',
    // Parse off-view: compiling an import must not fetch its original images.
    defaultValue: '',
    uploadImage: async () => {
      throw new Error('初始 Markdown 不会上传附件');
    },
    onInlinePreviewChange: () => {},
    onOutlineChange: () => {},
  });
  try {
    await editor.create();
    return editor.editor.action((ctx) => {
      const parsed = ctx.get(parserCtx)(markdown);
      if (!parsed) throw new Error('无法解析初始 Markdown');
      const content = resolveLink ? rewriteMarkdownImportLinks(ctx, parsed, resolveLink) : parsed;
      const doc = prosemirrorToYDoc(content);
      try {
        return {
          snapshot: toBase64(encodeStateAsUpdate(doc)),
          markdown: ctx.get(serializerCtx)(content),
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
