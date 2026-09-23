import type { PortableZipEntry } from './portable-zip-reader';

type PackageItem = {
  id: string;
  parentId: string | null;
  type: 'folder' | 'markdown' | 'whiteboard';
  title: string;
  path: string;
  capturedAt?: string;
  content?: Record<string, unknown>;
};

type PackageAttachment = { id: string; path: string; mime: string; size: number; source: string };
type PortableManifest = {
  format: 'madoc-folder-package' | 'madoc-workspace-package';
  version: 1;
  root: { id: string; title: string; type: 'folder' | 'workspace'; path: string };
  items: PackageItem[];
  attachments: PackageAttachment[];
  unpackagedImages: { itemId: string; source: string }[];
  unpackagedItemLinks: { itemId: string; href: string }[];
  [key: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (entry: PortableZipEntry) => new TextDecoder('utf-8', { fatal: true }).decode(entry.data);

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`ZIP manifest 中缺少有效的${label}。`);
  return value;
}

export type InspectedPortablePackage = {
  manifest: PortableManifest;
  items: PackageItem[];
  attachments: PackageAttachment[];
  itemData: Map<string, Uint8Array>;
  directoryCount: number;
  markdownCount: number;
  whiteboardCount: number;
};

export function inspectPortablePackage(entries: PortableZipEntry[]): InspectedPortablePackage {
  const byPath = new Map<string, PortableZipEntry>();
  for (const entry of entries) byPath.set(entry.path, entry);
  const manifestEntry = byPath.get('manifest.json');
  if (!manifestEntry || manifestEntry.directory) throw new Error('ZIP 中缺少 manifest.json。');

  let raw: unknown;
  try { raw = JSON.parse(text(manifestEntry)); }
  catch { throw new Error('ZIP manifest.json 不是有效的 UTF-8 JSON。'); }
  if (!isRecord(raw) || (raw.format !== 'madoc-folder-package' && raw.format !== 'madoc-workspace-package') || raw.version !== 1) {
    throw new Error('ZIP 格式或版本不受支持。');
  }
  const expectedRootType = raw.format === 'madoc-folder-package' ? 'folder' : 'workspace';
  if (!isRecord(raw.root) || raw.root.type !== expectedRootType || !Array.isArray(raw.items) || !Array.isArray(raw.attachments)) {
    throw new Error('ZIP manifest 的目录结构无效。');
  }
  const root = {
    id: requireString(raw.root.id, '根目录 ID'),
    title: requireString(raw.root.title, '根目录名称'),
    type: expectedRootType,
    path: requireString(raw.root.path, '根目录路径'),
  } as PortableManifest['root'];
  const rootEntry = byPath.get(root.path);
  if (!rootEntry?.directory || root.path.includes('/')) throw new Error('ZIP 中缺少有效的根目录。');

  const items: PackageItem[] = [];
  const ids = new Set<string>([root.id]);
  const pathOwners = new Set<string>();
  for (const candidate of raw.items) {
    if (!isRecord(candidate)) throw new Error('ZIP manifest 中包含无效条目。');
    const id = requireString(candidate.id, 'Item ID');
    const title = requireString(candidate.title, 'Item 名称');
    const path = requireString(candidate.path, 'Item 路径');
    if (ids.has(id)) throw new Error(`ZIP manifest 中存在重复 Item ID：${id}`);
    ids.add(id);
    if (candidate.type !== 'folder' && candidate.type !== 'markdown' && candidate.type !== 'whiteboard') {
      throw new Error(`ZIP manifest 中包含不支持的条目类型：${String(candidate.type)}`);
    }
    if (candidate.parentId !== null && typeof candidate.parentId !== 'string') throw new Error(`ZIP 条目「${title}」的父级无效。`);
    if (!path.startsWith(`${root.path}/`) || path.includes('\\')) throw new Error(`ZIP 条目路径不在根目录内：${path}`);
    const key = path.normalize('NFC').toLowerCase();
    if (pathOwners.has(key)) throw new Error(`ZIP manifest 中存在重复条目路径：${path}`);
    pathOwners.add(key);
    items.push({
      id,
      parentId: candidate.parentId as string | null,
      type: candidate.type,
      title,
      path,
      ...(typeof candidate.capturedAt === 'string' ? { capturedAt: candidate.capturedAt } : {}),
      ...(isRecord(candidate.content) ? { content: candidate.content } : {}),
    });
  }

  const itemByID = new Map(items.map((item) => [item.id, item]));
  const pathByID = new Map([[root.id, root.path], ...items.map((item) => [item.id, item.path] as const)]);
  const expectedFiles = new Set(['manifest.json']);
  const expectedDirectories = new Set([root.path]);
  const itemData = new Map<string, Uint8Array>();
  let markdownCount = 0;
  let whiteboardCount = 0;

  for (const item of items) {
    const parentPath = item.parentId === null && root.type === 'workspace' ? root.path : pathByID.get(item.parentId ?? '');
    if (!parentPath || (item.parentId !== null && item.parentId !== root.id && itemByID.get(item.parentId)?.type !== 'folder')) {
      throw new Error(`ZIP 条目「${item.title}」没有有效的父级文件夹。`);
    }
    if (item.path.slice(0, item.path.lastIndexOf('/')) !== parentPath) throw new Error(`ZIP 条目「${item.title}」的路径与父级不一致。`);

    const archived = byPath.get(item.path);
    if (item.type === 'folder') {
      if (!archived?.directory) throw new Error(`ZIP 中缺少文件夹：${item.path}`);
      expectedDirectories.add(item.path);
      continue;
    }
    if (!archived || archived.directory) throw new Error(`ZIP 中缺少内容文件：${item.path}`);
    const markdown = item.type === 'markdown';
    if (markdown ? !/\.md$/i.test(item.path) : !/\.excalidraw$/i.test(item.path)) throw new Error(`ZIP 内容文件扩展名与类型不匹配：${item.path}`);
    if (markdown) {
      try { text(archived); }
      catch { throw new Error(`Markdown 文件不是有效的 UTF-8 文本：${item.path}`); }
      markdownCount++;
    } else {
      let board: unknown;
      try { board = JSON.parse(text(archived)); }
      catch { throw new Error(`白板文件不是有效的 UTF-8 JSON：${item.path}`); }
      if (!isRecord(board) || board.type !== 'excalidraw' || board.version !== 2 || !Array.isArray(board.elements) || !isRecord(board.appState) || !isRecord(board.files)) {
        throw new Error(`白板文件结构无效或版本不受支持：${item.path}`);
      }
      whiteboardCount++;
    }
    expectedFiles.add(item.path);
    itemData.set(item.id, archived.data);
  }

  const attachmentIDs = new Set<string>();
  const attachments: PackageAttachment[] = [];
  for (const candidate of raw.attachments) {
    if (!isRecord(candidate)) throw new Error('ZIP manifest 中包含无效附件。');
    const id = requireString(candidate.id, '附件 ID');
    const path = requireString(candidate.path, '附件路径');
    const mime = requireString(candidate.mime, '附件类型');
    const source = requireString(candidate.source, '附件来源');
    if (attachmentIDs.has(id)) throw new Error(`ZIP manifest 中存在重复附件 ID：${id}`);
    attachmentIDs.add(id);
    if (!/^assets\/asset-[0-9a-f-]+\.(?:png|jpg|gif|webp)$/i.test(path)) throw new Error(`ZIP 附件路径不受支持：${path}`);
    const archived = byPath.get(path);
    if (!archived || archived.directory || !Number.isSafeInteger(candidate.size) || candidate.size !== archived.data.byteLength) {
      throw new Error(`ZIP 附件缺失或大小与 manifest 不一致：${path}`);
    }
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)) throw new Error(`ZIP 附件类型不受支持：${mime}`);
    expectedFiles.add(path);
    attachments.push({ id, path, mime, size: candidate.size as number, source });
  }

  for (const entry of entries) {
    const expected = entry.directory ? expectedDirectories : expectedFiles;
    if (!expected.has(entry.path)) throw new Error(`ZIP 中存在 manifest 未登记的${entry.directory ? '目录' : '文件'}：${entry.path}`);
  }
  return { manifest: { ...raw, root, items, attachments } as PortableManifest, items, attachments, itemData, directoryCount: items.filter((item) => item.type === 'folder').length, markdownCount, whiteboardCount };
}

/** Adapt the single-document ZIP format into the same validated import tree.
 * The normalized root exists only in memory; archive limits still count the
 * original entries and the normal workspace importer creates the new folder.
 */
export function inspectMarkdownPortablePackage(entries: PortableZipEntry[]): InspectedPortablePackage | undefined {
  const manifestEntry = entries.find((entry) => entry.path === 'manifest.json');
  if (!manifestEntry || manifestEntry.directory) throw new Error('ZIP 中缺少 manifest.json。');
  let raw: unknown;
  try { raw = JSON.parse(text(manifestEntry)); }
  catch { throw new Error('ZIP manifest.json 不是有效的 UTF-8 JSON。'); }
  if (!isRecord(raw) || raw.format !== 'madoc-markdown-package') return undefined;
  if (raw.version !== 1 || !isRecord(raw.item) || !isRecord(raw.content) || !Array.isArray(raw.attachments) || !Array.isArray(raw.unpackagedImages))
    throw new Error('单篇 Markdown ZIP manifest 结构无效。');
  const itemID = requireString(raw.item.id, '文档 ID');
  const title = requireString(raw.item.title, '文档名称');
  const markdownPath = requireString(raw.markdown, 'Markdown 路径');
  if (markdownPath.includes('/') || markdownPath.includes('\\') || !/\.md$/i.test(markdownPath))
    throw new Error('单篇 Markdown ZIP 路径无效。');
  if (!Number.isSafeInteger(raw.content.generation) || Number(raw.content.generation) < 1 ||
    !Number.isSafeInteger(raw.content.seq) || Number(raw.content.seq) < 0 ||
    typeof raw.content.exportedAt !== 'string' || !Number.isFinite(Date.parse(raw.content.exportedAt)))
    throw new Error('单篇 Markdown ZIP 的内容水位无效。');
  if (raw.unpackagedImages.some((source) => typeof source !== 'string'))
    throw new Error('单篇 Markdown ZIP 的外部图片清单无效。');
  const rootID = `single-markdown-root:${itemID}`;
  if (rootID === itemID) throw new Error('单篇 Markdown ZIP 文档 ID 无效。');
  const prefix = '__madoc_markdown_package__';
  if (entries.some((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}/`)))
    throw new Error('ZIP 中包含与内部目录冲突的路径。');
  const sourceMarkdown = entries.find((entry) => entry.path === markdownPath);
  if (!sourceMarkdown || sourceMarkdown.directory) throw new Error(`ZIP 中缺少 Markdown 文件：${markdownPath}`);
  const attachmentPaths = new Set<string>();
  for (const candidate of raw.attachments) {
    if (!isRecord(candidate)) throw new Error('单篇 Markdown ZIP 附件清单无效。');
    const path = requireString(candidate.path, '附件路径');
    if (!/^assets\/asset-[0-9a-f-]+\.(?:png|jpg|gif|webp)$/i.test(path))
      throw new Error(`ZIP 附件路径不受支持：${path}`);
    if (attachmentPaths.has(path)) throw new Error(`ZIP manifest 中存在重复附件路径：${path}`);
    attachmentPaths.add(path);
  }
  const allowedPaths = new Set(['manifest.json', markdownPath, ...attachmentPaths]);
  for (const entry of entries) {
    if (entry.directory || !allowedPaths.has(entry.path))
      throw new Error(`单篇 Markdown ZIP 中存在未登记的${entry.directory ? '目录' : '文件'}：${entry.path}`);
  }
  const normalized: PortableZipEntry[] = entries
    .filter((entry) => entry.path !== 'manifest.json' && entry.path !== markdownPath)
    .concat([
      { path: prefix, directory: true, data: new Uint8Array() },
      { path: `${prefix}/${markdownPath}`, directory: false, data: sourceMarkdown.data },
      { path: 'manifest.json', directory: false, data: new TextEncoder().encode(JSON.stringify({
        format: 'madoc-folder-package', version: 1,
        root: { id: rootID, title, type: 'folder', path: prefix },
        items: [{ id: itemID, parentId: rootID, type: 'markdown', title, path: `${prefix}/${markdownPath}` }],
        attachments: raw.attachments,
        unpackagedImages: raw.unpackagedImages.map((source: string) => ({ itemId: itemID, source })),
        unpackagedItemLinks: [], sourceFormat: 'madoc-markdown-package',
      })) },
    ]);
  const result = inspectPortablePackage(normalized);
  result.items[0].path = markdownPath;
  result.manifest.items[0].path = markdownPath;
  return result;
}
