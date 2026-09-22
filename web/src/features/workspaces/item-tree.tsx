import type { Dispatch, SetStateAction } from 'react';
import { ActionIcon, UnstyledButton } from '@mantine/core';
import {
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  FileText as IconFileText,
  Folder as IconFolder,
  PenTool as IconWhiteboard,
  Star as IconStar,
} from 'lucide-react';
import { ItemActions } from './item-actions';
import { useFavorite, usePersonalItems } from '@/api/personal-items';
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
  const personal = usePersonalItems(workspaceId);
  const favorite = useFavorite(workspaceId);
  const favorites = new Set(personal.data?.favorites.map((item) => item.id));
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
            <ActionIcon
              size="xs"
              variant="subtle"
              color={favorites.has(item.id) ? 'yellow' : 'gray'}
              aria-label={`${favorites.has(item.id) ? '取消收藏' : '收藏'} ${item.title}`}
              aria-pressed={favorites.has(item.id)}
              disabled={!personal.isSuccess || favorite.isPending}
              onClick={() =>
                favorite.mutate({
                  id: item.id,
                  favorite: !favorites.has(item.id),
                })
              }
            >
              <IconStar
                size={13}
                fill={favorites.has(item.id) ? 'currentColor' : 'none'}
              />
            </ActionIcon>
            <ItemActions
              item={item}
              active={activeId === item.id}
              onOpen={onSelect}
              role={role}
              onCreate={onCreate}
              onRename={onRename}
              onMove={onMove}
              onDelete={onDelete}
            />
          </div>
          {isFolder && !closed && render(item.id, depth + 1)}
        </div>
      );
    });
  return <>{render(null, 0)}</>;
}
