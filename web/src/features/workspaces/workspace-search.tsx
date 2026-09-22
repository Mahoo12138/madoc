import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Combobox,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  useCombobox,
} from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { FileText, Folder, PenTool, Search } from 'lucide-react';
import { useItems } from '@/api/hooks';
import { APIError, type ItemType } from '@/api/types';
import { searchKey, searchWorkspace } from '@/api/search';
import * as styles from './workspace-search.css';

const types = { markdown: '文档', whiteboard: '白板', folder: '文件夹' };
const icons = { markdown: FileText, whiteboard: PenTool, folder: Folder };
type Result = {
  id: string;
  type: ItemType;
  title: string;
  path: string;
  snippet: string;
  cacheSeq?: number;
  headSeq?: number;
};

export function useSearchShortcut(open: () => void, enabled: boolean) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        !enabled ||
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 'k'
      )
        return;
      // Do not interrupt another modal's form or destructive confirmation.
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, [open, enabled]);
}

export function WorkspaceSearch({
  workspaceId,
  opened,
  onClose,
  onSelect,
}: {
  workspaceId: string;
  opened: boolean;
  onClose: () => void;
  onSelect: (id: string, type: ItemType) => void;
}) {
  const [value, setValue] = useState('');
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (!opened) {
      setValue('');
      setComposing(false);
    }
  }, [opened]);
  const query = value.trim();
  const [debounced] = useDebouncedValue(query, 200);
  const valid = Array.from(query).length <= 128 && !query.includes('\0');
  const ready = !composing && query === debounced && valid;
  const mobile = useMediaQuery('(max-width: 760px)');
  const items = useItems(workspaceId);
  const results = useQuery({
    queryKey: [...searchKey(workspaceId), debounced],
    queryFn: ({ signal }) => searchWorkspace(workspaceId, debounced, signal),
    enabled: opened && ready && !!debounced,
    retry: false,
  });
  const combobox = useCombobox({ opened: true, loop: false });
  useEffect(() => {
    combobox.resetSelectedOption();
  }, [query]);
  const byId = new Map((items.data ?? []).map((item) => [item.id, item]));
  const quick: Result[] = (items.data ?? [])
    .map((item) => {
      const path = [item.title];
      const seen = new Set([item.id]);
      let parent = item.parentId ? byId.get(item.parentId) : undefined;
      while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        path.unshift(parent.title);
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      return { ...item, path: path.join(' / '), snippet: '' };
    })
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 30);
  const error = query ? (ready ? results.error : null) : items.error;
  const waiting = query ? !ready || results.isFetching : items.isFetching;
  const rows: Result[] = error
    ? []
    : !query
      ? quick
      : ready && !results.isError
        ? (results.data?.items ?? [])
        : [];
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="快速打开与搜索"
      size="lg"
      fullScreen={mobile}
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          当前 Workspace · 标题、路径和文档正文
        </Text>
        <Combobox
          store={combobox}
          onOptionSubmit={(id) => {
            if (composing || waiting) return;
            const item = rows.find((item) => item.id === id);
            if (item) onSelect(item.id, item.type);
          }}
        >
          <Combobox.EventsTarget withExpandedAttribute>
            <TextInput
              autoFocus
              data-autofocus
              role="combobox"
              aria-autocomplete="list"
              aria-label="搜索当前 Workspace"
              placeholder="输入标题、路径或正文关键词"
              leftSection={<Search size={16} />}
              rightSection={waiting && valid ? <Loader size="xs" /> : null}
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onKeyDownCapture={(event) => {
                if (
                  event.key === 'Escape' &&
                  !event.nativeEvent.isComposing &&
                  !composing
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose();
                  return;
                }

                if (
                  (event.nativeEvent.isComposing || composing) &&
                  event.key === 'Enter'
                )
                  event.stopPropagation();
              }}
              error={
                !valid ? '关键词最多 128 个字符，不能包含空字符。' : undefined
              }
            />
          </Combobox.EventsTarget>
          {!!query && ready && !!results.data?.staleDocuments && (
            <Alert color="yellow">
              {results.data.staleDocuments}{' '}
              篇文档的最新修改尚未纳入正文检索。可稍后刷新结果。
            </Alert>
          )}
          {error && (
            <Alert color="red" role="alert">
              {error instanceof APIError &&
              (error.status === 403 || error.status === 404)
                ? '无法搜索此 Workspace，请确认访问权限。'
                : '搜索未完成，请检查网络后重试。'}
              <Button
                variant="subtle"
                size="xs"
                onClick={() =>
                  void (query ? results.refetch() : items.refetch())
                }
              >
                重试
              </Button>
            </Alert>
          )}
          <Combobox.Options
            className={styles.results}
            aria-label="搜索结果"
            aria-busy={waiting}
          >
            {rows.map((item) => {
              const Icon = icons[item.type];
              return (
                <Combobox.Option
                  className={styles.option}
                  value={item.id}
                  key={item.id}
                  disabled={waiting}
                >
                  <Group align="flex-start" wrap="nowrap" gap="sm">
                    <Icon size={18} className={styles.icon} />
                    <div className={styles.content}>
                      <Group gap="xs">
                        <Text fw={600} size="sm">
                          {item.title}
                        </Text>
                        <Badge size="xs" variant="light">
                          {types[item.type]}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {item.path}
                      </Text>
                      {item.snippet && (
                        <Text size="sm" lineClamp={3}>
                          {item.snippet}
                        </Text>
                      )}
                      {(item.headSeq ?? 0) > (item.cacheSeq ?? 0) && (
                        <Text size="xs" c="orange">
                          正文结果尚未覆盖最新修改
                        </Text>
                      )}
                    </div>
                  </Group>
                </Combobox.Option>
              );
            })}
            {!waiting && valid && !error && rows.length === 0 && (
              <Combobox.Empty>
                {query ? '没有匹配结果' : '当前 Workspace 还没有内容'}
              </Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox>
        <Text size="xs" c="dimmed">
          正文以查询时的已保存内容为准，本地未同步修改不参与检索。
        </Text>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            ↑↓ 选择 · Enter 打开 · Esc 关闭
          </Text>
          {query && (
            <Button
              size="xs"
              variant="subtle"
              disabled={!ready || waiting}
              onClick={() => void results.refetch()}
            >
              刷新结果
            </Button>
          )}
        </Group>
        {(query
          ? ready && results.data?.hasMore
          : (items.data?.length ?? 0) > 30) && (
          <Text size="xs" c="dimmed">
            仅显示前 30 项，请输入更具体的关键词。
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
