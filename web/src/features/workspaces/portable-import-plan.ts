import type { ItemType } from '@/api/types';
import type { PortableImportPreview } from './portable-package-selection';
import { createPortableImportLinkResolver } from './portable-import-links';

type InitialMarkdown = { snapshot: string; markdown: string };
type ImportItem = {
  id: string;
  parentId: string | null;
  type: ItemType;
  title: string;
  markdown?: InitialMarkdown;
  whiteboard?: string;
};
type ImportAsset = { id: string; itemId: string; fileName: string; mime: string; size: number; sha256: string };
export type PortableImportPlan = { id: string; parentId: string | null; items: ImportItem[]; assets: ImportAsset[] };
type Compiler = (markdown: string, resolveLink: (href: string) => string) => Promise<InitialMarkdown>;

/** Prepare once and retain the returned body across uncertain network retries.
 * Recompiling would allocate different Yjs client IDs and change the receipt hash.
 */
export async function preparePortableImport(
  preview: PortableImportPreview,
  target: { workspaceId: string; parentId: string | null; title: string },
  signal?: AbortSignal,
  compile?: Compiler,
) {
  signal?.throwIfAborted();
  const title = target.title.trim();
  if (!title) throw new Error('请输入导入目录名称。');
  if (preview.items.length + preview.attachments.length + 1 > 5000) throw new Error('导入内容与附件数量超过 5000 项。');
  const rootId = crypto.randomUUID();
  const itemIds = new Map(preview.items.map((item) => [item.id, crypto.randomUUID()]));
  const assetIds = new Map(preview.attachments.map((asset) => [asset.id, crypto.randomUUID()]));
  const destinations = new Map<string, string>();
  destinations.set(preview.manifest.root.path, `/workspace/${target.workspaceId}/${rootId}`);
  for (const item of preview.items)
    destinations.set(item.path, `/workspace/${target.workspaceId}/${itemIds.get(item.id)!}`);
  for (const asset of preview.attachments) destinations.set(asset.path, `/api/assets/${assetIds.get(asset.id)!}`);
  const plan: PortableImportPlan = {
    id: crypto.randomUUID(),
    parentId: target.parentId,
    items: [{ id: rootId, parentId: null, type: 'folder', title }],
    assets: [],
  };
  const body = new FormData();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  const account = (size: number) => {
    bytes += size;
    if (bytes > 512 * 1024 * 1024) throw new Error('转换后的正文、协作快照和附件合计超过 512 MiB。');
  };
  // Attachments are counted first so compilation cannot consume their budget.
  for (const asset of preview.attachments) {
    signal?.throwIfAborted();
    const data = preview.attachmentData.get(asset.id);
    if (!data || data.byteLength !== asset.size) throw new Error('导入附件缺失或大小不符。');
    account(data.byteLength);
    const hash = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
    signal?.throwIfAborted();
    const id = assetIds.get(asset.id)!;
    const fileName = asset.path.split('/').at(-1)!;
    plan.assets.push({
      id,
      itemId: rootId,
      fileName,
      mime: asset.mime,
      size: data.byteLength,
      sha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    });
    body.append(id, new Blob([data as Uint8Array<ArrayBuffer>], { type: asset.mime }), fileName);
  }
  let compiler = compile;
  for (const item of preview.items) {
    signal?.throwIfAborted();
    const parentId =
      item.parentId === null || item.parentId === preview.manifest.root.id ? rootId : itemIds.get(item.parentId);
    if (!parentId) throw new Error('导入内容缺少父目录。');
    const result: ImportItem = { id: itemIds.get(item.id)!, parentId, type: item.type, title: item.title };
    if (item.type !== 'folder') {
      const data = preview.itemData.get(item.id);
      if (!data) throw new Error('导入内容缺失。');
      const text = decoder.decode(data);
      if (item.type === 'markdown') {
        compiler ??= (await import('../markdown/markdown-template')).compileMarkdownSnapshot;
        signal?.throwIfAborted();
        result.markdown = await compiler(text, createPortableImportLinkResolver(item.path, destinations));
        account(atob(result.markdown.snapshot).length + encoder.encode(result.markdown.markdown).byteLength);
      } else {
        const scene = JSON.parse(text);
        const resolve = createPortableImportLinkResolver(item.path, destinations);
        const elements = scene.elements.map((element: unknown) => {
          if (!element || typeof element !== 'object' || !('link' in element) || typeof element.link !== 'string')
            return element;
          return { ...element, link: resolve(element.link) };
        });
        result.whiteboard = JSON.stringify({ elements, appState: scene.appState, files: scene.files });
        account(encoder.encode(result.whiteboard).byteLength);
      }
    }
    signal?.throwIfAborted();
    plan.items.push(result);
  }
  // The server requires the plan before the file fields. Build a final immutable
  // JSON string now; later UI changes must not mutate an already submitted plan.
  const requestBody = new FormData();
  requestBody.append('plan', JSON.stringify(plan));
  for (const [key, file] of body) requestBody.append(key, file);
  return { rootId, requestId: plan.id, body: requestBody };
}
