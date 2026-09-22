import * as Y from 'yjs';
import { schemaCtx, serializerCtx } from '@milkdown/kit/core';
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import { createMarkdownCrepe } from './markdown-session-editor';

// Use the same schema and serializer as the editor, without joining any room.
export async function recoverMarkdown(updates: Uint8Array[]) {
  const doc = new Y.Doc();
  const root = document.createElement('div');
  root.hidden = true;
  document.body.append(root);
  const crepe = createMarkdownCrepe({
    root, itemId: 'local-recovery',
    uploadImage: async () => { throw new Error('本地恢复不上传附件'); },
    onInlinePreviewChange: () => {}, onOutlineChange: () => {},
  });
  try {
    for (const update of updates) Y.applyUpdate(doc, update);
    await crepe.create();
    return crepe.editor.action(ctx => {
      const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('prosemirror'));
      const node = ctx.get(schemaCtx).nodeFromJSON(json);
      return ctx.get(serializerCtx)(node);
    });
  } finally {
    await crepe.destroy();
    root.remove();
    doc.destroy();
  }
}

export function downloadRecovery(markdown: string, title: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}-本地副本.md`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
