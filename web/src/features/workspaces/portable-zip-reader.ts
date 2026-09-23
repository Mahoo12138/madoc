import { Unzip, UnzipInflate, type UnzipFile } from 'fflate';

export type PortableZipLimits = {
  maxArchiveBytes: number;
  maxExpandedBytes: number;
  maxEntryBytes: number;
  maxEntries: number;
};

export type PortableZipEntry = { path: string; directory: boolean; data: Uint8Array };

function archivePath(value: string) {
  const directory = value.endsWith('/');
  const path = directory ? value.slice(0, -1) : value;
  const parts = path.split('/');
  if (!path || path.startsWith('/') || value.includes('\\') || parts.some((part) => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f:]/.test(part))) {
    throw new Error(`ZIP 中包含不安全的路径：${value}`);
  }
  return { path, directory };
}

function checkPathCollision(path: string, directory: boolean, files: Set<string>, directories: Set<string>, explicit: Set<string>) {
  const key = path.normalize('NFC').toLowerCase();
  if (explicit.has(key)) throw new Error(`ZIP 中存在重复路径：${path}`);
  const parts = key.split('/');
  for (let index = 1; index < parts.length; index++) {
    if (files.has(parts.slice(0, index).join('/'))) throw new Error(`ZIP 路径与文件冲突：${path}`);
  }
  if (directory) {
    if (files.has(key)) throw new Error(`ZIP 路径与文件冲突：${path}`);
    directories.add(key);
  } else {
    if (directories.has(key) || [...directories].some((entry) => entry.startsWith(`${key}/`))) {
      throw new Error(`ZIP 路径与目录冲突：${path}`);
    }
    files.add(key);
  }
  explicit.add(key);
  for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0, index).join('/'));
}

function archiveHasEndRecord(data: Uint8Array, entryCount: number) {
  const minimumOffset = Math.max(0, data.length - 65_557);
  for (let offset = data.length - 22; offset >= minimumOffset; offset--) {
    if (data[offset] !== 0x50 || data[offset + 1] !== 0x4b || data[offset + 2] !== 0x05 || data[offset + 3] !== 0x06) continue;
    const view = new DataView(data.buffer, data.byteOffset + offset, data.length - offset);
    const commentLength = view.getUint16(20, true);
    const disk = view.getUint16(4, true);
    const directoryDisk = view.getUint16(6, true);
    const entriesOnDisk = view.getUint16(8, true);
    const totalEntries = view.getUint16(10, true);
    if (offset + 22 + commentLength !== data.length || disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== totalEntries) continue;
    if (totalEntries === 0xffff) throw new Error('目前不支持 ZIP64 压缩包。');
    return totalEntries === entryCount;
  }
  return false;
}

export async function readPortableZip(file: File, limits: PortableZipLimits, signal?: AbortSignal): Promise<PortableZipEntry[]> {
  if (file.size > limits.maxArchiveBytes) throw new Error('ZIP 文件超过当前大小上限，尚未读取。');
  if (signal?.aborted) throw signal.reason ?? new DOMException('已取消', 'AbortError');

  const entries: PortableZipEntry[] = [];
  const files = new Set<string>();
  const directories = new Set<string>();
  const explicit = new Set<string>();
  const tail = new Uint8Array(65_557);
  let tailSize = 0;
  let expandedBytes = 0;
  let compressedBytes = 0;
  let entryCount = 0;
  let failure: Error | undefined;
  const reader = file.stream().getReader();
  const cancelRead = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', cancelRead, { once: true });

  const unzip = new Unzip((entry: UnzipFile) => {
    if (failure) return;
    try {
      const normalized = archivePath(entry.name);
      checkPathCollision(normalized.path, normalized.directory, files, directories, explicit);
      if (entry.compression !== 0 && entry.compression !== 8) throw new Error(`ZIP 文件使用不支持的压缩方式：${normalized.path}`);
      entryCount++;
      if (entryCount > limits.maxEntries) throw new Error('ZIP 中的文件和目录数量超过当前上限。');
      if (entry.originalSize !== undefined && entry.originalSize > limits.maxEntryBytes) throw new Error(`ZIP 文件超过单项大小上限：${normalized.path}`);
      if (entry.originalSize !== undefined && expandedBytes + entry.originalSize > limits.maxExpandedBytes) throw new Error('ZIP 解压后的总大小超过当前上限。');

      let entryBytes = 0;
      const chunks: Uint8Array[] = [];
      entry.ondata = (error, chunk, final) => {
        if (failure) return;
        if (error) { failure = new Error(`无法解压 ZIP 文件：${normalized.path}`); return; }
        if (signal?.aborted) { failure = signal.reason instanceof Error ? signal.reason : new DOMException('已取消', 'AbortError'); return; }
        if (chunk.length) {
          entryBytes += chunk.length;
          expandedBytes += chunk.length;
          if (entryBytes > limits.maxEntryBytes) { failure = new Error(`ZIP 文件超过单项大小上限：${normalized.path}`); return; }
          if (expandedBytes > limits.maxExpandedBytes) { failure = new Error('ZIP 解压后的总大小超过当前上限。'); return; }
          chunks.push(chunk.slice());
        }
        if (final) {
          const data = new Uint8Array(entryBytes);
          let offset = 0;
          for (const part of chunks) { data.set(part, offset); offset += part.length; }
          entries.push({ path: normalized.path, directory: normalized.directory, data });
        }
      };
      entry.start();
    } catch (error) {
      failure = error instanceof Error ? error : new Error('ZIP 文件结构无效。');
    }
  });
  unzip.register(UnzipInflate);

  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('已取消', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      compressedBytes += value.length;
      if (compressedBytes > limits.maxArchiveBytes) throw new Error('ZIP 文件超过当前大小上限。');
      if (value.length >= tail.length) {
        tail.set(value.subarray(value.length - tail.length));
        tailSize = tail.length;
      } else {
        const kept = Math.min(tailSize, tail.length - value.length);
        tail.copyWithin(0, tailSize - kept, tailSize);
        tail.set(value, kept);
        tailSize = kept + value.length;
      }
      unzip.push(value, false);
      if (failure) throw failure;
    }
    unzip.push(new Uint8Array(), true);
    if (failure) throw failure;
    if (!archiveHasEndRecord(tail.subarray(0, tailSize), entryCount)) throw new Error('ZIP 目录不完整或与文件列表不一致。');
    return entries;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof Error ? error : new Error('无法读取 ZIP 文件。');
  } finally {
    signal?.removeEventListener('abort', cancelRead);
    reader.releaseLock();
  }
}
