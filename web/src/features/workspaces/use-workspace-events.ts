import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@/api/hooks';
import { personalKey } from '@/api/personal-items';
import { searchKey } from '@/api/search';
import { trashKey } from '@/api/trash';
import { RealtimeClient } from '@/features/realtime/client';

export function useWorkspaceEvents(workspaceId: string, userId?: string) {
  const queries = useQueryClient();
  const [unavailable, setUnavailable] = useState<string>();
  useEffect(() => {
    if (!userId) return;
    const realtime = new RealtimeClient();
    const unsubscribe = realtime.subscribe((message) => {
      if (
        message.type === 'connection.changed' &&
        (message.payload as { state: string }).state === 'online'
      ) {
        realtime.sendOnline('workspace.watch', '', { workspaceId });
      }
      if (
        (message.payload as { workspaceId?: string } | undefined)
          ?.workspaceId !== workspaceId
      )
        return;
      if (
        message.type !== 'workspace.changed' &&
        message.type !== 'workspace.unavailable'
      )
        return;
      setUnavailable(
        message.type === 'workspace.unavailable' ? workspaceId : undefined,
      );
      for (const key of [
        keys.items(workspaceId),
        keys.workspace(workspaceId),
        keys.workspaces,
        keys.members(workspaceId),
        keys.invites(workspaceId),
        trashKey(workspaceId),
        searchKey(workspaceId),
        personalKey(workspaceId),
      ]) {
        void queries.invalidateQueries({ queryKey: key });
      }
    });
    return () => {
      realtime.sendOnline('workspace.unwatch', '');
      unsubscribe();
      realtime.close();
    };
  }, [workspaceId, userId, queries]);
  return unavailable === workspaceId;
}
