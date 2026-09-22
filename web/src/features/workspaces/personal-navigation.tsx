import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { FileText, Folder, PenTool } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useFavorite, usePersonalItems } from '@/api/personal-items';
import type { Item } from '@/api/types';
import * as styles from './personal-navigation.css';

const icons = { markdown: FileText, whiteboard: PenTool, folder: Folder };
export function PersonalNavigation({
  workspaceId,
  items,
  onFolder,
  onSelect,
}: {
  workspaceId: string;
  items: Item[];
  onFolder: (item: Item) => void;
  onSelect?: () => void;
}) {
  const [section, setSection] = useState('favorites');
  const personal = usePersonalItems(workspaceId);
  const favorite = useFavorite(workspaceId);
  const navigate = useNavigate();
  const entries =
    section === 'favorites'
      ? personal.data?.favorites.map((item) => ({ item, visitedAt: '' }))
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
    return parts.join(' / ');
  };
  return (
    <Stack gap="sm" className={styles.panel}>
      <SegmentedControl
        fullWidth
        value={section}
        onChange={setSection}
        data={[
          { label: '收藏', value: 'favorites' },
          { label: '最近访问', value: 'recent' },
        ]}
      />
      <Text size="xs" c="dimmed">
        仅当前账号可见{section === 'recent' ? ' · 最近 50 项' : ''}
      </Text>
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
        <nav aria-label={section === 'favorites' ? '我的收藏' : '最近访问列表'}>
          {entries?.map(({ item, visitedAt }) => {
            const Icon = icons[item.type];
            return (
              <div className={styles.row} key={item.id}>
                <UnstyledButton
                  className={styles.link}
                  onClick={async () => {
                    if (item.type === 'folder') {
                      onFolder(item);
                      return;
                    }
                    await navigate({
                      to: '/workspace/$workspaceId/$itemId',
                      params: { workspaceId, itemId: item.id },
                    });
                    onSelect?.();
                  }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <Icon size={15} />
                    <Text size="sm" truncate>
                      {item.title}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {path(item)}
                  </Text>
                  {visitedAt && (
                    <Text size="xs" c="dimmed">
                      {new Date(visitedAt).toLocaleString()}
                    </Text>
                  )}
                </UnstyledButton>
                {section === 'favorites' && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    aria-label={`取消收藏 ${item.title}`}
                    disabled={favorite.isPending}
                    onClick={() =>
                      favorite.mutate({ id: item.id, favorite: false })
                    }
                  >
                    移除
                  </Button>
                )}
              </div>
            );
          })}
          {!personal.isPending && entries?.length === 0 && (
            <Text size="sm" c="dimmed">
              {section === 'favorites'
                ? '还没有收藏，可使用文件旁的星标添加。'
                : '打开文档或白板后，会出现在这里。'}
            </Text>
          )}
        </nav>
      )}
    </Stack>
  );
}
