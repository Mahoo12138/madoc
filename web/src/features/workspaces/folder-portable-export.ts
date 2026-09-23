import { strToU8, type AsyncZippable } from 'fflate';
import { api } from '@/api/client';
import type { Item, ItemCapture } from '@/api/types';
import { downloadPortablePackage } from '@/features/markdown/markdown-portable-export';

type CapturedEntry = { capture: ItemCapture; path: string };

function safeSegment(value: string, fallback: string) {
  let result = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '').trim();
  if (!result || /^\.+$/.test(result)) result = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = `_${result}`;
  return result;
}

function localAssetID(source: string) {
  let url: URL;
  try { url = new URL(source, window.location.origin); }
  catch { return undefined; }
  if (url.origin !== window.location.origin) return undefined;
  return /^\/api\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.pathname)?.[1]?.toLowerCase();
}

function extensionFor(mime: string) {
  switch (mime.split(';', 1)[0].trim().toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    default: return undefined;
  }
}

function packagePathMap(root: { id: string; title: string }, rootParentId: string | null, items: Item[]) {
  const byParent = new Map<string | null, Item[]>();
  for (const item of items) {
    const children = byParent.get(item.parentId) ?? [];
    children.push(item);
    byParent.set(item.parentId, children);
  }
  for (const children of byParent.values()) children.sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id));

  const paths = new Map<string, string>();
  const visited = new Set<string>([root.id]);
  const rootPath = safeSegment(root.title, 'folder');
  const walk = (parentId: string | null, prefix: string) => {
    const used = new Set<string>();
    for (const child of byParent.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      const base = safeSegment(child.title, child.type === 'folder' ? 'folder' : 'item');
      let segment = base;
      let suffix = 2;
      while (used.has(segment.toLowerCase())) segment = `${base} (${suffix++})`;
      used.add(segment.toLowerCase());
      const name = child.type === 'markdown' ? `${segment}.md` : child.type === 'whiteboard' ? `${segment}.excalidraw` : segment;
      const path = `${prefix}/${name}`;
      paths.set(child.id, path);
      if (child.type === 'folder') walk(child.id, path);
    }
  };
  walk(rootParentId, rootPath);
  return { paths, rootPath, descendants: items.filter((item) => item.id !== root.id && visited.has(item.id)) };
}

function relativePath(fromFile: string, toFile: string) {
  const from = fromFile.split('/').slice(0, -1);
  const to = toFile.split('/');
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  const result = [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/') || '.';
  return result.startsWith('.') ? result : `./${result}`;
}

function rewriteDestination(markdown: string, source: string, target: string) {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(\\]\\(<?)${escaped}(>?)(?=\\s|\\))`, 'g');
  let fence: { marker: string; length: number } | undefined;
  return (markdown.match(/[^\n]*\n|[^\n]+$/g) ?? []).map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`).test(line.trimEnd())) fence = undefined;
      return line;
    }
    if (marker) { fence = { marker: marker[0]!, length: marker.length }; return line; }
    const code: string[] = [];
    return line
      .replace(/(`+)[^\n]*?\1/g, (value) => `\u0000${code.push(value) - 1}\u0000`)
      .replace(pattern, (_match, prefix: string, suffix: string) => `${prefix}${target}${suffix}`)
      .replace(/\u0000(\d+)\u0000/g, (_match, index: string) => code[Number(index)]!);
  }).join('');
}

function stableItemID(href: string, workspaceId: string) {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return undefined;
    const match = /^\/workspace\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
    if (!match || decodeURIComponent(match[1]!) !== workspaceId) return undefined;
    return decodeURIComponent(match[2]!);
  } catch { return undefined; }
}

async function inspectMarkdown(markdown: string) {
  const [{ createMarkdownCrepe }, { parserCtx }] = await Promise.all([
    import('@/features/markdown/markdown-session-editor'),
    import('@milkdown/kit/core'),
  ]);
  const root = document.createElement('div');
  const editor = createMarkdownCrepe({
    root,
    itemId: 'folder-export-inspection',
    defaultValue: '',
    uploadImage: async () => { throw new Error('导出检查不会上传附件'); },
    onInlinePreviewChange: () => {},
    onOutlineChange: () => {},
  });
  try {
    await editor.create();
    return editor.editor.action((ctx) => {
      const document = ctx.get(parserCtx)(markdown);
      const images = new Set<string>();
      const links = new Set<string>();
      document.descendants((node) => {
        if ((node.type.name === 'image' || node.type.name === 'image-block') && typeof node.attrs.src === 'string' && node.attrs.src) images.add(node.attrs.src);
        for (const mark of node.marks) {
          if (mark.type.name === 'link' && typeof mark.attrs.href === 'string' && mark.attrs.href) links.add(mark.attrs.href);
        }
      });
      return { images: [...images], links: [...links] };
    });
  } finally {
    await editor.destroy();
    root.remove();
  }
}

async function fetchAsset(id: string, signal: AbortSignal) {
  const response = await fetch(`/api/assets/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store', signal });
  if (!response.ok) {
    if (response.status === 404) throw new Error(`附件 ${id} 已不存在，未生成不完整的 ZIP 包。`);
    if (response.status === 401 || response.status === 403) throw new Error(`附件 ${id} 已无法访问，未生成 ZIP 包。请检查登录和工作区权限。`);
    throw new Error(`读取附件 ${id} 失败（HTTP ${response.status}），未生成 ZIP 包。`);
  }
  const mime = response.headers.get('Content-Type') ?? '';
  const extension = extensionFor(mime);
  if (!extension) throw new Error(`附件 ${id} 的类型不受支持，未生成文件夹包。`);
  return { id, path: `assets/asset-${id}.${extension}`, mime: mime.split(';', 1)[0].trim().toLowerCase(), data: new Uint8Array(await response.arrayBuffer()) };
}

async function exportPortableTreePackage(root: { id: string; title: string; type: 'folder' | 'workspace' }, rootParentId: string | null, workspaceItems: Item[], signal: AbortSignal, onProgress: (done: number, total: number) => void) {
  const tree = packagePathMap(root, rootParentId, workspaceItems);
  if (tree.descendants.length === 0) throw new Error(`${root.type === 'folder' ? '文件夹' : 'Workspace'} 中没有可导出的内容。`);
  const leaves = tree.descendants.filter((item) => item.type !== 'folder');
  const entries: CapturedEntry[] = [];
  for (const item of leaves) {
    if (signal.aborted) throw signal.reason;
    const capture = await api.captureItem(item.id, signal);
    if (capture.item.id !== item.id || capture.item.parentId !== item.parentId || capture.item.type !== item.type || capture.item.title !== item.title) {
      throw new Error('导出期间内容树或名称已变化。请刷新文件列表后重试。');
    }
    if (item.type === 'markdown' && (!capture.markdown || capture.markdown.cacheSeq !== capture.markdown.headSeq)) {
      throw new Error(`文档「${item.title}」的 Markdown 投影尚未追上已保存内容。请打开文档等待同步后重试。`);
    }
    if (item.type === 'whiteboard' && !capture.whiteboard) throw new Error(`白板「${item.title}」没有可导出的场景。`);
    entries.push({ capture, path: tree.paths.get(item.id)! });
    onProgress(entries.length, leaves.length);
  }

  const inspection = new Map<string, { images: string[]; links: string[] }>();
  for (const entry of entries) {
    if (entry.capture.markdown) inspection.set(entry.capture.item.id, await inspectMarkdown(entry.capture.markdown.markdown));
  }
  const imageSources = new Map<string, Set<string>>();
  for (const result of inspection.values()) {
    for (const source of result.images) {
      const id = localAssetID(source);
      if (!id) continue;
      const sources = imageSources.get(id) ?? new Set<string>();
      sources.add(source);
      imageSources.set(id, sources);
    }
  }
  const assets = await Promise.all([...imageSources.keys()].map((id) => fetchAsset(id, signal)));
  const assetPath = new Map(assets.map((asset) => [asset.id, asset.path]));
  const pathsByID = new Map([[root.id, tree.rootPath], ...tree.paths]);
  const externalImages: { itemId: string; source: string }[] = [];
  const externalItemLinks: { itemId: string; href: string }[] = [];
  const files: AsyncZippable = {};
  const itemManifest: Record<string, unknown>[] = [];

  for (const entry of entries) {
    const { capture, path } = entry;
    const item = capture.item;
    if (capture.markdown) {
      let markdown = capture.markdown.markdown;
      for (const source of inspection.get(item.id)?.images ?? []) {
        const id = localAssetID(source);
        if (id) markdown = rewriteDestination(markdown, source, relativePath(path, assetPath.get(id)!));
        else externalImages.push({ itemId: item.id, source });
      }
      for (const href of inspection.get(item.id)?.links ?? []) {
        const targetID = stableItemID(href, item.workspaceId);
        const targetPath = targetID ? pathsByID.get(targetID) : undefined;
        if (targetPath) markdown = rewriteDestination(markdown, href, relativePath(path, targetPath));
        else if (targetID && workspaceItems.some((candidate) => candidate.id === targetID)) externalItemLinks.push({ itemId: item.id, href });
      }
      files[path] = strToU8(markdown);
      itemManifest.push({ id: item.id, parentId: item.parentId, type: item.type, title: item.title, path, capturedAt: capture.capturedAt, content: { generation: capture.markdown.generation, snapshotSeq: capture.markdown.snapshotSeq, seq: capture.markdown.headSeq, projectionSeq: capture.markdown.cacheSeq } });
    } else if (capture.whiteboard) {
      files[path] = strToU8(`${JSON.stringify({ type: 'excalidraw', version: 2, source: 'https://excalidraw.com', ...capture.whiteboard.scene }, null, 2)}\n`);
      itemManifest.push({ id: item.id, parentId: item.parentId, type: item.type, title: item.title, path, capturedAt: capture.capturedAt, content: { revision: capture.whiteboard.revision } });
    }
  }

  const folderManifest = tree.descendants.filter((item) => item.type === 'folder').map((item) => ({ id: item.id, parentId: item.parentId, type: item.type, title: item.title, path: tree.paths.get(item.id) }));
  files[`${tree.rootPath}/`] = new Uint8Array();
  for (const item of tree.descendants.filter((entry) => entry.type === 'folder')) files[`${tree.paths.get(item.id)!}/`] = new Uint8Array();
  const manifest = {
    format: root.type === 'folder' ? 'madoc-folder-package' : 'madoc-workspace-package', version: 1, capturedAt: new Date().toISOString(),
    consistency: 'per-item-capture; not a workspace-wide atomic snapshot',
    root: { id: root.id, title: root.title, type: root.type, path: tree.rootPath },
    items: [...folderManifest, ...itemManifest],
    attachments: assets.map(({ id, path, mime, data }) => ({ id, source: `/api/assets/${id}`, path, mime, size: data.byteLength })),
    unpackagedImages: externalImages,
    unpackagedItemLinks: externalItemLinks,
  };
  files['manifest.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  for (const asset of assets) files[asset.path] = [asset.data, { level: 0 }];
  const { zip } = await import('fflate');
  const data = await new Promise<Uint8Array>((resolve, reject) => {
    let stop = () => {};
    const abort = () => { stop(); reject(signal.reason ?? new DOMException('导出已取消', 'AbortError')); };
    stop = zip(files, { level: 0 }, (error, result) => {
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result);
    });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  return { data, fileName: `${safeSegment(root.title, root.type)}.zip`, itemCount: entries.length, attachmentCount: assets.length, externalImageCount: externalImages.length };
}

export function exportFolderPackage(folder: Item, workspaceItems: Item[], signal: AbortSignal, onProgress: (done: number, total: number) => void) {
  return exportPortableTreePackage({ id: folder.id, title: folder.title, type: 'folder' }, folder.id, workspaceItems, signal, onProgress);
}

export function exportWorkspacePackage(workspace: { id: string; name: string }, workspaceItems: Item[], signal: AbortSignal, onProgress: (done: number, total: number) => void) {
  return exportPortableTreePackage({ id: workspace.id, title: workspace.name, type: 'workspace' }, null, workspaceItems, signal, onProgress);
}

export { downloadPortablePackage };
