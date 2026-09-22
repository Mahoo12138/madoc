import { request } from './client';
import type { Item } from './types';

export interface TrashBatch {
  id: string;
  root: Item;
  deletedBy: string;
  deletedAt: string;
  itemCount: number;
}
export const trashKey = (workspaceId: string) =>
  ['trash', workspaceId] as const;
const path = (workspaceId: string) => `/workspaces/${workspaceId}/trash`;
export const trashAPI = {
  list: (workspaceId: string) => request<TrashBatch[]>(path(workspaceId)),
  items: (workspaceId: string, batchId: string) =>
    request<Item[]>(`${path(workspaceId)}/${batchId}/items`),
  restore: (workspaceId: string, batchId: string, parentId?: string | null) =>
    request<void>(`${path(workspaceId)}/${batchId}/restore`, {
      method: 'POST',
      body: JSON.stringify(
        parentId === undefined ? {} : { destination: { parentId } },
      ),
    }),
  purge: (workspaceId: string, batchId: string, confirmation: string) =>
    request<void>(`${path(workspaceId)}/${batchId}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
    }),
};
