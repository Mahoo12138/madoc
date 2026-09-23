import { inspectPortablePackage } from './portable-package-inspector';
import type { PortableZipEntry } from './portable-zip-reader';

export type PortablePackagePart = { fileName: string; entries: PortableZipEntry[] };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('包集清单包含无效对象。');
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('包集清单缺少有效列表。');
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('包集清单缺少有效文本。');
  return value;
}

function parse(data: Uint8Array) {
  try {
    return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)));
  } catch {
    throw new Error('包集清单不是有效的 UTF-8 JSON 对象。');
  }
}

function uniqueIDs(value: unknown) {
  const values = list(value).map(text);
  if (new Set(values).size !== values.length) throw new Error('包集清单包含重复 ID。');
  return values;
}

function sameIDs(declared: unknown, actual: unknown[]) {
  const ids = uniqueIDs(declared);
  const actualIDs = uniqueIDs(actual);
  const expected = new Set(ids);
  if (ids.length !== actualIDs.length || actualIDs.some((id) => !expected.has(id)))
    throw new Error('分包条目 ID 与包集清单不一致。');
}

function sameFields(left: Record<string, unknown>, right: Record<string, unknown>, fields: string[]) {
  if (fields.some((key) => left[key] !== right[key])) throw new Error('分包元数据与包集清单不一致。');
}

const attachmentFields = ['id', 'path', 'mime', 'size', 'source'];

// Entries must first pass readPortableZip with caller-supplied resource limits.
// This validates the whole set; inspecting the content ZIP alone is insufficient.
export function inspectPortablePackageSet(data: Uint8Array, archives: PortablePackagePart[]) {
  const set = parse(data);
  if (set.format !== 'madoc-package-set' || set.version !== 1) throw new Error('包集格式或版本不受支持。');
  const setID = text(set.id);
  const root = record(set.root);
  const parts = list(set.parts).map(record);
  const attachments = list(set.attachments).map(record);
  if (parts.length < 2 || archives.length !== parts.length) throw new Error('请选择完整包集：分包数量不一致。');
  if (!Number.isSafeInteger(set.attachmentBytes) || (set.attachmentBytes as number) < 0)
    throw new Error('包集附件总大小无效。');

  const selected = new Map<string, PortablePackagePart>();
  const selectedNames = new Set<string>();
  for (const archive of archives) {
    const name = text(archive.fileName);
    const key = name.normalize('NFC').toLowerCase();
    if (selectedNames.has(key)) throw new Error('选中了重复的分包文件。');
    selectedNames.add(key);
    selected.set(name, archive);
  }

  const attachmentByID = new Map<string, Record<string, unknown>>();
  const attachmentPaths = new Set<string>();
  let attachmentBytes = 0;
  for (const attachment of attachments) {
    const id = text(attachment.id);
    const path = text(attachment.path);
    const key = path.normalize('NFC').toLowerCase();
    if (attachmentByID.has(id) || attachmentPaths.has(key)) throw new Error('包集包含重复附件 ID 或路径。');
    if (!Number.isSafeInteger(attachment.size) || (attachment.size as number) < 0)
      throw new Error('包集附件大小无效。');
    const extension = (
      { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' } as Record<string, string>
    )[text(attachment.mime)];
    if (!extension || path !== `assets/asset-${id}.${extension}` || attachment.source !== `/api/assets/${id}`)
      throw new Error('包集附件路径、类型或来源与 ID 不一致。');
    attachmentByID.set(id, attachment);
    attachmentPaths.add(key);
    attachmentBytes += attachment.size as number;
    if (!Number.isSafeInteger(attachmentBytes)) throw new Error('包集附件总大小无效。');
  }
  if (attachmentBytes !== set.attachmentBytes) throw new Error('包集附件总大小与清单不一致。');

  const partNames = new Set<string>();
  const partNumbers = new Set<number>();
  const assignedAttachments = new Set<string>();
  const merged: PortableZipEntry[] = [];
  const mergedPaths = new Map<string, boolean>();
  let content: ReturnType<typeof inspectPortablePackage> | undefined;
  for (const part of parts) {
    const fileName = text(part.fileName);
    const nameKey = fileName.normalize('NFC').toLowerCase();
    const partNumber = part.part;
    if (!/^[^/\\]+\.zip$/i.test(fileName) || partNames.has(nameKey)) throw new Error('包集分包文件名无效或重复。');
    partNames.add(nameKey);
    if (
      !Number.isSafeInteger(partNumber) ||
      (partNumber as number) < 1 ||
      (partNumber as number) > parts.length ||
      partNumbers.has(partNumber as number)
    )
      throw new Error('包集分包编号无效或重复。');
    partNumbers.add(partNumber as number);
    const role = partNumber === 1 ? 'content' : 'attachments';
    if (part.role !== role) throw new Error('包集分包角色与编号不一致。');
    const archive = selected.get(fileName);
    if (!archive) throw new Error(`包集缺少分包：${fileName}`);
    const manifestEntries = archive.entries.filter((entry) => entry.path === 'manifest.json');
    if (manifestEntries.length !== 1 || manifestEntries[0].directory) throw new Error('分包缺少唯一的 manifest.json。');
    const manifest = parse(manifestEntries[0].data);
    sameFields(record(manifest.packageSet), { id: setID, role, part: partNumber, partCount: parts.length }, [
      'id',
      'role',
      'part',
      'partCount',
    ]);
    const partAttachments = list(manifest.attachments).map(record);
    sameIDs(
      part.attachmentIDs,
      partAttachments.map((attachment) => attachment.id),
    );
    if (role === 'content') {
      if (partAttachments.length) throw new Error('内容分包不能包含附件。');
      content = inspectPortablePackage(archive.entries);
      sameFields(record(content.manifest.root), root, ['id', 'title', 'type', 'path']);
      sameIDs(
        part.itemIDs,
        content.items.map((item) => item.id),
      );
    } else {
      if (manifest.format !== 'madoc-asset-part' || manifest.version !== 1)
        throw new Error('附件分包格式或版本不受支持。');
      sameIDs(part.itemIDs, []);
      if (!partAttachments.length) throw new Error('附件分包不能为空。');
      const expectedPaths = new Set(['manifest.json']);
      for (const attachment of partAttachments) {
        const id = text(attachment.id);
        const declared = attachmentByID.get(id);
        if (!declared || declared.partFileName !== fileName || assignedAttachments.has(id))
          throw new Error('附件分包归属与包集清单不一致。');
        sameFields(attachment, declared, attachmentFields);
        assignedAttachments.add(id);
        expectedPaths.add(text(attachment.path));
      }
      if (archive.entries.some((entry) => entry.directory || !expectedPaths.has(entry.path)))
        throw new Error('附件分包包含未登记的文件或目录。');
    }
    for (const entry of archive.entries) {
      if (entry.path === 'manifest.json') continue;
      const key = entry.path.normalize('NFC').toLowerCase();
      if (mergedPaths.has(key)) throw new Error('分包之间存在重复文件或目录路径。');
      mergedPaths.set(key, entry.directory);
      merged.push(entry);
    }
  }
  if (!content || assignedAttachments.size !== attachments.length) throw new Error('包集缺少内容分包或附件。');
  for (const path of mergedPaths.keys()) {
    const segments = path.split('/');
    segments.pop();
    while (segments.length) {
      if (mergedPaths.get(segments.join('/')) === false) throw new Error('分包之间存在文件与目录冲突。');
      segments.pop();
    }
  }
  const manifest = {
    ...content.manifest,
    attachments: attachments.map(({ partFileName: _part, ...attachment }) => attachment),
  };
  merged.push({ path: 'manifest.json', directory: false, data: new TextEncoder().encode(JSON.stringify(manifest)) });
  const inspected = inspectPortablePackage(merged);
  const byPath = new Map(merged.map((entry) => [entry.path, entry.data]));
  return {
    ...inspected,
    packageSetID: setID,
    attachmentData: new Map(inspected.attachments.map((attachment) => [attachment.id, byPath.get(attachment.path)!])),
  };
}
