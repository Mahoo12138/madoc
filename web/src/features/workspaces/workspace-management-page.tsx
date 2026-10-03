import { lazy, Suspense, useEffect, useState } from "react";
import { Alert, Button, Center, Loader, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useItems, useSession, useWorkspace } from "@/api/hooks";
import { APIError } from "@/api/types";
import { WorkspaceSettings } from "./workspace-settings";

const WorkspaceExportDialog = lazy(() =>
  import("./workspace-export-dialog").then((module) => ({
    default: module.WorkspaceExportDialog,
  })),
);

export function WorkspaceManagementPage() {
  const { workspaceId } = useParams({ strict: false }) as {
    workspaceId: string;
  };
  const navigate = useNavigate();
  const session = useSession();
  const workspace = useWorkspace(workspaceId);
  const items = useItems(workspaceId);
  const [exportOpened, setExportOpened] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const returnItemId = useRouterState({
    select: (state) =>
      (state.location.state as { madocManagementReturnItemId?: unknown })
        ?.madocManagementReturnItemId,
  });
  const unauthorized =
    session.error instanceof APIError && session.error.status === 401;

  useEffect(() => {
    if (unauthorized || (session.isSuccess && !session.data?.user))
      void navigate({ to: "/sign-in", replace: true });
  }, [navigate, session.data?.user, session.isSuccess, unauthorized]);

  if (session.isPending || workspace.isPending) {
    return (
      <Center mih="100vh">
        <Stack align="center" role="status">
          <Loader aria-hidden />
          <Text>正在加载工作区管理…</Text>
        </Stack>
      </Center>
    );
  }
  if (unauthorized) return null;
  if (session.isError) {
    return (
      <Center mih="100vh" p="xl">
        <Stack align="center" maw={420}>
          <Alert color="red" role="alert" title="无法确认登录状态">
            暂时无法连接服务，请重试后继续管理工作区。
          </Alert>
          <Button
            onClick={() => void session.refetch()}
            loading={session.isFetching}
          >
            重试
          </Button>
        </Stack>
      </Center>
    );
  }
  if (!session.data?.user) return null;

  const denied =
    workspace.error instanceof APIError &&
    [401, 403, 404].includes(workspace.error.status);
  if (denied || !workspace.data) {
    return (
      <Center mih="100vh" p="xl">
        <Stack align="center" maw={420}>
          <Alert color="red" role="alert" title="工作区管理无法打开">
            {denied
              ? "此工作区已不存在，或当前账号已无法访问。"
              : "暂时无法加载此工作区，请检查网络后重试。"}
          </Alert>
          <Button
            variant="default"
            onClick={() => void navigate({ to: "/workspaces" })}
          >
            返回所有工作区
          </Button>
          {!denied && (
            <Button variant="subtle" onClick={() => void workspace.refetch()}>
              重试
            </Button>
          )}
        </Stack>
      </Center>
    );
  }

  const currentWorkspace = workspace.data;
  const openExport = async () => {
    if (exportBusy || currentWorkspace.role === "viewer") return;
    setExportBusy(true);
    try {
      const list =
        items.isError || !items.data
          ? (await items.refetch()).data
          : items.data;
      if (!list) {
        notifications.show({
          message: "内容目录暂时无法加载，请重试。",
          color: "red",
        });
        return;
      }
      setExportOpened(true);
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <>
      <WorkspaceSettings
        key={workspaceId}
        workspace={currentWorkspace}
        user={session.data.user}
        returnItemId={
          typeof returnItemId === "string" &&
          items.data?.some((item) => item.id === returnItemId)
            ? returnItemId
            : undefined
        }
        onExport={() => void openExport()}
        exportBusy={exportBusy}
      />
      <Suspense fallback={null}>
        {exportOpened && currentWorkspace.role !== "viewer" && !!items.data && (
          <WorkspaceExportDialog
            workspace={currentWorkspace}
            items={items.data}
            onClose={() => setExportOpened(false)}
          />
        )}
      </Suspense>
    </>
  );
}
