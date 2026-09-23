import { editorStateCtx } from '@milkdown/kit/core';
import { prosemirrorToYDoc } from 'y-prosemirror';
import { encodeStateAsUpdate } from 'yjs';
import { toBase64 } from '@/features/realtime/client';
import { createMarkdownCrepe } from './markdown-session-editor';

// Compile initial Markdown using the same schema as live documents, without joining a room.
export async function compileMarkdownSnapshot(markdown: string) {
  const root = document.createElement('div');
  const editor = createMarkdownCrepe({
    root,
    itemId: 'initial-markdown',
    defaultValue: markdown,
    uploadImage: async () => { throw new Error('初始 Markdown 不会上传附件'); },
    onInlinePreviewChange: () => {},
    onOutlineChange: () => {},
  });
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
