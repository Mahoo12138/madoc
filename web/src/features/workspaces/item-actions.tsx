import { lazy, Suspense, useState } from 'react';
import { ActionIcon, Menu, Modal, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  Copy,
  Ellipsis,
  FolderPlus,
  Download,
  Link,
  Move,
  Pencil,
  PenTool,
  Plus,
  Trash,
} from 'lucide-react';
import { DuplicateItem } from './duplicate-item';
import type { Item, ItemType, Role } from '@/api/types';

const FolderExportDialog = lazy(() => import('./folder-export-dialog').then((module) => ({ default: module.FolderExportDialog })));

// Titles and parent folders are deliberately absent from the destination.
export function itemURL(item: Pick<Item, 'workspaceId' | 'id'>) {
  return new URL(
    `/workspace/${encodeURIComponent(item.workspaceId)}/${encodeURIComponent(item.id)}`,
    window.location.origin,
  ).href;
}

export function ItemActions({
  item,
  items,
  active,
  onOpen,
  role,
  onCreate,
  onRename,
  onMove,
  onDelete,
}: {
  item: Item;
  items: Item[];
  active: boolean;
  onOpen?: () => void;
  role: Role;
  onCreate: (type: ItemType, parentId: string | null) => void;
  onRename: (item: Item) => void;
  onMove: (item: Item) => void;
  onDelete: (item: Item) => void;
}) {
  const [manualLink, setManualLink] = useState('');
  const [copyOpened, setCopyOpened] = useState(false);
  const [folderExportOpened, setFolderExportOpened] = useState(false);
  const folder = item.type === 'folder';
  if (role === 'viewer' && folder) return null;
  const copyLink = async () => {
    const url = itemURL(item);
    try {
      await navigator.clipboard.writeText(url);
      notifications.show({
        message: '链接已复制，仅有访问权限的成员可以打开。',
      });
    } catch {
      setManualLink(url);
    }
  };
  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            size="xs"
            aria-label={`${item.title} 的操作`}
            onClick={(e) => e.stopPropagation()}
          >
            <Ellipsis size={13} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {!folder && (
            <Menu.Item
              leftSection={<Link size={14} />}
              onClick={() => void copyLink()}
            >
              复制链接
            </Menu.Item>
          )}
          {role !== 'viewer' && !folder && (
            <Menu.Item
              leftSection={<Copy size={14} />}
              onClick={() => setCopyOpened(true)}
            >
              复制内容
            </Menu.Item>
          )}
          {role !== 'viewer' && (
            <>
              {folder && (
                <>
                  <Menu.Item leftSection={<Download size={14} />} onClick={() => setFolderExportOpened(true)}>
                    导出文件夹 ZIP
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Plus size={14} />}
                    onClick={() => onCreate('markdown', item.id)}
                  >
                    新建文档
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<PenTool size={14} />}
                    onClick={() => onCreate('whiteboard', item.id)}
                  >
                    新建白板
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<FolderPlus size={14} />}
                    onClick={() => onCreate('folder', item.id)}
                  >
                    新建文件夹
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Item
                leftSection={<Pencil size={14} />}
                onClick={() => onRename(item)}
              >
                重命名
              </Menu.Item>
              <Menu.Item
                leftSection={<Move size={14} />}
                onClick={() => onMove(item)}
              >
                移动到…
              </Menu.Item>
              <Menu.Item
                color="red"
                leftSection={<Trash size={14} />}
                onClick={() => onDelete(item)}
              >
                删除
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      {copyOpened && role !== 'viewer' && (
        <DuplicateItem
          item={item}
          active={active}
          onOpen={onOpen}
          onClose={() => setCopyOpened(false)}
        />
      )}
      {folderExportOpened && role !== 'viewer' && (
        <Suspense fallback={null}>
          <FolderExportDialog folder={item} items={items} onClose={() => setFolderExportOpened(false)} />
        </Suspense>
      )}
      {manualLink && (
        <Modal opened onClose={() => setManualLink('')} title="复制链接">
          <Stack>
            <Text size="sm">
              浏览器未允许访问剪贴板，请手动复制。仅有访问权限的成员可以打开此链接。
            </Text>
            <TextInput
              label="内容链接"
              value={manualLink}
              readOnly
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
            />
          </Stack>
        </Modal>
      )}
    </>
  );
}
