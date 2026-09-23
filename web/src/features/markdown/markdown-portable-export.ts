import { strToU8, zip, type AsyncZippable } from 'fflate';
import type { ConfirmedMarkdownExport } from './markdown-export';

type PackedAsset = {
  id: string;
  source: string;
  path: string;
  mime: string;
  size: number;
  data: Uint8Array;
};

function localAssetID(source: string) {
  let url: URL;
  try { url = new URL(source, window.location.origin); }
  catch { return undefined; }
  if (url.origin !== window.location.origin) return undefined;
  const match = /^\/api\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.pathname);
  return match?.[1].toLowerCase();
}

function safeFileBase(title: string) {
  let base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '').trim();
  if (!base || /^\.+$/.test(base)) base = 'document';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `_${base}`;
  return base;
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

function rewriteImageDestination(markdown: string, source: string, relativePath: string) {
  const escapedSource = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const image = new RegExp(`(!\\[(?:\\\\.|[^\\]\\\\])*\\]\\(<?)${escapedSource}(>?)(?=\\s|\\))`, 'g');
  let fence: { marker: string; length: number } | undefined;
  return (markdown.match(/[^\n]*\n|[^\n]+$/g) ?? []).map((line) => {
    const fenceMarker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`);
      if (close.test(line.trimEnd())) fence = undefined;
      return line;
    }
    if (fenceMarker) {
      fence = { marker: fenceMarker[0]!, length: fenceMarker.length };
      return line;
    }
    const codeSpans: string[] = [];
    const visible = line.replace(/(`+)[^\n]*?\1/g, (code) => {
      const index = codeSpans.push(code) - 1;
      return `\u0000${index}\u0000`;
    });
    return visible
      .replace(image, (_match, prefix: string, suffix: string) => `${prefix}${relativePath}${suffix}`)
      .replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codeSpans[Number(index)]!);
  }).join('');
}

async function fetchAsset(id: string, signal: AbortSignal): Promise<{ mime: string; data: Uint8Array }> {
  const response = await fetch(`/api/assets/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store', signal });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error(`图片附件 ${id} 已无法访问，未生成导出包。请检查登录和工作区权限。`);
    if (response.status === 404) throw new Error(`图片附件 ${id} 已不存在，未生成不完整的导出包。`);
    throw new Error(`读取图片附件 ${id} 失败（HTTP ${response.status}），未生成导出包。`);
  }
  const mime = response.headers.get('Content-Type') ?? '';
  if (!extensionFor(mime)) throw new Error(`图片附件 ${id} 的类型不受支持，未生成导出包。`);
  return { mime: mime.split(';', 1)[0].trim().toLowerCase(), data: new Uint8Array(await response.arrayBuffer()) };
}

function makeZip(files: AsyncZippable, signal: AbortSignal) {
  return new Promise<Uint8Array>((resolve, reject) => {
    let task = () => {};
    const abort = () => {
      task();
      reject(signal.reason ?? new DOMException('导出已取消', 'AbortError'));
    };
    task = zip(files, { level: 0 }, (error, data) => {
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(data);
    });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

export async function createMarkdownPortablePackage(
  item: { id: string; title: string },
  snapshot: ConfirmedMarkdownExport,
  references: string[],
  signal: AbortSignal,
) {
  const pathsByID = new Map<string, string>();
  const sourcesByID = new Map<string, Set<string>>();
  const externalImages = new Set<string>();
  for (const source of references) {
    const id = localAssetID(source);
    if (!id) { externalImages.add(source); continue; }
    if (!sourcesByID.has(id)) sourcesByID.set(id, new Set());
    sourcesByID.get(id)!.add(source);
  }

  const assets = await Promise.all([...sourcesByID.keys()].map(async (id): Promise<PackedAsset> => {
    const { mime, data } = await fetchAsset(id, signal);
    const path = `assets/asset-${id}.${extensionFor(mime)!}`;
    pathsByID.set(id, path);
    return { id, source: `/api/assets/${id}`, path, mime, size: data.byteLength, data };
  }));

  let markdown = snapshot.markdown;
  for (const [id, sources] of sourcesByID) {
    const relativePath = pathsByID.get(id)!;
    for (const source of sources) markdown = rewriteImageDestination(markdown, source, relativePath);
  }

  const markdownName = `${safeFileBase(item.title)}.md`;
  const manifest = {
    format: 'madoc-markdown-package',
    version: 1,
    item: { id: item.id, title: item.title },
    content: { generation: snapshot.generation, seq: snapshot.seq, exportedAt: new Date().toISOString() },
    markdown: markdownName,
    attachments: assets.map(({ id, source, path, mime, size }) => ({ id, source, path, mime, size })),
    unpackagedImages: [...externalImages],
  };
  const files: AsyncZippable = {
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
    [markdownName]: strToU8(markdown),
  };
  for (const { path, data } of assets) files[path] = [data, { level: 0 }];
  const data = await makeZip(files, signal);
  return { data, attachmentCount: assets.length, unpackagedImageCount: externalImages.size, fileName: `${safeFileBase(item.title)}.zip` };
}

export function downloadPortablePackage(data: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([data.slice().buffer as ArrayBuffer], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
