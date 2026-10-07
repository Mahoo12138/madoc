import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  CopyButton,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Check, Copy, Mail, Trash2 } from "lucide-react";
import {
  useInvites,
  useMembers,
  useSession,
  useWorkspaceMutations,
} from "@/api/hooks";
import { APIError, type Role } from "@/api/types";
import { inviteStatusLabel, roleDescriptions, roleLabels } from "./role-labels";
import * as styles from "./workspace-management.css";

const memberRoleOptions = (["owner", "editor", "viewer"] as const).map(
  (value) => ({
    value,
    label: roleLabels[value],
  }),
);
const inviteRoleOptions = (["editor", "viewer"] as const).map((value) => ({
  value,
  label: roleLabels[value],
}));

type PendingAction =
  | { kind: "role"; userId: string; name: string; role: Role }
  | { kind: "remove"; userId: string; name: string }
  | { kind: "revoke"; inviteId: string; email: string };

/**
 * `includes('@')` accepted "a@" and "@ " and let the server reject them. Parse
 * the address instead so the dialog can explain the problem before submitting.
 */
function inviteEmailProblem(value: string): string | null {
  const email = value.trim();
  if (!email) return '请填写邀请邮箱';
  if (/\s/.test(email)) return '邮箱不能包含空格';
  const parts = email.split('@');
  if (parts.length !== 2) return '请输入完整的邮箱地址，例如 name@example.com';
  const [local, domain] = parts;
  if (!local || !domain) return '请输入完整的邮箱地址，例如 name@example.com';
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.'))
    return '域名部分需要包含点号，例如 example.com';
  if (Array.from(email).length > 254) return '邮箱地址过长';
  return null;
}

/** Server errors are English identifiers; the surface speaks product language. */
function memberErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof APIError) {
    if (error.status === 401) return '登录已失效，请重新登录后重试。';
    if (error.status === 403)
      return '你的管理权限已被移除，请联系工作区所有者。';
    if (error.status === 404) return '此成员或邀请已不存在，请刷新后重试。';
    if (error.status === 429) return '操作过于频繁，请稍后重试。';
    if (error.code === 'CSRF_INVALID')
      return '会话校验已失效，请刷新页面后重试。';
    if (error.code === 'LAST_OWNER')
      return '工作区需要至少保留一名所有者，请先调整其他成员。';
    if (error.code === 'EMAIL_TAKEN' || error.code === 'ALREADY_MEMBER')
      return '该邮箱已是工作区成员。';
    if (error.code === 'INVITE_EXISTS')
      return '该邮箱已有一条待接受邀请，可先撤销再重新创建。';
  }
  return fallback;
}

export function MemberManagement({
  workspaceId,
  currentRole,
  inviteLink,
  onInviteLinkChange,
  onDialogStateChange,
  onBusyChange,
}: {
  workspaceId: string;
  currentRole: Role;
  inviteLink: string;
  onInviteLinkChange: (link: string) => void;
  onDialogStateChange: (open: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const owner = currentRole === "owner";
  const members = useMembers(workspaceId);
  const invites = useInvites(workspaceId, owner);
  const session = useSession();
  const mutations = useWorkspaceMutations(workspaceId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [inviteError, setInviteError] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [actionError, setActionError] = useState("");
  const actionBusy =
    mutations.updateMember.isPending ||
    mutations.removeMember.isPending ||
    mutations.revokeInvite.isPending;
  const memberBusy = actionBusy || mutations.createInvite.isPending;

  useEffect(() => {
    onDialogStateChange(creatingInvite || pendingAction !== null);
  }, [creatingInvite, pendingAction, onDialogStateChange]);
  useEffect(() => () => onDialogStateChange(false), [onDialogStateChange]);
  useEffect(() => onBusyChange(memberBusy), [memberBusy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  useEffect(() => {
    if (!owner) {
      setCreatingInvite(false);
      setEditingRole(null);
      setPendingAction(null);
      setInviteError("");
      setActionError("");
    }
  }, [owner]);

  const beginAction = (action: PendingAction) => {
    setActionError("");
    setPendingAction(action);
  };

  const confirmAction = async () => {
    if (!owner || !pendingAction || actionBusy) return;
    onBusyChange(true);
    try {
      if (pendingAction.kind === "role") {
        await mutations.updateMember.mutateAsync({
          userId: pendingAction.userId,
          role: pendingAction.role,
        });
        notifications.show({ message: "成员角色已更新", color: "blue" });
      } else if (pendingAction.kind === "remove") {
        await mutations.removeMember.mutateAsync(pendingAction.userId);
        notifications.show({ message: "成员已移除", color: "blue" });
      } else {
        await mutations.revokeInvite.mutateAsync(pendingAction.inviteId);
        notifications.show({ message: "邀请已撤销", color: "blue" });
      }
      setPendingAction(null);
    } catch (error) {
      // The dialog stays open so the user can retry without re-picking.
      setActionError(
        memberErrorMessage(
          error,
          pendingAction.kind === "revoke"
            ? "邀请未能撤销，请检查网络后重试。"
            : "操作未完成，请检查网络后重试。",
        ),
      );
    } finally {
      onBusyChange(false);
    }
  };

  const invite = async () => {
    if (!owner) return;
    const problem = inviteEmailProblem(email);
    if (problem) {
      setInviteError(problem);
      return;
    }
    setInviteError("");
    onBusyChange(true);
    try {
      const result = await mutations.createInvite.mutateAsync({
        email: email.trim(),
        role,
      });
      onInviteLinkChange(`${location.origin}${result.url}`);
      setEmail("");
      setCreatingInvite(false);
      notifications.show({ message: "邀请链接已创建", color: "blue" });
    } catch (error) {
      setInviteError(
        memberErrorMessage(error, "邀请未创建，请检查网络后重试。"),
      );
    } finally {
      onBusyChange(false);
    }
  };
  const cancelInvite = () => {
    if (mutations.createInvite.isPending) return;
    setCreatingInvite(false);
    setEmail("");
    setRole("editor");
    setInviteError("");
  };

  const ownerCount =
    members.data?.filter((entry) => entry.role === "owner").length ?? 0;

  return (
    <div className={styles.pane}>
      <h2 className={styles.pageHeading}>成员管理</h2>
      <p className={styles.lead}>
        查看工作区成员及其角色。只有所有者可以调整权限和邀请新成员。
      </p>
      <Tabs variant="outline" defaultValue="members" mt="lg">
        <Tabs.List>
          <Tabs.Tab value="members">成员</Tabs.Tab>
          {owner && <Tabs.Tab value="invites">邀请</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="members">
          {members.isPending && (
            <Group justify="center" py="xl">
              <Loader size="sm" aria-label="加载成员" />
            </Group>
          )}
          {members.isError && (
            <Alert color="red" mt="lg" title="成员列表无法加载">
              <Button
                variant="subtle"
                size="compact-sm"
                onClick={() => void members.refetch()}
              >
                重试
              </Button>
            </Alert>
          )}
          {!members.isPending &&
            !members.isError &&
            members.data?.length === 0 && (
              <Text c="dimmed" className={styles.emptyState}>
                当前没有成员。
              </Text>
            )}
          {!members.isError && !!members.data?.length && (
            <div className={styles.list}>
              {members.data.map((member) => {
                const self = member.userId === session.data?.user?.id;
                const lastOwner = member.role === "owner" && ownerCount <= 1;
                return (
                  <Paper
                    key={member.userId}
                    role="group"
                    aria-label={`成员：${member.name}`}
                    className={styles.listCard}
                  >
                    <div className={styles.memberRow}>
                      <div className={styles.memberIdentity}>
                        <Avatar
                          src={member.avatarUrl}
                          radius="xl"
                          color="blue"
                          size={38}
                          className={styles.memberAvatar}
                        >
                          {member.name.slice(0, 1)}
                        </Avatar>
                        <div className={styles.memberMeta}>
                          <Text fw={600} truncate title={member.name}>
                            {member.name}
                            {self && (
                              <Text span size="xs" c="dimmed">
                                （你）
                              </Text>
                            )}
                          </Text>
                          <Text
                            size="xs"
                            c="dimmed"
                            truncate
                            title={member.email}
                          >
                            {member.email}
                          </Text>
                        </div>
                      </div>
                      <div className={styles.memberActions}>
                        {editingRole === member.userId ? (
                          <Select
                            aria-label={`${member.name} 的角色`}
                            size="sm"
                            w={120}
                            value={member.role}
                            data={memberRoleOptions}
                            disabled={actionBusy}
                            onChange={(value) => {
                              if (!value || value === member.role) return;
                              setEditingRole(null);
                              beginAction({
                                kind: "role",
                                userId: member.userId,
                                name: member.name,
                                role: value as Role,
                              });
                            }}
                          />
                        ) : (
                          <Text size="sm">{roleLabels[member.role]}</Text>
                        )}
                        {owner && !self && !lastOwner && (
                          <Button
                            size="xs"
                            variant="subtle"
                            disabled={actionBusy}
                            onClick={() =>
                              setEditingRole(
                                editingRole === member.userId
                                  ? null
                                  : member.userId,
                              )
                            }
                          >
                            {editingRole === member.userId
                              ? "取消"
                              : "编辑角色"}
                          </Button>
                        )}
                        {owner && (
                          <ActionIcon
                            size="lg"
                            color="red"
                            aria-label={`移除 ${member.name}`}
                            disabled={self || lastOwner}
                            onClick={() =>
                              beginAction({
                                kind: "remove",
                                userId: member.userId,
                                name: member.name,
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </ActionIcon>
                        )}
                      </div>
                    </div>
                    {owner && self && (
                      <Text size="xs" c="dimmed" mt="xs">
                        你不能更改或移除自己的角色。
                      </Text>
                    )}
                    {owner && !self && lastOwner && (
                      <Text size="xs" c="dimmed" mt="xs">
                        {member.role === "owner"
                          ? "这是工作区最后一名所有者，不能移除或降级。请先指定另一名所有者。"
                          : "工作区需要至少保留一名所有者。"}
                      </Text>
                    )}
                  </Paper>
                );
              })}
            </div>
          )}
        </Tabs.Panel>
        {owner && (
          <Tabs.Panel value="invites">
            <div className={styles.inviteForm}>
              <h3 className={styles.sectionHeading}>创建邀请链接</h3>
              <Button variant="default" onClick={() => setCreatingInvite(true)}>
                创建邀请
              </Button>
              {inviteLink && (
                <>
                  <div className={styles.inviteLink}>
                    <TextInput
                      aria-label="邀请链接"
                      value={inviteLink}
                      readOnly
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <CopyButton value={inviteLink}>
                      {({ copied, copy }) => (
                        <Button
                          variant="light"
                          onClick={copy}
                          aria-label={
                            copied ? "邀请链接已复制" : "复制邀请链接"
                          }
                          leftSection={
                            copied ? <Check size={16} /> : <Copy size={16} />
                          }
                        >
                          {copied ? "已复制" : "复制"}
                        </Button>
                      )}
                    </CopyButton>
                  </div>
                  <Text size="xs" c="dimmed" mt="xs">
                    邀请链接只在创建后显示，请先复制保存。
                  </Text>
                </>
              )}
            </div>
            {invites.isPending && (
              <Group justify="center" py="xl">
                <Loader size="sm" aria-label="加载邀请" />
              </Group>
            )}
            {invites.isError && (
              <Alert color="red" mt="lg" title="邀请列表无法加载">
                <Button
                  variant="subtle"
                  size="compact-sm"
                  onClick={() => void invites.refetch()}
                >
                  重试
                </Button>
              </Alert>
            )}
            {!invites.isPending &&
              !invites.isError &&
              invites.data?.length === 0 && (
                <Text c="dimmed" className={styles.emptyState}>
                  还没有邀请。填写邮箱以创建邀请链接。
                </Text>
              )}
            {!invites.isError && !!invites.data?.length && (
              <div className={styles.list}>
                {invites.data.map((item) => (
                  <Paper
                    key={item.id}
                    role="group"
                    aria-label={`邀请：${item.email}`}
                    className={styles.listCard}
                  >
                    <div className={styles.statusLine}>
                      <div className={styles.memberMeta}>
                        <Text size="sm" fw={600} truncate title={item.email}>
                          {item.email}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {roleLabels[item.role]}
                        </Text>
                      </div>
                      <Group gap="xs" wrap="nowrap">
                        <Badge
                          variant="light"
                          color={item.status === "pending" ? "blue" : "gray"}
                        >
                          {inviteStatusLabel(item.status)}
                        </Badge>
                        {item.status === "pending" && (
                          <Button
                            size="compact-sm"
                            color="red"
                            variant="subtle"
                            onClick={() =>
                              beginAction({
                                kind: "revoke",
                                inviteId: item.id,
                                email: item.email,
                              })
                            }
                          >
                            撤销
                          </Button>
                        )}
                      </Group>
                    </div>
                  </Paper>
                ))}
              </div>
            )}
          </Tabs.Panel>
        )}
      </Tabs>
      <Modal
        opened={owner && creatingInvite}
        onClose={cancelInvite}
        title="创建邀请"
        centered
        closeOnClickOutside={!mutations.createInvite.isPending}
        closeOnEscape={!mutations.createInvite.isPending}
        withCloseButton={!mutations.createInvite.isPending}
        classNames={{ content: styles.dialogContent }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!mutations.createInvite.isPending) void invite();
          }}
        >
          <div className={styles.inviteFields}>
            <TextInput
              autoFocus
              label="邀请邮箱"
              type="email"
              leftSection={<Mail size={16} />}
              placeholder="name@example.com"
              value={email}
              disabled={mutations.createInvite.isPending}
              onChange={(event) => {
                setEmail(event.currentTarget.value);
                if (inviteError) setInviteError("");
              }}
              onKeyDown={(event) => {
                // Enter confirms an IME candidate in Chinese input methods.
                if (event.key === "Enter" && event.nativeEvent.isComposing)
                  event.preventDefault();
              }}
              error={
                email.trim() ? (inviteEmailProblem(email) ?? undefined) : undefined
              }
            />
            <Select
              label="邀请角色"
              value={role}
              onChange={(value) =>
                setRole((value ?? "editor") as "editor" | "viewer")
              }
              data={inviteRoleOptions}
              disabled={mutations.createInvite.isPending}
            />
          </div>
          <Text size="xs" c="dimmed" mt="xs" aria-live="polite">
            {roleDescriptions[role]}
          </Text>
          {inviteError && email.trim() && !inviteEmailProblem(email) && (
            <Alert color="red" role="alert" mt="sm">
              {inviteError}
            </Alert>
          )}
          <div className={styles.formActions}>
            <Button
              variant="default"
              disabled={mutations.createInvite.isPending}
              onClick={cancelInvite}
            >
              取消
            </Button>
            <Button
              type="submit"
              loading={mutations.createInvite.isPending}
              disabled={!!inviteEmailProblem(email)}
            >
              创建链接
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        opened={owner && pendingAction !== null}
        onClose={() => {
          if (!actionBusy) setPendingAction(null);
        }}
        title={
          pendingAction?.kind === "role"
            ? "确认调整角色"
            : pendingAction?.kind === "remove"
              ? "确认移除成员"
              : "确认撤销邀请"
        }
        closeOnClickOutside={!actionBusy}
        closeOnEscape={!actionBusy}
        centered
        classNames={{ content: styles.dialogContent }}
      >
        <Text>
          {pendingAction?.kind === "role" && (
            <>
              将 <b>{pendingAction.name}</b> 的角色调整为
              <b>{roleLabels[pendingAction.role]}</b>？角色变更会立即生效。
            </>
          )}
          {pendingAction?.kind === "remove" && (
            <>
              移除 <b>{pendingAction.name}</b>{" "}
              后，对方将立即失去此工作区访问权限。
            </>
          )}
          {pendingAction?.kind === "revoke" && (
            <>
              撤销发给 <b>{pendingAction.email}</b>{" "}
              的待处理邀请后，原邀请链接将立即失效。
            </>
          )}
        </Text>
        {actionError && (
          <Alert color="red" role="alert" mt="md">
            {actionError}
          </Alert>
        )}
        <Group justify="flex-end" mt="lg">
          <Button
            variant="default"
            disabled={actionBusy}
            onClick={() => setPendingAction(null)}
          >
            取消
          </Button>
          <Button
            color={pendingAction?.kind === "role" ? "blue" : "red"}
            loading={actionBusy}
            onClick={() => void confirmAction()}
          >
            {pendingAction?.kind === "role"
              ? "确认调整"
              : pendingAction?.kind === "remove"
                ? "移除成员"
                : "撤销邀请"}
          </Button>
        </Group>
      </Modal>
    </div>
  );
}
