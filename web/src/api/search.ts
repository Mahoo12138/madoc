import { request } from './client';
import type { ItemType } from './types';

export interface SearchHit {
  id: string;
  type: ItemType;
  title: string;
  path: string;
  snippet: string;
  match: 'title' | 'path' | 'body';
  cacheSeq: number;
  headSeq: number;
  generation: number;
}
export interface SearchResults {
  items: SearchHit[];
  hasMore: boolean;
  staleDocuments: number;
}
export const searchKey = (workspaceId: string) =>
  ['search', workspaceId] as const;
export const searchWorkspace = (
  workspaceId: string,
  query: string,
  signal?: AbortSignal,
) =>
  request<SearchResults>(
    `/workspaces/${workspaceId}/search?${new URLSearchParams({ q: query })}`,
    { signal },
  );
