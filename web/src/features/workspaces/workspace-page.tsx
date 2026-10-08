import { workspaceMedia } from "./workspace-layout";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Avatar,
  Button,
  Center,
  Drawer,
  Group,
  Loader,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronDown as IconChevronDown,
  FileText as IconFileText,
  Home as IconHome,
  Settings as IconSettings,
  Trash2 as IconTrash,
  Search as IconSearch,
  PenTool as IconWhiteboard,
  X as IconClose,
} from "lucide-react";
import {
  useItems,
  useSession,
  useWorkspace,
  useWorkspaceMutations,
} from "@/api/hooks";
import { APIError, type Item, type ItemType } from "@/api/types";
import { CreateDocument } from "./create-document";
import { WorkspaceNavigation } from "./workspace-navigation";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceLoadNotice } from "./workspace-load-notice";
import { touchAction } from "@/styles/interaction.css";
import { shortcutModifier } from "@/features/shared/platform";
import { PanelErrorBoundary } from "@/features/shared/panel-error-boundary";
import { EmptyState } from "@/features/shared/empty-state";
import { WorkspaceFirstRun } from "@/features/shared/first-run-guide";
import {
  TITLE_MAX,
  titleLength,
  titleProblem,
} from "./item-title-rules";
import type { MarkdownOutline } from "@/features/markdown/markdown-outline-model";
import { MarkdownOutline as MarkdownOutlineView } from "@/features/markdown/markdown-outline";
import { AccountMenu } from "@/features/account/account-menu";
import { useWorkspaceEvents } from "./use-workspace-events";
import { WorkspaceSearch, useSearchShortcut } from "./workspace-search";
import { WorkspaceTrash } from "./workspace-trash";
import { ItemCommentsDrawer } from "@/features/comments/item-comments-drawer";
import { roleLabels } from "./role-labels";
import * as styles from "./workspace-shell.css";

const MarkdownEditor = lazy(() =>
  import("@/features/markdown/markdown-editor").then((module) => ({
    default: module.MarkdownEditor,
  })),
);
const WhiteboardEditor = lazy(() =>
  import("@/features/whiteboard/whiteboard-editor").then((module) => ({
    default: module.WhiteboardEditor,
  })),
);
const PortableImportDialog = lazy(() =>
  import("./portable-import-dialog").then((module) => ({
    default: module.PortableImportDialog,
  })),
);

export function WorkspacePage() {
  const params = useParams({ strict: false }) as {
    workspaceId: string;
    itemId?: string;
  };
  const { workspaceId, itemId } = params;
  const navigate = useNavigate();
  const session = useSession();
  const workspace = useWorkspace(workspaceId);
  const items = useItems(workspaceId);
  const realtimeUnavailable = useWorkspaceEvents(
    workspaceId,
    session.data?.user?.id,
  );
  const permissionError = [workspace.error, items.error].find(
    (error) =>
      error instanceof APIError && [401, 403, 404].includes(error.status),
  );
  const unavailable = realtimeUnavailable || !!permissionError;
  const readError = permissionError ?? workspace.error ?? items.error;
  const readProblem = !!readError || realtimeUnavailable;
  const retained = useRef<Item>();
  const currentItem = items.data?.find((item) => item.id === itemId);
  if (currentItem) retained.current = currentItem;
  else if (
    retained.current?.id !== itemId ||
    retained.current?.workspaceId !== workspaceId
  )
    retained.current = undefined;
  const missing =
    unavailable ||
    (items.data !== undefined && !!retained.current && !currentItem);

  const mutations = useWorkspaceMutations(workspaceId);
  const [commentsOpened, commentsDrawer] = useDisclosure(false);
  const [searchOpened, searchModal] = useDisclosure(false);
  useSearchShortcut(searchModal.open, !unavailable);
  useEffect(() => {
    searchModal.close();
  }, [workspaceId, itemId, searchModal.close]);
  const [trashOpened, trashModal] = useDisclosure(false);
  const [importPreviewOpened, setImportPreviewOpened] = useState(false);
  const [itemModal, itemActions] = useDisclosure(false);
  const [documentParent, setDocumentParent] = useState<{
    parentId: string | null;
  }>();
  const [mobileOpened, mobileDrawer] = useDisclosure(false);
  const [navigationPanel, setNavigationPanel] = useState("files");
  const mobile = useMediaQuery(workspaceMedia.mobile, undefined, {
    getInitialValueInEffect: false,
  });
  const compactNavigation = useMediaQuery(workspaceMedia.compact, undefined, {
    getInitialValueInEffect: false,
  });
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>(
    {},
  );
  const [personalSection, setPersonalSection] = useState<
    "favorites" | "recent"
  >("favorites");
  useEffect(() => {
    if (!mobile) mobileDrawer.close();
  }, [mobile, mobileDrawer.close]);
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [versionsRequest, setVersionsRequest] = useState<{
    itemId: string;
    sequence: number;
  }>();
  const [returnNavigationFocus, setReturnNavigationFocus] = useState(true);
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});
  const [outline, setOutline] = useState<MarkdownOutline | null>(null);
  const pendingHeading = useRef<(() => void) | null>(null);
  const [moveOpened, moveModal] = useDisclosure(false);
  const [movingItem, setMovingItem] = useState<Item>();
  const [moveParent, setMoveParent] = useState("root");
  // One in-flight guard for the whole dialog surface: rapid clicks, Enter and
  // repeated taps must not open a second request for the same draft. Declared
  // with the other hooks so the loading and signed-out early returns below do
  // not skip them.
  const [itemSaving, setItemSaving] = useState(false);
  // Validation reads against the field it belongs to; a failed request is a
  // different thing and needs its own announced region.
  const [itemFailure, setItemFailure] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [moveError, setMoveError] = useState("");
  const [draft, setDraft] = useState<{
    mode: "create" | "rename";
    type: ItemType;
    parentId: string | null;
    item?: Item;
    title: string;
  }>({ mode: "create", type: "markdown", parentId: null, title: "" });
  if (
    session.isLoading ||
    (!unavailable && (workspace.isLoading || items.isLoading))
  )
    return (
      <Center mih="100vh">
        <Stack align="center" role="status">
          <Loader aria-hidden />
          <Text>正在加载工作区…</Text>
        </Stack>
      </Center>
    );
  if (!session.data?.user) {
    void navigate({ to: "/sign-in", replace: true });
    return null;
  }
  const active = currentItem ?? retained.current;
  const canWrite =
    !unavailable && !!workspace.data && workspace.data.role !== "viewer";
  const openCreate = (type: ItemType, parentId: string | null = null) => {
    if (!canWrite) return;
    if (type === "markdown") {
      setDocumentParent({ parentId });
      return;
    }
    setDraft({ mode: "create", type, parentId, title: "" });
    itemActions.open();
  };
  const openRename = (item: Item) => {
    if (!canWrite) return;
    setDraft({
      mode: "rename",
      type: item.type,
      parentId: item.parentId,
      item,
      title: item.title,
    });
    itemActions.open();
  };
  const saveItem = async () => {
    if (itemSaving) return;
    const problem = titleProblem(draft.title);
    if (problem) {
      setItemFailure(problem);
      return;
    }
    setItemSaving(true);
    setItemFailure("");
    try {
      if (draft.mode === "rename" && draft.item)
        await mutations.renameItem.mutateAsync({
          id: draft.item.id,
          title: draft.title.trim(),
        });
      else {
        const created = await mutations.createItem.mutateAsync({
          type: draft.type,
          title: draft.title.trim(),
          parentId: draft.parentId,
        });
        if (created.type !== "folder")
          await navigate({
            to: "/workspace/$workspaceId/$itemId",
            params: { workspaceId, itemId: created.id },
          });
      }
      itemActions.close();
    } catch {
      // Keep the dialog and the draft open so the retry does not lose typing.
      setItemFailure(
        draft.mode === "rename"
          ? "重命名未完成，请检查网络后重试。"
          : "创建未完成，请检查网络后重试；若重试后出现同名条目，请先查看内容目录。",
      );
    } finally {
      setItemSaving(false);
    }
  };
  const requestDelete = (item: Item) => {
    if (!canWrite) return;
    setDeleteTarget(item);
    setDeleteError("");
  };
  const deleteItem = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await mutations.deleteItem.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      if (deleteTarget.id === itemId)
        await navigate({
          to: "/workspace/$workspaceId",
          params: { workspaceId },
        });
    } catch {
      setDeleteError("移入回收站未完成，请检查网络后重试。");
    } finally {
      setDeleting(false);
    }
  };
  const openMove = (item: Item) => {
    if (!canWrite) return;
    setMovingItem(item);
    setMoveParent(item.parentId ?? "root");
    setMoveError("");
    moveModal.open();
  };
  const moveItem = async () => {
    if (!movingItem || mutations.moveItem.isPending) return;
    const parentId = moveParent === "root" ? null : moveParent;
    const index = (items.data ?? []).filter(
      (item) => item.parentId === parentId && item.id !== movingItem.id,
    ).length;
    setMoveError("");
    try {
      await mutations.moveItem.mutateAsync({
        id: movingItem.id,
        parentId,
        index,
      });
      moveModal.close();
    } catch {
      setMoveError("移动未完成，内容位置未改变。请检查网络后重试。");
    }
  };
  const isMoveTarget = (candidate: Item) => {
    if (candidate.type !== "folder" || candidate.id === movingItem?.id)
      return false;
    let current: Item | undefined = candidate;
    while (current?.parentId) {
      if (current.parentId === movingItem?.id) return false;
      current = items.data?.find((item) => item.id === current?.parentId);
    }
    return true;
  };
  const navigationProps = {
    workspaceId,
    compact: compactNavigation,
    closedSections,
    onClosedSectionsChange: setClosedSections,
    personalSection,
    onPersonalSectionChange: setPersonalSection,
    items: items.data ?? [],
    activeId: itemId,
    active,
    role: unavailable
      ? ("viewer" as const)
      : (workspace.data?.role ?? ("viewer" as const)),
    onPreviewImport: () => {
      mobileDrawer.close();
      setImportPreviewOpened(true);
    },
    onCreate: openCreate,
    onRename: openRename,
    onMove: openMove,
    onDelete: requestDelete,
    collapsed: collapsedFolders,
    onCollapsedChange: setCollapsedFolders,
    panel: navigationPanel,
    onPanelChange: setNavigationPanel,
    outline,
  };
  const revealOutline = () => {
    setOutlineVisible(true);
    setNavigationPanel("outline");
    if (window.matchMedia(workspaceMedia.mobile).matches) {
      setReturnNavigationFocus(true);
      mobileDrawer.open();
    }
  };
  const openManagement = () => {
    void navigate({
      to: "/workspace/$workspaceId/manage",
      params: { workspaceId },
      hash: "workspace",
      state: (previous) => ({
        ...previous,
        madocManagementReturnItemId: itemId ?? null,
      }),
    });
  };
  return (
    <div
      className={`${styles.shell} ${active?.type === "markdown" && outlineVisible ? styles.shellWithOutline : ""}`}
    >
      {!mobile && (
        <aside className={styles.sidebar}>
          <div className={styles.brandRow}>
            <div className={styles.brand}>
              <img
                src="/logo.svg"
                alt=""
                aria-hidden
                className={styles.brandMark}
              />
              Madoc
            </div>
          </div>
          <Menu width={250}>
            <Menu.Target>
              <button
                className={styles.workspaceButton}
                aria-label="工作区菜单"
              >
                <Group
                  gap="sm"
                  wrap="nowrap"
                  className={styles.workspaceIdentity}
                >
                  <Avatar size={34} radius="md" color="blue">
                    {workspace.data?.name.slice(0, 1)}
                  </Avatar>
                  <div className={styles.workspaceIdentityText}>
                    <Text
                      fw={650}
                      size="sm"
                      truncate
                      title={workspace.data?.name}
                    >
                      {workspace.data?.name}
                    </Text>
                    <Text
                      size="xs"
                      c="dimmed"
                      truncate
                      title={workspace.data?.description || "未设置介绍"}
                    >
                      {workspace.data?.description || "未设置介绍"}
                    </Text>
                  </div>
                </Group>
                <IconChevronDown size={14} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconHome size={15} />}
                onClick={() => navigate({ to: "/workspaces" })}
              >
                所有工作区
              </Menu.Item>
              {!unavailable && workspace.data && (
                <Menu.Item
                  leftSection={<IconSettings size={15} />}
                  onClick={openManagement}
                >
                  管理
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
          <Button
            variant="default"
            className={styles.sidebarSearch}
            leftSection={<IconSearch size={16} />}
            onClick={searchModal.open}
            disabled={unavailable}
            rightSection={
              <kbd className={styles.shortcutKey}>
                {shortcutModifier()} K
              </kbd>
            }
          >
            搜索文档、页面内容…
          </Button>
          <div className={styles.sidebarScroll}>
            <WorkspaceNavigation
              {...navigationProps}
              onNavigateHeading={(position) => outline?.navigate(position)}
            />
          </div>
          <div className={styles.sidebarBottom}>
            {!unavailable && workspace.data?.role !== "viewer" && (
              <Button
                variant="subtle"
                color="gray"
                className={styles.footerAction}
                leftSection={<IconTrash size={16} />}
                onClick={trashModal.open}
              >
                回收站
              </Button>
            )}
            <AccountMenu user={session.data.user} />
          </div>
        </aside>
      )}
      <main className={styles.main}>
        <WorkspaceHeader
          workspaceName={workspace.data?.name}
          role={workspace.data?.role}
          active={active}
          unavailable={unavailable}
          missing={missing}
          outlineVisible={outlineVisible}
          navigationOpened={mobileOpened}
          actions={{
            search: searchModal.open,
            versions: () => {
              if (active)
                setVersionsRequest((value) => ({
                  itemId: active.id,
                  sequence: (value?.sequence ?? 0) + 1,
                }));
            },
            comments: commentsDrawer.open,
            rename: () => {
              if (active) openRename(active);
            },
            outline: revealOutline,
            settings: openManagement,
            trash: trashModal.open,
            workspaces: () => {
              void navigate({ to: "/workspaces" });
            },
            navigation: () => {
              setReturnNavigationFocus(true);
              mobileDrawer.toggle();
            },
          }}
        />
        <section className={styles.content}>
          {readProblem && (
            <WorkspaceLoadNotice
              resource={workspace.error ? "工作区" : "内容目录"}
              error={readError}
              unavailable={unavailable}
              cached={!!active && !!workspace.data}
              pending={workspace.isFetching || items.isFetching}
              onRetry={() => {
                if (workspace.error) void workspace.refetch();
                if (items.error) void items.refetch();
              }}
            />
          )}
          {!readProblem && items.isSuccess && itemId && !active && (
            <Alert color="orange" role="alert">
              无法打开此链接：内容可能已删除，或当前账号没有访问权限。请从内容导航选择其他条目。
            </Alert>
          )}
          {!readProblem && missing && active && (
            <Alert color="orange" role="alert">
              此内容已删除或访问权限已变更。已停止保存，请保留本地副本；可从内容树选择其他条目。
            </Alert>
          )}
          {!active || !workspace.data ? (
            !readProblem && (
              <div className={styles.empty}>
                {itemId ? (
                  <EmptyState
                    icon={IconFileText}
                    title="内容暂不可用"
                    description="此内容可能已被移入回收站，或当前账号没有访问权限。从内容目录选择其他条目即可继续。"
                    actions={
                      <Button
                        variant="default"
                        leftSection={<IconFileText size={16} />}
                        onClick={() =>
                          navigate({
                            to: "/workspace/$workspaceId",
                            params: { workspaceId },
                          })
                        }
                      >
                        返回内容目录
                      </Button>
                    }
                  />
                ) : canWrite ? (
                  <>
                    <EmptyState
                      size="page"
                      flush
                      icon={IconFileText}
                      title="从一个文档或白板开始"
                      description="内容树是这个工作区的唯一结构来源，文档和白板都从它进入。文档适合记录与协作，白板适合推演与梳理。"
                      actions={
                        <Button
                          leftSection={<IconFileText size={16} />}
                          onClick={() => openCreate("markdown")}
                        >
                          新建文档
                        </Button>
                      }
                      secondaryActions={
                        <Button
                          variant="default"
                          leftSection={<IconWhiteboard size={16} />}
                          onClick={() => openCreate("whiteboard")}
                        >
                          新建白板
                        </Button>
                      }
                    />
                    {/* Empty of items only: once something exists the note would
                        just be noise beside real content. */}
                    {items.data?.length === 0 && <WorkspaceFirstRun />}
                  </>
                ) : (
                  <EmptyState
                    icon={IconFileText}
                    title="这个工作区还没有内容"
                    note={`当前角色为${
                      workspace.data ? roleLabels[workspace.data.role] : "访客"
                    }，可浏览全部内容，但不能创建或修改条目。`}
                  />
                )}
              </div>
            )
          ) : (
            <PanelErrorBoundary label="编辑器">
              <Suspense
                fallback={
                  <Center mih="60vh">
                    <Stack align="center" role="status">
                      <Loader aria-hidden />
                      <Text>正在加载内容…</Text>
                    </Stack>
                  </Center>
                }
              >
                {active.type === "markdown" ? (
                  <MarkdownEditor
                    key={active.id}
                    item={active}
                    role={missing ? "viewer" : workspace.data!.role}
                    user={session.data.user}
                    onOutlineChange={setOutline}
                    versionsRequest={versionsRequest?.sequence}
                    versionsRequestItemId={versionsRequest?.itemId}
                  />
                ) : active.type === "whiteboard" ? (
                  <WhiteboardEditor
                    key={`${session.data.user.id}:${active.id}`}
                    item={active}
                    role={missing ? "viewer" : workspace.data!.role}
                    user={session.data.user}
                  />
                ) : null}
              </Suspense>
            </PanelErrorBoundary>
          )}
        </section>
      </main>
      {!compactNavigation && active?.type === "markdown" && outlineVisible && (
        <aside className={styles.outlinePanel} aria-label="文档大纲面板">
          <MarkdownOutlineView
            title={active.title}
            outline={outline?.itemId === active.id ? outline : null}
            onNavigate={(position) => outline?.navigate(position)}
            onClose={() => setOutlineVisible(false)}
            showTitle={false}
          />
        </aside>
      )}
      <Drawer
        opened={mobile && mobileOpened}
        onClose={mobileDrawer.close}
        title={workspace.data?.name}
        size="min(100vw, 360px)"
        closeButtonProps={{
          "aria-label": "关闭内容导航",
          className: touchAction,
        }}
        returnFocus={returnNavigationFocus}
        onExitTransitionEnd={() => {
          pendingHeading.current?.();
          pendingHeading.current = null;
        }}
      >
        {mobile && (
          <WorkspaceNavigation
            {...navigationProps}
            onSelect={mobileDrawer.close}
            onNavigateHeading={(position) => {
              setReturnNavigationFocus(false);
              pendingHeading.current = () => outline?.navigate(position);
              mobileDrawer.close();
            }}
          />
        )}
        <AccountMenu
          user={session.data.user}
          onAction={(action) => {
            setReturnNavigationFocus(false);
            pendingHeading.current = action;
            mobileDrawer.close();
          }}
        />
      </Drawer>
      {trashOpened &&
        !unavailable &&
        workspace.data &&
        workspace.data.role !== "viewer" && (
          <WorkspaceTrash
            key={`trash:${workspaceId}`}
            workspace={workspace.data}
            onClose={trashModal.close}
          />
        )}
      {!unavailable && (
        <WorkspaceSearch
          key={`search:${workspaceId}`}
          workspaceId={workspaceId}
          opened={searchOpened}
          onClose={searchModal.close}
          onSelect={async (id, type) => {
            if (type === "folder") {
              searchModal.close();
              const expanded: Record<string, boolean> = {};
              let node = items.data?.find((item) => item.id === id);
              while (node && !(node.id in expanded)) {
                expanded[node.id] = false;
                node = items.data?.find((item) => item.id === node?.parentId);
              }
              setCollapsedFolders((previous) => ({ ...previous, ...expanded }));
              setNavigationPanel("files");
              if (window.matchMedia(workspaceMedia.mobile).matches)
                mobileDrawer.open();
              return;
            }
            await navigate({
              to: "/workspace/$workspaceId/$itemId",
              params: { workspaceId, itemId: id },
            });
            searchModal.close();
          }}
        />
      )}
      {commentsOpened && active && !missing && (
        <ItemCommentsDrawer
          item={active}
          role={workspace.data?.role ?? "viewer"}
          opened
          onClose={commentsDrawer.close}
        />
      )}
      <PanelErrorBoundary label="内容包导入">
        <Suspense fallback={null}>
          {importPreviewOpened && (
            <PortableImportDialog
              key={`import:${workspaceId}`}
              workspaceId={workspaceId}
              canWrite={canWrite}
              onClose={() => setImportPreviewOpened(false)}
            />
          )}
        </Suspense>
      </PanelErrorBoundary>
      {documentParent && canWrite && (
        <CreateDocument
          workspaceId={workspaceId}
          parentId={documentParent.parentId}
          onClose={() => setDocumentParent(undefined)}
          onCreated={mobileDrawer.close}
        />
      )}
      <Modal
        opened={itemModal}
        onClose={() => {
          if (itemSaving) return;
          itemActions.close();
        }}
        title={
          draft.mode === "rename"
            ? "重命名"
            : `新建${draft.type === "markdown" ? "文档" : draft.type === "whiteboard" ? "白板" : "文件夹"}`
        }
        closeOnClickOutside={!itemSaving}
        closeOnEscape={!itemSaving}
        withCloseButton={!itemSaving}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveItem();
          }}
        >
          <Stack>
            <TextInput
              autoFocus
              label="名称"
              value={draft.title}
              onChange={(e) => {
                const title = e.currentTarget.value;
                setDraft((v) => ({ ...v, title }));
                if (itemFailure && !titleProblem(title)) setItemFailure("");
              }}
              onKeyDown={(e) => {
                // Enter confirms a candidate word while an IME is composing;
                // submitting there would save a half-finished title.
                if (e.key === "Enter" && !e.nativeEvent.isComposing)
                  void saveItem();
              }}
              disabled={itemSaving}
              error={titleProblem(draft.title) ?? undefined}
              description={`最多 ${TITLE_MAX} 个字符，当前 ${titleLength(draft.title)} 个`}
            />
            {/* Validation rides the field; a failed request is announced here. */}
            {itemFailure && !titleProblem(draft.title) && (
              <Alert color="red" role="alert">
                {itemFailure}
              </Alert>
            )}
            <div>
              <Button
                type="submit"
                loading={itemSaving}
                disabled={itemSaving || !draft.title.trim()}
              >
                保存
              </Button>
            </div>
          </Stack>
        </form>
      </Modal>
      <Modal
        opened={deleteTarget !== null}
        onClose={() => {
          if (deleting) return;
          setDeleteTarget(null);
          setDeleteError("");
        }}
        title="移入回收站"
        centered
        closeOnClickOutside={!deleting}
        closeOnEscape={!deleting}
        withCloseButton={!deleting}
      >
        <Stack>
          <Text size="sm">
            将“{deleteTarget?.title}”
            {deleteTarget?.type === "folder"
              ? "及其包含的全部内容"
              : ""}
            移入回收站？之后可以从侧栏的回收站恢复。
          </Text>
          {deleteError && (
            <Alert color="red" role="alert">
              {deleteError}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={deleting}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError("");
              }}
            >
              取消
            </Button>
            <Button
              color="red"
              loading={deleting}
              onClick={() => void deleteItem()}
            >
              移入回收站
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={moveOpened}
        onClose={moveModal.close}
        title={`移动“${movingItem?.title ?? ""}”`}
        closeOnClickOutside={!mutations.moveItem.isPending}
        closeOnEscape={!mutations.moveItem.isPending}
        withCloseButton={!mutations.moveItem.isPending}
      >
        <Stack>
          <Select
            label="目标位置"
            value={moveParent}
            onChange={(value) => {
              setMoveParent(value ?? "root");
              if (moveError) setMoveError("");
            }}
            data={[
              { value: "root", label: "工作区根目录" },
              ...(items.data ?? [])
                .filter(isMoveTarget)
                .map((item) => ({ value: item.id, label: item.title })),
            ]}
            searchable
            disabled={mutations.moveItem.isPending}
            error={moveError || undefined}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={moveModal.close}>
              取消
            </Button>
            <Button
              onClick={() => void moveItem()}
              loading={mutations.moveItem.isPending}
            >
              移动
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
