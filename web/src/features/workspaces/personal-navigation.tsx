import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { FileText, Folder, PenTool, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useFavorite, usePersonalItems } from "@/api/personal-items";
import type { Item } from "@/api/types";
import { EmptyState } from "@/features/shared/empty-state";
import * as styles from "./personal-navigation.css";
import { touchAction } from "@/styles/interaction.css";

const icons = { markdown: FileText, whiteboard: PenTool, folder: Folder };
export function PersonalNavigation({
  workspaceId,
  items,
  onFolder,
  onSelect,
  section,
  onSectionChange,
  hideWhenWorkspaceEmpty = false,
}: {
  workspaceId: string;
  items: Item[];
  onFolder: (item: Item) => void;
  onSelect?: () => void;
  section: "favorites" | "recent";
  onSectionChange?: (section: "favorites" | "recent") => void;
  /**
   * When the workspace holds no items at all, "recent" and "favorites" cannot
   * fill themselves. Their empty copy would just repeat the content tree's
   * message three times over, so the caller hides them instead.
   */
  hideWhenWorkspaceEmpty?: boolean;
}) {
  const personal = usePersonalItems(workspaceId);
  const favorite = useFavorite(workspaceId);
  const navigate = useNavigate();
  const entries =
    section === "favorites"
      ? personal.data?.favorites.map((item) => ({ item, visitedAt: "" }))
      : personal.data?.recent;
  const path = (item: Item) => {
    const parts = [item.title];
    const seen = new Set([item.id]);
    let parent = items.find((entry) => entry.id === item.parentId);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      parts.unshift(parent.title);
      parent = items.find((entry) => entry.id === parent!.parentId);
    }
    return parts.join(" / ");
  };
  return (
    <Stack
      gap="sm"
      className={`${styles.panel}${onSectionChange ? ` ${styles.detailedPanel}` : ""}`}
    >
      {!!onSectionChange && (
        <SegmentedControl
          fullWidth
          value={section}
          onChange={(value) => onSectionChange(value as "favorites" | "recent")}
          data={[
            { label: "收藏", value: "favorites" },
            { label: "最近访问", value: "recent" },
          ]}
        />
      )}
      {personal.isPending && <Loader size="sm" aria-label="加载个人导航" />}
      {personal.error ? (
        <Alert color="red">
          个人导航加载失败，请确认访问权限。
          <Button
            size="xs"
            variant="subtle"
            onClick={() => void personal.refetch()}
          >
            重试
          </Button>
        </Alert>
      ) : (
        <nav aria-label={section === "favorites" ? "我的收藏" : "最近访问列表"}>
          {entries?.map(({ item, visitedAt }) => {
            const Icon = icons[item.type];
            return (
              <div className={styles.row} key={item.id}>
                <UnstyledButton
                  className={styles.link}
                  title={item.title}
                  aria-label={`${item.title}${visitedAt ? `，最近访问 ${new Date(visitedAt).toLocaleString()}` : ""}`}
                  onClick={async () => {
                    if (item.type === "folder") {
                      onFolder(item);
                      return;
                    }
                    await navigate({
                      to: "/workspace/$workspaceId/$itemId",
                      params: { workspaceId, itemId: item.id },
                    });
                    onSelect?.();
                  }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <Icon size={15} className={styles.icon} aria-hidden />
                    <Text size="sm" className={styles.title} truncate>
                      {item.title}
                    </Text>
                  </Group>
                  {!!onSectionChange && (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {path(item)}
                    </Text>
                  )}
                  {!!onSectionChange && visitedAt && (
                    <Text size="xs" c="dimmed">
                      {new Date(visitedAt).toLocaleString()}
                    </Text>
                  )}
                </UnstyledButton>
                {section === "favorites" && (
                  <Tooltip label="取消收藏">
                    <ActionIcon
                      className={`${styles.favoriteAction} ${touchAction}`}
                      size={26}
                      variant="subtle"
                      color="gray"
                      aria-label={`取消收藏 ${item.title}`}
                      disabled={favorite.isPending}
                      onClick={() =>
                        favorite.mutate({ id: item.id, favorite: false })
                      }
                    >
                      <X size={15} aria-hidden />
                    </ActionIcon>
                  </Tooltip>
                )}
              </div>
            );
          })}
          {!personal.isPending &&
            entries?.length === 0 &&
            !(hideWhenWorkspaceEmpty && !items.length) && (
              // One line only. The sidebar rail is a dense index, not a reading
              // surface; a second wrapped line breaks the rhythm the nav rows
              // and section headers establish. The star affordance is already
              // visible on tree rows, so naming it inline is enough.
              <EmptyState
                size="inline"
                title={
                  section === "favorites" ? "还没有收藏" : "还没有访问记录"
                }
              />
            )}
        </nav>
      )}
    </Stack>
  );
}
