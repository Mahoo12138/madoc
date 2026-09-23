export const PORTABLE_ATTACHMENT_SPLIT_THRESHOLD = 50 * 1024 * 1024;

export type PortableAssetPayload = { id: string; data: Uint8Array };

export function planPortableAttachmentPackages<T extends PortableAssetPayload>(
  assets: T[],
  splitThreshold = PORTABLE_ATTACHMENT_SPLIT_THRESHOLD,
) {
  const totalBytes = assets.reduce((total, asset) => total + asset.data.byteLength, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) throw new Error('附件总大小超出可处理范围。');
  if (!Number.isSafeInteger(splitThreshold) || splitThreshold <= 0) throw new Error('附件分包阈值无效。');
  if (totalBytes <= splitThreshold) return { mode: 'single' as const, totalBytes, parts: [] as T[][] };

  const parts: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;
  for (const asset of [...assets].sort((a, b) => a.id.localeCompare(b.id))) {
    if (current.length > 0 && currentBytes + asset.data.byteLength > splitThreshold) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(asset);
    currentBytes += asset.data.byteLength;
    if (currentBytes >= splitThreshold) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
  }
  if (current.length > 0) parts.push(current);
  return { mode: 'set' as const, totalBytes, parts };
}
