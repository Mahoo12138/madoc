import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { ItemType, Role } from './types';

export const keys = { session: ['session'] as const, workspaces: ['workspaces'] as const, workspace: (id: string) => ['workspace', id] as const, items: (id: string) => ['items', id] as const, members: (id: string) => ['members', id] as const, invites: (id: string) => ['invites', id] as const, markdown: (id: string) => ['markdown', id] as const, whiteboard: (id: string) => ['whiteboard', id] as const };
export const useSession = () => useQuery({ queryKey: keys.session, queryFn: api.session, staleTime: 60_000, retry: false });
export const useWorkspaces = () => useQuery({ queryKey: keys.workspaces, queryFn: api.workspaces });
export const useWorkspace = (id: string) => useQuery({ queryKey: keys.workspace(id), queryFn: () => api.workspace(id) });
export const useItems = (id: string) => useQuery({ queryKey: keys.items(id), queryFn: () => api.items(id) });
export const useMembers = (id: string) => useQuery({ queryKey: keys.members(id), queryFn: () => api.members(id) });
export const useInvites = (id: string) => useQuery({ queryKey: keys.invites(id), queryFn: () => api.invites(id) });
export const useMarkdown = (id: string) => useQuery({ queryKey: keys.markdown(id), queryFn: () => api.markdown(id) });
export const useWhiteboard = (id: string) => useQuery({ queryKey: keys.whiteboard(id), queryFn: () => api.whiteboard(id) });

export function useWorkspaceMutations(workspaceId?: string) {
  const client = useQueryClient();
  const refreshItems = () => workspaceId ? client.invalidateQueries({ queryKey: keys.items(workspaceId) }) : Promise.resolve();
  return {
    createWorkspace: useMutation({ mutationFn: api.createWorkspace, onSuccess: () => client.invalidateQueries({ queryKey: keys.workspaces }) }),
    createItem: useMutation({ mutationFn: (input: { type: ItemType; title: string; parentId: string | null }) => api.createItem(workspaceId!, input.type, input.title, input.parentId), onSuccess: refreshItems }),
    renameItem: useMutation({ mutationFn: (input: { id: string; title: string }) => api.renameItem(input.id, input.title), onSuccess: refreshItems }),
    deleteItem: useMutation({ mutationFn: api.deleteItem, onSuccess: refreshItems }),
    moveItem: useMutation({ mutationFn: (input: { id: string; parentId: string | null; index: number }) => api.moveItem(input.id, input.parentId, input.index), onSuccess: refreshItems }),
    updateMember: useMutation({ mutationFn: (input: { userId: string; role: Role }) => api.updateMember(workspaceId!, input.userId, input.role), onSuccess: () => client.invalidateQueries({ queryKey: keys.members(workspaceId!) }) }),
    removeMember: useMutation({ mutationFn: (userId: string) => api.removeMember(workspaceId!, userId), onSuccess: () => client.invalidateQueries({ queryKey: keys.members(workspaceId!) }) }),
    createInvite: useMutation({ mutationFn: (input: { email: string; role: 'editor' | 'viewer' }) => api.createInvite(workspaceId!, input.email, input.role), onSuccess: () => client.invalidateQueries({ queryKey: keys.invites(workspaceId!) }) }),
  };
}
