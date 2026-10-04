import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./hooks";
import type { Item, Workspace } from "./types";

export function useWorkspaceSettings(workspaceId: string) {
  const client = useQueryClient();
  const refreshWorkspace = async (
    patch: Partial<Pick<Workspace, "name" | "description">>,
  ) => {
    client.setQueryData<Workspace>(keys.workspace(workspaceId), (workspace) =>
      workspace ? { ...workspace, ...patch } : workspace,
    );
    client.setQueryData<Workspace[]>(keys.workspaces, (workspaces) =>
      workspaces?.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, ...patch } : workspace,
      ),
    );
    await Promise.all([
      client.invalidateQueries({ queryKey: keys.workspace(workspaceId) }),
      client.invalidateQueries({ queryKey: keys.workspaces }),
    ]);
  };
  const rename = useMutation({
    mutationFn: (name: string) => api.renameWorkspace(workspaceId, name),
    onSuccess: (_, name) => refreshWorkspace({ name: name.trim() }),
  });
  const describe = useMutation({
    mutationFn: (description: string) =>
      api.describeWorkspace(workspaceId, description),
    onSuccess: (_, description) =>
      refreshWorkspace({ description: description.trim() }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteWorkspace(workspaceId),
    onSuccess: async () => {
      const items = client.getQueryData<Item[]>(keys.items(workspaceId)) ?? [];
      const removedKeys = [
        keys.workspace(workspaceId),
        keys.items(workspaceId),
        keys.members(workspaceId),
        keys.invites(workspaceId),
        ...items.flatMap((item) => [
          keys.markdown(item.id),
          keys.whiteboard(item.id),
        ]),
      ];
      await Promise.all(
        removedKeys.map((queryKey) => client.cancelQueries({ queryKey })),
      );
      removedKeys.forEach((queryKey) => client.removeQueries({ queryKey }));
      client.setQueryData<Workspace[]>(keys.workspaces, (workspaces) =>
        workspaces?.filter((workspace) => workspace.id !== workspaceId),
      );
      await client.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
  return { rename, describe, remove };
}
