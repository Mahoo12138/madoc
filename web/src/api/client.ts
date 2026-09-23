import type { BoardScene, Invite, Item, ItemCapture, ItemType, MarkdownState, Member, Role, Session, User, WhiteboardState, Workspace } from './types';
import { APIError } from './types';

let csrfToken = '';
export const setCSRFToken = (token?: string) => { if (token) csrfToken = token; };

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('x-madoc-csrf-token', csrfToken);
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new APIError(body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? response.statusText, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  setupStatus: () => request<{ initialized: boolean }>('/setup/status'),
  setupAdmin: async (body: { name: string; email: string; password: string }) => { const result = await request<{ user: User; csrfToken: string }>('/setup/admin', { method: 'POST', body: JSON.stringify(body) }); setCSRFToken(result.csrfToken); return result; },
  signIn: async (body: { email: string; password: string }) => { const result = await request<{ user: User; csrfToken: string }>('/auth/sign-in', { method: 'POST', body: JSON.stringify(body) }); setCSRFToken(result.csrfToken); return result; },
  signOut: () => request<void>('/auth/sign-out', { method: 'POST' }),
  session: async () => { const result = await request<Session>('/auth/session'); setCSRFToken(result.csrfToken); return result; },
  workspaces: () => request<Workspace[]>('/workspaces'),
  workspace: (id: string) => request<Workspace>(`/workspaces/${id}`),
  createWorkspace: (name: string) => request<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
  renameWorkspace: (id: string, name: string) => request<void>(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteWorkspace: (id: string) => request<void>(`/workspaces/${id}`, { method: 'DELETE' }),
  members: (workspaceId: string) => request<Member[]>(`/workspaces/${workspaceId}/members`),
  updateMember: (workspaceId: string, userId: string, role: Role) => request<void>(`/workspaces/${workspaceId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeMember: (workspaceId: string, userId: string) => request<void>(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),
  invites: (workspaceId: string) => request<Invite[]>(`/workspaces/${workspaceId}/invites`),
  createInvite: (workspaceId: string, email: string, role: 'editor' | 'viewer') => request<{ invite: Invite; token: string; url: string }>(`/workspaces/${workspaceId}/invites`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  inspectInvite: (token: string) => request<{ invite: Invite; workspaceName: string }>(`/invites/${encodeURIComponent(token)}`),
  acceptInvite: async (token: string, body: { name: string; password: string }) => { const result = await request<{ user: User; workspace: Workspace; csrfToken: string }>(`/invites/${encodeURIComponent(token)}/accept`, { method: 'POST', body: JSON.stringify(body) }); setCSRFToken(result.csrfToken); return result; },
  items: (workspaceId: string) => request<Item[]>(`/workspaces/${workspaceId}/items`),
  item: (id: string) => request<Item>(`/items/${id}`),
  captureItem: (id: string, signal?: AbortSignal) => request<ItemCapture>(`/items/${id}/capture`, { signal, cache: 'no-store' }),
  createItem: (workspaceId: string, type: ItemType, title: string, parentId: string | null) => request<Item>(`/workspaces/${workspaceId}/items`, { method: 'POST', body: JSON.stringify({ type, title, parentId }) }),
  renameItem: (id: string, title: string) => request<void>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteItem: (id: string) => request<void>(`/items/${id}`, { method: 'DELETE' }),
  moveItem: (id: string, parentId: string | null, index: number) => request<void>(`/items/${id}/move`, { method: 'POST', body: JSON.stringify({ parentId, index }) }),
  markdown: (id: string) => request<MarkdownState>(`/items/${id}/markdown`),
  resetMarkdown: (id: string, snapshot: string, markdown: string) => request<void>(`/items/${id}/markdown`, { method: 'PUT', body: JSON.stringify({ snapshot, markdown }) }),
  whiteboard: (id: string) => request<WhiteboardState>(`/items/${id}/whiteboard`),
  updateWhiteboard: (id: string, baseRevision: number, scene: BoardScene) => request<WhiteboardState>(`/items/${id}/whiteboard`, { method: 'PUT', body: JSON.stringify({ baseRevision, scene }) }),
  uploadAsset: (workspaceId: string, file: File, itemId?: string) => { const body = new FormData(); body.append('file', file); if (itemId) body.append('itemId', itemId); return request<{ asset: { id: string }; url: string }>(`/workspaces/${workspaceId}/assets`, { method: 'POST', body }); },
};
