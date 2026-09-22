import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { request } from './client';
import { useSession } from './hooks';
import type { Item } from './types';

export interface PersonalItems {
  favorites: Item[];
  recent: { item: Item; visitedAt: string }[];
}
export const personalKey = (workspaceId: string) =>
  ['personal-items', workspaceId] as const;
const userKey = (workspaceId: string, userId?: string) =>
  [...personalKey(workspaceId), userId] as const;
export function usePersonalItems(workspaceId: string) {
  const session = useSession();
  return useQuery({
    queryKey: userKey(workspaceId, session.data?.user?.id),
    queryFn: () =>
      request<PersonalItems>(`/workspaces/${workspaceId}/personal-items`),
    enabled: !!session.data?.user,
    retry: false,
  });
}
export function useFavorite(workspaceId: string) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      request<void>(`/items/${id}/favorite`, {
        method: favorite ? 'PUT' : 'DELETE',
      }),
    onSuccess: () =>
      queries.invalidateQueries({ queryKey: personalKey(workspaceId) }),
    onError: () =>
      notifications.show({
        color: 'red',
        message: '收藏未更新，请确认网络和访问权限后重试。',
      }),
  });
}
export function useRecordVisit(item: Item, ready: boolean, userId: string) {
  const queries = useQueryClient();
  const recorded = useRef('');
  const visit = useMutation({
    mutationFn: () =>
      request<void>(`/items/${item.id}/visit`, { method: 'POST' }),
    onSuccess: () =>
      queries.invalidateQueries({
        queryKey: userKey(item.workspaceId, userId),
      }),
    onError: () =>
      notifications.show({
        color: 'yellow',
        message: '最近访问未更新，重新打开内容后会重试。',
      }),
  });
  const record = visit.mutate;
  useEffect(() => {
    const key = `${userId}:${item.id}`;
    if (!ready || recorded.current === key) return;
    recorded.current = key;
    record();
  }, [item.id, userId, ready, record]);
}
