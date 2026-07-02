import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, gql } from './client';
import type { PreflightResponse, ServerInfo, User, Workspace } from './types';

// Query keys
export const queryKeys = {
  session: ['auth', 'session'] as const,
  info: ['server', 'info'] as const,
  workspaces: ['workspaces'] as const,
};

// Hooks
export function useInfo() {
  return useQuery<ServerInfo>({
    queryKey: queryKeys.info,
    queryFn: api.getInfo,
    retry: false,
  });
}

export function useSession() {
  return useQuery<{ user: User | null }>({
    queryKey: queryKeys.session,
    queryFn: api.getSession,
    retry: false,
  });
}

export function usePreflight() {
  return useMutation<PreflightResponse, Error, string>({
    mutationFn: api.preflight,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.signIn(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.session, data);
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.signOut,
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.session, { user: null });
      queryClient.invalidateQueries();
    },
  });
}

export function useCreateAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      email,
      password,
    }: {
      name: string;
      email: string;
      password: string;
    }) => api.createAdmin(name, email, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session });
      queryClient.invalidateQueries({ queryKey: queryKeys.info });
    },
  });
}

// ─── Workspace hooks ───────────────────────────────

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: queryKeys.workspaces,
    queryFn: gql.workspaces,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: gql.createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      gql.updateWorkspace(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });
}
