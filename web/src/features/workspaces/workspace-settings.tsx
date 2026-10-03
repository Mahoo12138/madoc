import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Burger,
  Button,
  Drawer,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  useBlocker,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  Download,
  FolderCog,
  Home,
  Users,
} from "lucide-react";
import { useWorkspaceSettings } from "@/api/workspace-settings-hooks";
import { APIError, type User, type Workspace } from "@/api/types";
import { AccountMenu } from "@/features/account/account-menu";
import { MemberManagement } from "./member-management";
import { roleDescriptions, roleLabels } from "./role-labels";
import { WorkspaceActivity } from "./workspace-activity";
import { workspaceMedia } from "./workspace-layout";
import * as shell from "./workspace-shell.css";
import * as styles from "./workspace-management.css";

type Section = "workspace" | "members" | "activity";
const navigation: { id: Section; label: string; Icon: typeof FolderCog }[] = [
  { id: "workspace", label: "工作区信息", Icon: FolderCog },
  { id: "members", label: "成员管理", Icon: Users },
  { id: "activity", label: "活动记录", Icon: Activity },
];
function sectionFromHash(hash: string): Section {
  const value = hash.replace(/^#/, "");
  return value === "members" || value === "activity" ? value : "workspace";
}

function errorMessage(error: Error | null) {
  if (!error) return null;
  if (error instanceof APIError && error.code === "CSRF_INVALID")
    return "会话校验已失效，请刷新页面后重试。";
  if (error instanceof APIError && error.code === "FORBIDDEN")
    return "当前账号已无权管理此工作区，请刷新页面确认权限。";
  if (error instanceof APIError && error.status === 404)
    return "此工作区已不存在或你已无法访问，请返回工作区列表。";
  return "操作未完成，请检查网络后重试。";
}

export function WorkspaceSettings({
  workspace,
  user,
  returnItemId,
  onExport,
  exportBusy = false,
}: {
  workspace: Workspace;
  user: User;
  returnItemId?: string;
  onExport: () => void;
  exportBusy?: boolean;
}) {
  const hash = useRouterState({ select: (state) => state.location.hash });
  const [section, setSection] = useState<Section>(() => sectionFromHash(hash));
  const sectionRef = useRef(section);
  sectionRef.current = section;
  const [name, setName] = useState(workspace.name);
  const [inviteLink, setInviteLink] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [navigationOpened, navigationDrawer] = useDisclosure(false);
  const allowLeave = useRef(false);
  const { rename, remove } = useWorkspaceSettings(workspace.id);
  const navigate = useNavigate();
  const mobile = useMediaQuery(workspaceMedia.mobile, undefined, {
    getInitialValueInEffect: false,
  });
  const owner = workspace.role === "owner";
  const busy = rename.isPending || remove.isPending || memberBusy;
  const showingDeleteConfirmation = confirming && owner;
  const error = showingDeleteConfirmation ? errorMessage(remove.error) : null;
  const canRename = name.trim() !== "" && name.trim() !== workspace.name;
  const canDelete = owner && confirmation === workspace.name;
  const shouldGuardLeave =
    busy || editingName || memberDialogOpen || showingDeleteConfirmation;
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname &&
      !allowLeave.current &&
      shouldGuardLeave,
    enableBeforeUnload: shouldGuardLeave,
    withResolver: true,
  });

  const resetRename = rename.reset;
  const resetRemove = remove.reset;
  useEffect(() => {
    const requested = sectionFromHash(hash);
    const current = sectionRef.current;
    if (requested === current) return;
    if (shouldGuardLeave) {
      void navigate({
        to: "/workspace/$workspaceId/manage",
        params: { workspaceId: workspace.id },
        hash: current,
        state: true,
        replace: true,
      });
    } else setSection(requested);
  }, [hash, navigate, shouldGuardLeave, workspace.id]);
  useEffect(() => {
    const onNativeHashChange = () => {
      const requested = sectionFromHash(window.location.hash);
      const current = sectionRef.current;
      if (requested === current) return;
      if (shouldGuardLeave) {
        const url = new URL(window.location.href);
        url.hash = current;
        window.history.replaceState(window.history.state, "", url);
      } else {
        setSection(requested);
        void navigate({
          to: "/workspace/$workspaceId/manage",
          params: { workspaceId: workspace.id },
          hash: requested,
          state: true,
          replace: true,
        });
      }
    };
    window.addEventListener("hashchange", onNativeHashChange);
    return () => window.removeEventListener("hashchange", onNativeHashChange);
  }, [navigate, shouldGuardLeave, workspace.id]);
  useEffect(() => {
    if (!mobile) navigationDrawer.close();
  }, [mobile, navigationDrawer.close]);
  useEffect(() => {
    if (blocker.status === "blocked" && !shouldGuardLeave) blocker.proceed();
  }, [blocker, shouldGuardLeave]);
  useEffect(() => {
    if (!owner) {
      setEditingName(false);
      setConfirming(false);
      setConfirmation("");
      resetRename();
      resetRemove();
    }
  }, [owner, resetRename, resetRemove]);

  const goToWorkspace = () => {
    if (returnItemId) {
      void navigate({
        to: "/workspace/$workspaceId/$itemId",
        params: { workspaceId: workspace.id, itemId: returnItemId },
      });
    } else {
      void navigate({
        to: "/workspace/$workspaceId",
        params: { workspaceId: workspace.id },
      });
    }
  };
  const goToWorkspaces = () => void navigate({ to: "/workspaces" });
  const selectSection = (target: Section) => {
    if (busy || showingDeleteConfirmation || editingName || memberDialogOpen)
      return;
    setSection(target);
    void navigate({
      to: "/workspace/$workspaceId/manage",
      params: { workspaceId: workspace.id },
      hash: target,
      state: true,
      replace: true,
    });
    navigationDrawer.close();
  };
  const cancelRename = () => {
    if (busy) return;
    setName(workspace.name);
    setEditingName(false);
    rename.reset();
  };
  const sectionNavigation = (mobileNavigation = false) => (
    <nav className={styles.navigation} aria-label="工作区管理导航">
      {navigation.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`${styles.navButton} ${section === id ? styles.navButtonActive : ""}`}
          aria-current={section === id ? "page" : undefined}
          disabled={shouldGuardLeave}
          onClick={() => selectSection(id)}
        >
          <Icon size={17} aria-hidden />
          {label}
        </button>
      ))}
      {mobileNavigation && (
        <div className={styles.mobileNavigationFooter}>
          <Button
            variant="subtle"
            color="gray"
            leftSection={<ArrowLeft size={16} />}
            onClick={goToWorkspace}
            fullWidth
          >
            返回工作区
          </Button>
          <Button
            variant="subtle"
            color="gray"
            leftSection={<Home size={16} />}
            onClick={goToWorkspaces}
            fullWidth
          >
            所有工作区
          </Button>
        </div>
      )}
    </nav>
  );

  return (
    <div className={shell.shell}>
      <aside className={`${shell.sidebar} ${styles.sidebar}`}>
        <div className={shell.brandRow}>
          <div className={shell.brand}>
            <img
              src="/logo.svg"
              alt=""
              aria-hidden
              className={shell.brandMark}
            />
            madoc
          </div>
        </div>
        <button
          className={shell.workspaceButton}
          onClick={goToWorkspace}
          aria-label={`返回工作区：${workspace.name}`}
        >
          <Group gap="sm" wrap="nowrap" className={shell.workspaceIdentity}>
            <Avatar size={34} radius="md" color="blue">
              {workspace.name.slice(0, 1)}
            </Avatar>
            <div className={shell.workspaceIdentityText}>
              <Text fw={650} size="sm" truncate title={workspace.name}>
                {workspace.name}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                返回内容工作区
              </Text>
            </div>
          </Group>
          <ArrowLeft size={15} aria-hidden />
        </button>
        <div className={styles.sidebarHeading}>工作区管理</div>
        {sectionNavigation()}
        <div className={shell.sidebarBottom}>
          <Button
            variant="subtle"
            color="gray"
            className={shell.footerAction}
            leftSection={<Home size={16} />}
            onClick={goToWorkspaces}
          >
            所有工作区
          </Button>
          <AccountMenu user={user} />
        </div>
      </aside>
      <main
        className={`${shell.main} ${styles.pageMain}`}
        aria-label="工作区管理"
      >
        <header className={styles.pageHeader}>
          <Burger
            className={styles.mobileNavigationToggle}
            opened={navigationOpened}
            onClick={navigationDrawer.toggle}
            aria-label="打开工作区管理导航"
            aria-expanded={navigationOpened}
            size="sm"
          />
          <div className={styles.headerIdentity}>
            <h1 className={styles.headerTitle}>
              工作区管理 <span className={styles.headerSeparator}>/</span>{" "}
              {navigation.find((entry) => entry.id === section)?.label}
            </h1>
            <span className={styles.headerWorkspace} title={workspace.name}>
              {workspace.name}
            </span>
          </div>
          <ActionIcon
            className={styles.mobileBack}
            variant="subtle"
            color="gray"
            aria-label="返回工作区"
            onClick={goToWorkspace}
          >
            <ArrowLeft size={18} aria-hidden />
          </ActionIcon>
          <Button
            className={styles.desktopBack}
            variant="subtle"
            color="gray"
            leftSection={<ArrowLeft size={16} />}
            onClick={goToWorkspace}
          >
            返回工作区
          </Button>
        </header>
        <div
          className={styles.content}
          role="region"
          aria-label={
            showingDeleteConfirmation
              ? "删除工作区"
              : navigation.find((item) => item.id === section)?.label
          }
        >
          {section === "workspace" && (
            <div className={styles.pane}>
              {showingDeleteConfirmation ? (
                <>
                  <h2 className={styles.pageHeading}>删除工作区</h2>
                  <p className={styles.lead}>
                    将永久删除“{workspace.name}
                    ”及其全部文档、白板和成员关系。此操作无法撤销，请先确认已备份需要保留的内容。
                  </p>
                  {error && (
                    <Alert color="red" role="alert" mt="lg">
                      {error}
                    </Alert>
                  )}
                  <form
                    className={styles.section}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!canDelete || busy) return;
                      remove.mutate(undefined, {
                        onSuccess: () => {
                          allowLeave.current = true;
                          if (blocker.status === "blocked") blocker.reset();
                          void navigate({ to: "/workspaces", replace: true });
                          notifications.show({
                            message: "工作区已删除",
                            color: "blue",
                          });
                        },
                      });
                    }}
                  >
                    <TextInput
                      autoFocus
                      label="输入工作区名称以确认"
                      description={workspace.name}
                      value={confirmation}
                      onChange={(event) =>
                        setConfirmation(event.currentTarget.value)
                      }
                      disabled={busy}
                      autoComplete="off"
                    />
                    <div className={styles.formActions}>
                      <Button
                        variant="default"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(false);
                          setConfirmation("");
                          remove.reset();
                        }}
                      >
                        取消删除
                      </Button>
                      <Button
                        type="submit"
                        color="red"
                        disabled={!canDelete || busy}
                        loading={remove.isPending}
                      >
                        永久删除
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h2 className={styles.pageHeading}>{workspace.name}</h2>
                  <Badge variant="light" color="blue" mt="sm">
                    {roleLabels[workspace.role]}
                  </Badge>
                  <p className={styles.lead}>
                    {roleDescriptions[workspace.role]}
                  </p>
                  {error && (
                    <Alert color="red" role="alert" mt="lg">
                      {error}
                    </Alert>
                  )}
                  <section className={styles.section} aria-label="名称设置">
                    <div className={styles.actionRow}>
                      <div className={styles.actionText}>
                        <h3 className={styles.sectionHeading}>名称</h3>
                        <Text size="sm">{workspace.name}</Text>
                      </div>
                      {owner && (
                        <Button
                          variant="default"
                          disabled={busy}
                          onClick={() => {
                            setName(workspace.name);
                            rename.reset();
                            setEditingName(true);
                          }}
                        >
                          编辑名称
                        </Button>
                      )}
                    </div>
                  </section>
                  {workspace.role !== "viewer" && (
                    <section
                      className={styles.sectionRule}
                      aria-label="导出工作区"
                    >
                      <div className={styles.actionRow}>
                        <div className={styles.actionText}>
                          <h3 className={styles.sectionHeading}>导出</h3>
                          <Text size="sm" c="dimmed">
                            将已保存的内容和附件打包为 ZIP。
                          </Text>
                        </div>
                        <Button
                          variant="default"
                          leftSection={<Download size={16} />}
                          disabled={busy || exportBusy}
                          loading={exportBusy}
                          onClick={onExport}
                        >
                          导出工作区 ZIP
                        </Button>
                      </div>
                    </section>
                  )}
                  {owner && (
                    <section
                      className={styles.dangerRule}
                      aria-label="删除工作区"
                    >
                      <div className={styles.actionRow}>
                        <div className={styles.actionText}>
                          <h3 className={styles.sectionHeading}>删除工作区</h3>
                          <Text size="sm" c="dimmed">
                            删除后，所有成员都将无法访问其中的文档和白板。
                          </Text>
                        </div>
                        <Button
                          color="red"
                          variant="light"
                          disabled={busy}
                          onClick={() => setConfirming(true)}
                        >
                          删除工作区
                        </Button>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
          {section === "members" && (
            <MemberManagement
              workspaceId={workspace.id}
              currentRole={workspace.role}
              inviteLink={inviteLink}
              onInviteLinkChange={setInviteLink}
              onDialogStateChange={setMemberDialogOpen}
              onBusyChange={setMemberBusy}
            />
          )}
          {section === "activity" && (
            <WorkspaceActivity workspaceId={workspace.id} />
          )}
        </div>
      </main>
      <Drawer
        opened={!!mobile && navigationOpened}
        onClose={navigationDrawer.close}
        title={workspace.name}
        size="min(100vw, 360px)"
        closeButtonProps={{ "aria-label": "关闭工作区管理导航" }}
        classNames={{ body: styles.mobileDrawerBody }}
      >
        {sectionNavigation(true)}
        <AccountMenu
          user={user}
          onAction={(action) => {
            navigationDrawer.close();
            action();
          }}
        />
      </Drawer>
      <Modal
        opened={owner && editingName}
        onClose={cancelRename}
        title="编辑工作区名称"
        centered
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
        classNames={{ content: styles.dialogContent }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canRename || busy) return;
            rename.mutate(name.trim(), {
              onSuccess: () => {
                setEditingName(false);
                notifications.show({
                  message: "工作区名称已更新",
                  color: "blue",
                });
              },
            });
          }}
        >
          <TextInput
            autoFocus
            label="工作区名称"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            disabled={busy}
          />
          {rename.error && (
            <Alert color="red" role="alert" mt="md">
              {errorMessage(rename.error)}
            </Alert>
          )}
          <div className={styles.formActions}>
            <Button variant="default" onClick={cancelRename} disabled={busy}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={!canRename || busy}
              loading={rename.isPending}
            >
              保存名称
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        opened={blocker.status === "blocked"}
        onClose={() => {
          if (busy || blocker.status !== "blocked") return;
          blocker.reset();
        }}
        title={
          busy
            ? "正在保存"
            : editingName
              ? "放弃名称修改？"
              : "离开工作区管理？"
        }
        centered
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
        withCloseButton={!busy}
        classNames={{ content: styles.dialogContent }}
      >
        <Stack gap="md">
          <Text size="sm">
            {busy
              ? "请等待当前操作完成。"
              : "当前弹层或确认表单中的未保存内容将丢失。"}
          </Text>
          {!busy && (
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => {
                  if (blocker.status === "blocked") blocker.reset();
                }}
              >
                继续编辑
              </Button>
              <Button
                color="red"
                variant="light"
                onClick={() => {
                  if (blocker.status === "blocked") blocker.proceed();
                }}
              >
                放弃并离开
              </Button>
            </Group>
          )}
        </Stack>
      </Modal>
    </div>
  );
}
