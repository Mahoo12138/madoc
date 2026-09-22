import type { Dispatch, SetStateAction } from 'react';
import { ActionIcon, Menu, UnstyledButton } from '@mantine/core';
import {
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  FileText as IconFileText,
  Folder as IconFolder,
  FolderPlus as IconFolderPlus,
  Ellipsis as IconDots,
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash as IconTrash,
  PenTool as IconWhiteboard,
  Move as IconMove,
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import type { Item, ItemType, Role } from '@/api/types';
import * as styles from './workspace-shell.css';

type Props = {
  workspaceId: string;
  items: Item[];
  activeId?: string;
  role: Role;
  onCreate: (type: ItemType, parentId: string | null) => void;
  onRename: (item: Item) => void;
  onMove: (item: Item) => void;
  onDelete: (item: Item) => void;
  collapsed: Record<string, boolean>;
  onCollapsedChange: Dispatch<SetStateAction<Record<string, boolean>>>;
  onSelect?: () => void;
};

const icons = {
  folder: IconFolder,
  markdown: IconFileText,
  whiteboard: IconWhiteboard,
};

export function ItemTree({
  workspaceId,
  items,
  activeId,
  role,
  onCreate,
  onRename,
  onMove,
  onDelete,
  collapsed,
  onCollapsedChange,
  onSelect,
}: Props) {
  const navigate = useNavigate();
  const children = (parentId: string | null) =>
    items
      .filter((item) => item.parentId === parentId)
      .sort((a, b) => a.sortKey - b.sortKey);
  const render = (parentId: string | null, depth: number): React.ReactNode =>
    children(parentId).map((item) => {
      const Icon = icons[item.type];
      const isFolder = item.type === 'folder';
      const closed = collapsed[item.id];
      return (
        <div key={item.id}>
          <div className={styles.treeRow} data-active={activeId === item.id}>
            <UnstyledButton
              className={styles.treeLink}
              style={{ paddingLeft: 8 + depth * 17 }}
              aria-expanded={isFolder ? !closed : undefined}
              aria-current={activeId === item.id ? 'page' : undefined}
              onClick={() => {
                if (isFolder)
                  onCollapsedChange((v) => ({ ...v, [item.id]: !v[item.id] }));
                else {
                  void navigate({
                    to: '/workspace/$workspaceId/$itemId',
                    params: { workspaceId, itemId: item.id },
                  });
                  onSelect?.();
                }
              }}
            >
              {isFolder ? (
                closed ? (
                  <IconChevronRight size={14} />
                ) : (
                  <IconChevronDown size={14} />
                )
              ) : (
                <span style={{ width: 14 }} />
              )}
              <Icon size={15} />
              <span className={styles.rowTitle}>{item.title}</span>
            </UnstyledButton>
            {role !== 'viewer' && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    size="xs"
                    aria-label={`${item.title} 的操作`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconDots size={13} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {isFolder && (
                    <>
                      <Menu.Item
                        leftSection={<IconPlus size={14} />}
                        onClick={() => onCreate('markdown', item.id)}
                      >
                        新建文档
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconWhiteboard size={14} />}
                        onClick={() => onCreate('whiteboard', item.id)}
                      >
                        新建白板
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconFolderPlus size={14} />}
                        onClick={() => onCreate('folder', item.id)}
                      >
                        新建文件夹
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  )}
                  <Menu.Item
                    leftSection={<IconPencil size={14} />}
                    onClick={() => onRename(item)}
                  >
                    重命名
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconMove size={14} />}
                    onClick={() => onMove(item)}
                  >
                    移动到…
                  </Menu.Item>
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => onDelete(item)}
                  >
                    删除
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </div>
          {isFolder && !closed && render(item.id, depth + 1)}
        </div>
      );
    });
  return <>{render(null, 0)}</>;
}
