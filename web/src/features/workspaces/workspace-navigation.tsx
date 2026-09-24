import { useState, type ComponentProps } from "react";
import {
  ActionIcon,
  Group,
  Menu,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  FolderPlus,
  ListTree,
  PenTool,
  Plus,
  Star,
  Upload,
} from "lucide-react";
import type { Item } from "@/api/types";
import { MarkdownOutline } from "@/features/markdown/markdown-outline";
import type { MarkdownOutline as Outline } from "@/features/markdown/markdown-outline-model";
import { ItemTree } from "./item-tree";
import { PersonalNavigation } from "./personal-navigation";
import * as styles from "./workspace-shell.css";

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
  const isDocument = active?.type === "markdown";
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const toggle = (section: string) =>
    setClosed((value) => ({ ...value, [section]: !value[section] }));
  const onFolder = (item: Item) => {
    const expanded: Record<string, boolean> = {};
    let node: Item | undefined = item;
    while (node && !(node.id in expanded)) {
      expanded[node.id] = false;
      node = treeProps.items.find((entry) => entry.id === node?.parentId);
    }
    treeProps.onCollapsedChange((previous) => ({ ...previous, ...expanded }));
    onPanelChange("files");
  };
  const createMenu = (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon size="sm" aria-label="新建内容">
          <Plus size={15} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<FileText size={15} />}
          onClick={() => treeProps.onCreate("markdown", null)}
        >
          文档
        </Menu.Item>
        <Menu.Item
          leftSection={<PenTool size={15} />}
          onClick={() => treeProps.onCreate("whiteboard", null)}
        >
          白板
        </Menu.Item>
        <Menu.Item
          leftSection={<FolderPlus size={15} />}
          onClick={() => treeProps.onCreate("folder", null)}
        >
          文件夹
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item leftSection={<Upload size={15} />} onClick={onPreviewImport}>
          导入内容包
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
  const sectionHeader = (id: string, label: string, Icon: typeof Clock3) => (
    <div className={styles.navSectionHeader}>
      <UnstyledButton
        className={styles.navSectionToggle}
        onClick={() => toggle(id)}
        aria-expanded={!closed[id]}
      >
        <span className={styles.navSectionLabel}>
          <Icon size={16} />
          <Text size="sm" fw={600}>
            {label}
          </Text>
          <span
            className={styles.navSectionChevron}
            data-testid={`workspace-section-chevron-${id}`}
            aria-hidden="true"
          >
            {closed[id] ? (
              <ChevronRight size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </span>
        </span>
      </UnstyledButton>
    </div>
  );
  return (
    <>
      <div className={styles.desktopNavigation} aria-label="工作区导航">
        <section className={styles.navSectionGroup}>
          {sectionHeader("recent", "最近", Clock3)}
          {!closed.recent && (
            <PersonalNavigation
              section="recent"
              workspaceId={treeProps.workspaceId}
              items={treeProps.items}
              onFolder={onFolder}
              onSelect={treeProps.onSelect}
            />
          )}
        </section>
        <section className={styles.navSectionGroup}>
          {sectionHeader("favorites", "收藏", Star)}
          {!closed.favorites && (
            <PersonalNavigation
              section="favorites"
              workspaceId={treeProps.workspaceId}
              items={treeProps.items}
              onFolder={onFolder}
              onSelect={treeProps.onSelect}
            />
          )}
        </section>
        <section className={styles.navSectionGroup}>
          <div className={styles.navSectionHeader}>
            <UnstyledButton
              className={styles.navSectionToggle}
              onClick={() => toggle("files")}
              aria-expanded={!closed.files}
            >
              <span className={styles.navSectionLabel}>
                <Folder size={16} />
                <Text size="sm" fw={600}>
                  文档空间
                </Text>
                <span
                  className={styles.navSectionChevron}
                  data-testid="workspace-section-chevron-files"
                  aria-hidden="true"
                >
                  {closed.files ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </span>
              </span>
            </UnstyledButton>
            {treeProps.role !== "viewer" && createMenu}
          </div>
          {!closed.files && (
            <nav className={styles.tree} aria-label="文件列表">
              <ItemTree {...treeProps} />
            </nav>
          )}
        </section>
      </div>
      <Tabs
        value={!isDocument && panel === "outline" ? "files" : panel}
        onChange={(value) => onPanelChange(value ?? "files")}
        className={styles.mobileNavigation}
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
            大纲
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
            {treeProps.role !== "viewer" && createMenu}
          </Group>
          <nav className={styles.tree} aria-label="文件列表">
            <ItemTree {...treeProps} />
          </nav>
        </Tabs.Panel>
        <Tabs.Panel value="personal" className={styles.navigationPanel}>
          {panel === "personal" && (
            <PersonalNavigation
              workspaceId={treeProps.workspaceId}
              items={treeProps.items}
              onSelect={treeProps.onSelect}
              onFolder={onFolder}
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
    </>
  );
}
