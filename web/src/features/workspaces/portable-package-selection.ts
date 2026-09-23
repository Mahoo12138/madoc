import { inspectMarkdownPortablePackage, inspectPortablePackage } from './portable-package-inspector';
import { inspectPortablePackageSet, type PortablePackagePart } from './portable-package-set-inspector';
import { readPortableZip, type PortableZipLimits } from './portable-zip-reader';

// Limits cover the entire selection, including ZIP manifests and the external set manifest.
export const portableImportLimits: PortableZipLimits = {
  maxArchiveBytes: 256 * 1024 * 1024,
  maxExpandedBytes: 512 * 1024 * 1024,
  maxEntryBytes: 512 * 1024 * 1024,
  maxEntries: 5000,
};

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('已取消', 'AbortError');
}

async function readManifest(file: File, limit: number, signal?: AbortSignal) {
  if (file.size > limit) throw new Error('包集清单超过当前大小上限，尚未读取。');
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      checkAbort(signal);
      const { done, value } = await reader.read();
      checkAbort(signal);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('包集清单超过当前大小上限。');
      chunks.push(value);
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    return data;
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readPortablePackageSelection(
  files: File[],
  limits: PortableZipLimits = portableImportLimits,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
) {
  checkAbort(signal);
  for (const key of ['maxArchiveBytes', 'maxExpandedBytes', 'maxEntryBytes', 'maxEntries'] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0) throw new Error('导入读取限额必须为正整数。');
  }
  if (!files.length) throw new Error('请选择一个 ZIP，或包集清单及全部 ZIP 分包。');
  if (files.length > limits.maxEntries) throw new Error('所选文件数量超过整组上限，尚未读取。');
  const names = new Set<string>();
  let compressedBytes = 0;
  for (const file of files) {
    const name = file.name.normalize('NFC').toLowerCase();
    if (names.has(name)) throw new Error('所选文件中包含重复名称，请重新选择。');
    names.add(name);
    if (!/\.(?:zip|package-set\.json)$/i.test(name)) throw new Error('请选择 ZIP 或 .package-set.json 包集清单。');
    compressedBytes += file.size;
    if (!Number.isSafeInteger(compressedBytes) || compressedBytes > limits.maxArchiveBytes)
      throw new Error('所选文件合计超过整组压缩大小上限，尚未读取。');
  }
  const manifests = files.filter((file) => /\.package-set\.json$/i.test(file.name));
  const zips = files.filter((file) => /\.zip$/i.test(file.name));
  if (manifests.length > 1 || (!manifests.length && zips.length !== 1) || (manifests.length && zips.length < 2)) {
    throw new Error('请选择一个独立 ZIP，或一份包集清单及其全部分包。');
  }

  let setData: Uint8Array | undefined;
  let expandedBytes = 0;
  let entryCount = 0;
  let done = 0;
  onProgress?.(done, files.length);
  if (manifests.length) {
    setData = await readManifest(manifests[0], Math.min(limits.maxEntryBytes, limits.maxExpandedBytes), signal);
    expandedBytes = setData.byteLength;
    entryCount = 1;
    onProgress?.(++done, files.length);
  }
  const parts: PortablePackagePart[] = [];
  // Sequential reading bounds retained decompressed data across all parts.
  for (const file of zips) {
    checkAbort(signal);
    const entries = await readPortableZip(
      file,
      {
        ...limits,
        maxExpandedBytes: limits.maxExpandedBytes - expandedBytes,
        maxEntries: limits.maxEntries - entryCount,
      },
      signal,
    );
    for (const entry of entries) expandedBytes += entry.data.byteLength;
    entryCount += entries.length;
    parts.push({ fileName: file.name, entries });
    onProgress?.(++done, files.length);
  }
  checkAbort(signal);
  if (setData) {
    return {
      ...inspectPortablePackageSet(setData, parts),
      compressedBytes,
      expandedBytes,
      entryCount,
      fileCount: files.length,
    };
  }
  const inspected = inspectMarkdownPortablePackage(parts[0].entries) ?? inspectPortablePackage(parts[0].entries);
  if (inspected.manifest.packageSet !== undefined)
    throw new Error('这是包集中的内容分包，请同时选择 .package-set.json 和全部附件分包。');
  const entriesByPath = new Map(parts[0].entries.map((entry) => [entry.path, entry.data]));
  return {
    ...inspected,
    packageSetID: undefined,
    attachmentData: new Map(
      inspected.attachments.map((attachment) => [attachment.id, entriesByPath.get(attachment.path)!]),
    ),
    compressedBytes,
    expandedBytes,
    entryCount,
    fileCount: files.length,
  };
}

export type PortableImportPreview = Awaited<ReturnType<typeof readPortablePackageSelection>>;
