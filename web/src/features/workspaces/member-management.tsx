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
import type { Role } from "@/api/types";
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
    }
  }, [owner]);

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
      notifications.show({
        message: error instanceof Error ? error.message : "操作失败，请重试",
        color: "red",
      });
    } finally {
      onBusyChange(false);
    }
  };

  const invite = async () => {
    if (!owner) return;
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
        error instanceof Error ? error.message : "邀请未创建，请重试。",
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
                              setPendingAction({
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
                              setPendingAction({
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
                              setPendingAction({
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
            if (email.includes("@") && !mutations.createInvite.isPending)
              void invite();
          }}
        >
          <div className={styles.inviteFields}>
            <TextInput
              autoFocus
              label="邀请邮箱"
              type="email"
              leftSection={<Mail size={16} />}
              placeholder="member@example.com"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <Select
              label="邀请角色"
              value={role}
              onChange={(value) =>
                setRole((value ?? "editor") as "editor" | "viewer")
              }
              data={inviteRoleOptions}
            />
          </div>
          <Text size="xs" c="dimmed" mt="xs" aria-live="polite">
            {roleDescriptions[role]}
          </Text>
          {inviteError && (
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
              disabled={!email.includes("@")}
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
