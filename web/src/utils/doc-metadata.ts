export interface DocMetadata {
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  favorite?: boolean;
  trashedAt?: number;
}

export type DocMetadataMap = Record<string, DocMetadata>;

const storageKey = (workspaceId: string) =>
  `madoc:workspace:${workspaceId}:doc-metadata`;

const fallbackTitle = 'Untitled';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeTitle(title?: string) {
  const next = title?.trim();
  return next || fallbackTitle;
}

export function getDocDisplayTitle(
  metadata: DocMetadataMap,
  docId: string
): string {
  return normalizeTitle(metadata[docId]?.title);
}

export function loadWorkspaceDocMetadata(workspaceId: string): DocMetadataMap {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as DocMetadataMap;
  } catch {
    return {};
  }
}

export function saveWorkspaceDocMetadata(
  workspaceId: string,
  metadata: DocMetadataMap
): DocMetadataMap {
  if (canUseStorage()) {
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(metadata));
  }
  return metadata;
}

export function reconcileWorkspaceDocMetadata(
  workspaceId: string,
  timestamps: Record<string, number>
): DocMetadataMap {
  const current = loadWorkspaceDocMetadata(workspaceId);
  const next: DocMetadataMap = { ...current };

  for (const [docId, timestamp] of Object.entries(timestamps)) {
    const previous = next[docId] ?? {};
    next[docId] = {
      ...previous,
      title: normalizeTitle(previous.title),
      createdAt: previous.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
  }

  return saveWorkspaceDocMetadata(workspaceId, next);
}

export function updateDocMetadata(
  workspaceId: string,
  docId: string,
  patch: DocMetadata
): DocMetadataMap {
  const current = loadWorkspaceDocMetadata(workspaceId);
  const now = Date.now();
  const previous = current[docId] ?? {};
  const next = {
    ...current,
    [docId]: {
      ...previous,
      ...patch,
      title: normalizeTitle(patch.title ?? previous.title),
      createdAt: patch.createdAt ?? previous.createdAt ?? now,
      updatedAt: patch.updatedAt ?? previous.updatedAt ?? now,
    },
  };

  return saveWorkspaceDocMetadata(workspaceId, next);
}

export function getDocCreatedAt(
  metadata: DocMetadataMap,
  docId: string
): number | undefined {
  return metadata[docId]?.createdAt;
}

export function getDocUpdatedAt(
  metadata: DocMetadataMap,
  docId: string
): number | undefined {
  return metadata[docId]?.updatedAt;
}

export function getDocFavorite(
  metadata: DocMetadataMap,
  docId: string
): boolean {
  return Boolean(metadata[docId]?.favorite);
}

export function getDocTrashedAt(
  metadata: DocMetadataMap,
  docId: string
): number | undefined {
  return metadata[docId]?.trashedAt;
}

export function isDocTrashed(metadata: DocMetadataMap, docId: string): boolean {
  return Boolean(getDocTrashedAt(metadata, docId));
}
