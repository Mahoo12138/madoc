import { ActionIcon, Group, Menu, Tabs, Text } from '@mantine/core';
import {
  FileText,
  FolderPlus,
  ListTree,
  Plus,
  PenTool,
  Star,
  Upload,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import type { Item } from '@/api/types';
import { MarkdownOutline } from '@/features/markdown/markdown-outline';
import type { MarkdownOutline as Outline } from '@/features/markdown/markdown-outline-model';
import { PersonalNavigation } from './personal-navigation';
import { ItemTree } from './item-tree';
import * as styles from './workspace-shell.css';

type Props = ComponentProps<typeof ItemTree> & {
  active?: Item;
  panel: string;
  onPanelChange: (panel: string) => void;
  outline: Outline | null;
  onNavigateHeading: (position: number) => void;
  onPreviewImport: () => void;
};

export function WorkspaceNavigation({
  active,
  panel,
  onPanelChange,
  outline,
  onNavigateHeading,
  onPreviewImport,
  ...treeProps
}: Props) {
  const isDocument = active?.type === 'markdown';
  return (
    <Tabs
      value={!isDocument && panel === 'outline' ? 'files' : panel}
      onChange={(value) => onPanelChange(value ?? 'files')}
      className={styles.navigation}
      keepMounted
    >
      <Tabs.List grow aria-label="内容导航">
        <Tabs.Tab value="files" leftSection={<FileText size={14} />}>
          文件
        </Tabs.Tab>
        <Tabs.Tab
          value="outline"
          leftSection={<ListTree size={14} />}
          disabled={!isDocument}
        >
          Outline
        </Tabs.Tab>
        <Tabs.Tab value="personal" leftSection={<Star size={14} />}>
          我的
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="files" className={styles.navigationPanel}>
        <Group justify="space-between" mt="md" px={8}>
          <Text size="xs" fw={700} c="dimmed">
            内容
          </Text>
          {treeProps.role !== 'viewer' && (
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon size="sm" aria-label="新建内容">
                  <Plus size={15} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<FileText size={15} />}
                  onClick={() => treeProps.onCreate('markdown', null)}
                >
                  文档
                </Menu.Item>
                <Menu.Item
                  leftSection={<PenTool size={15} />}
                  onClick={() => treeProps.onCreate('whiteboard', null)}
                >
                  白板
                </Menu.Item>
                <Menu.Item
                  leftSection={<FolderPlus size={15} />}
                  onClick={() => treeProps.onCreate('folder', null)}
                >
                  文件夹
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<Upload size={15} />}
                  onClick={onPreviewImport}
                >
                  预览导入包
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
        <nav className={styles.tree} aria-label="文件列表">
          <ItemTree {...treeProps} />
        </nav>
      </Tabs.Panel>
      <Tabs.Panel value="personal" className={styles.navigationPanel}>
        {panel === 'personal' && (
          <PersonalNavigation
            workspaceId={treeProps.workspaceId}
            items={treeProps.items}
            onSelect={treeProps.onSelect}
            onFolder={(item) => {
              const expanded: Record<string, boolean> = {};
              let node: Item | undefined = item;
              while (node && !(node.id in expanded)) {
                expanded[node.id] = false;
                node = treeProps.items.find(
                  (entry) => entry.id === node?.parentId,
                );
              }
              treeProps.onCollapsedChange((previous) => ({
                ...previous,
                ...expanded,
              }));
              onPanelChange('files');
            }}
          />
        )}
      </Tabs.Panel>
      <Tabs.Panel value="outline" className={styles.navigationPanel}>
        {isDocument && (
          <MarkdownOutline
            title={active.title}
            outline={outline?.itemId === active.id ? outline : null}
            onNavigate={onNavigateHeading}
          />
        )}
      </Tabs.Panel>
    </Tabs>
  );
}
