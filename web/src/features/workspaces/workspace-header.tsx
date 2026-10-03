import { useRef } from "react";
import { ActionIcon, Burger, Menu, Text, Tooltip } from "@mantine/core";
import {
  Ellipsis,
  FileText,
  History,
  Home,
  ListTree,
  MessageSquare,
  Pencil,
  PenTool,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import type { Item, Role } from "@/api/types";
import * as styles from "./workspace-header.css";

type Actions = {
  search: () => void;
  versions: () => void;
  comments: () => void;
  rename: () => void;
  outline: () => void;
  settings: () => void;
  trash: () => void;
  workspaces: () => void;
  navigation: () => void;
};

export function WorkspaceHeader({
  workspaceName,
  role,
  active,
  unavailable,
  missing,
  outlineVisible,
  navigationOpened,
  actions,
}: {
  workspaceName?: string;
  role?: Role;
  active?: Item;
  unavailable: boolean;
  missing: boolean;
  outlineVisible: boolean;
  navigationOpened: boolean;
  actions: Actions;
}) {
  const menuTarget = useRef<HTMLButtonElement>(null);
  const canWrite = !unavailable && !!role && role !== "viewer";
  const isMarkdown = active?.type === "markdown";
  const canOpenVersions = isMarkdown && !missing;
  const canComment = !!active && !missing;
  const canRename = !!active && canWrite && !missing;
  const runMenuAction = (action: () => void) => {
    // A dialog opened from a transient menu should return to its stable trigger.
    menuTarget.current?.focus();
    action();
  };
  const itemActions = [
    {
      label: "版本与分享",
      Icon: History,
      run: actions.versions,
      show: canOpenVersions,
    },
    {
      label: "文档评论",
      Icon: MessageSquare,
      run: actions.comments,
      show: canComment,
    },
    {
      label: "重命名",
      Icon: Pencil,
      run: actions.rename,
      show: canRename,
    },
  ].filter((action) => action.show);
  return (
    <header className={styles.header} aria-label="工作区工具栏">
      <Burger
        className={styles.navigationToggle}
        size="sm"
        opened={navigationOpened}
        onClick={actions.navigation}
        aria-label="打开内容导航"
        aria-expanded={navigationOpened}
      />
      <div className={styles.identity}>
        {active &&
          (active.type === "whiteboard" ? (
            <PenTool size={16} className={styles.typeIcon} aria-hidden />
          ) : (
            <FileText size={16} className={styles.typeIcon} aria-hidden />
          ))}
        <div className={styles.names}>
          <Text
            size="sm"
            truncate
            title={workspaceName}
            className={styles.workspaceName}
          >
            {workspaceName}
          </Text>
          {active && (
            <>
              <span className={styles.separator} aria-hidden>
                /
              </span>
              <Text
                size="sm"
                fw={600}
                truncate
                title={active.title}
                className={styles.itemName}
              >
                {active.title}
              </Text>
            </>
          )}
        </div>
      </div>
      <div className={styles.desktopActions}>
        {canOpenVersions && (
          <Tooltip label="版本与分享">
            <ActionIcon
              variant="light"
              color="gray"
              size={36}
              className={styles.versionAction}
              aria-label="版本与分享"
              aria-haspopup="dialog"
              onClick={actions.versions}
            >
              <History size={17} aria-hidden />
            </ActionIcon>
          </Tooltip>
        )}
        <div className={styles.secondaryActions}>
          {isMarkdown && !outlineVisible && (
            <Tooltip label="显示大纲">
              <ActionIcon
                size={36}
                className={styles.desktopAction}
                aria-label="显示大纲"
                onClick={actions.outline}
              >
                <ListTree size={17} aria-hidden />
              </ActionIcon>
            </Tooltip>
          )}
          {canComment && (
            <Tooltip label="评论">
              <ActionIcon
                size={36}
                className={styles.desktopAction}
                aria-label="文档评论"
                onClick={actions.comments}
              >
                <MessageSquare size={17} aria-hidden />
              </ActionIcon>
            </Tooltip>
          )}
          {canRename && (
            <Tooltip label="重命名">
              <ActionIcon
                size={36}
                className={styles.desktopAction}
                aria-label="重命名"
                onClick={actions.rename}
              >
                <Pencil size={17} aria-hidden />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      </div>
      <div className={styles.compactActions}>
        <ActionIcon
          className={styles.compactAction}
          aria-label="快速打开与搜索"
          onClick={actions.search}
          disabled={unavailable}
        >
          <Search size={18} />
        </ActionIcon>
        {isMarkdown && (
          <ActionIcon
            className={styles.compactAction}
            aria-label="显示大纲"
            onClick={actions.outline}
          >
            <ListTree size={18} />
          </ActionIcon>
        )}
        <Menu position="bottom-end" width={240}>
          <Menu.Target>
            <ActionIcon
              ref={menuTarget}
              className={styles.compactAction}
              aria-label="工作区更多操作"
            >
              <Ellipsis size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown className={styles.menu}>
            {itemActions.map((action) => (
              <Menu.Item
                key={action.label}
                className={styles.menuItem}
                leftSection={<action.Icon size={16} />}
                onClick={() => runMenuAction(action.run)}
              >
                {action.label}
              </Menu.Item>
            ))}
            {itemActions.length > 0 && <Menu.Divider />}
            {canWrite && (
              <Menu.Item
                className={styles.menuItem}
                leftSection={<Trash2 size={16} />}
                onClick={() => runMenuAction(actions.trash)}
              >
                回收站
              </Menu.Item>
            )}
            {!unavailable && role && (
              <Menu.Item
                className={styles.menuItem}
                leftSection={<Settings size={16} />}
                onClick={() => runMenuAction(actions.settings)}
              >
                管理
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item
              className={styles.menuItem}
              leftSection={<Home size={16} />}
              onClick={() => runMenuAction(actions.workspaces)}
            >
              所有工作区
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </header>
  );
}
