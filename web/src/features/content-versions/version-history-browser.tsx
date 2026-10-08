import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Code,
  Loader,
  Tabs,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { Copy } from 'lucide-react';
import type { ContentVersion, ContentVersionDetail, Role } from '@/api/types';
import { EmptyState } from '@/features/shared/empty-state';
import type { DiffLine } from './version-diff';
import * as styles from './version-history-dialog.css';

export function versionDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function VersionHistoryBrowser({
  versions,
  selected,
  detail,
  loadingList,
  loadingDetail,
  nextBefore,
  busy,
  role,
  comparison,
  boardPreview,
  onSelect,
  onLoadMore,
  onRestore,
}: {
  versions: ContentVersion[];
  selected: string;
  detail?: ContentVersionDetail;
  loadingList: boolean;
  loadingDetail: boolean;
  nextBefore: string;
  busy: boolean;
  role: Role;
  comparison?: DiffLine[] | null;
  boardPreview: string;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRestore: () => void;
}) {
  const [view, setView] = useState<string | null>('content');
  useEffect(() => {
    setView('content');
  }, [detail?.version.id]);
  return (
    <div className={styles.browser}>
      <nav className={styles.versionList} aria-label="版本列表">
        {loadingList ? (
          <Loader size="sm" aria-label="正在读取版本" />
        ) : !versions.length ? (
          <EmptyState
            size="inline"
            title="还没有版本记录"
            description="自动保存会在正文改动累积到检查点时创建版本，也可以随时手动保存一个版本。"
          />
        ) : (
          versions.map((version) => (
            <UnstyledButton
              key={version.id}
              className={styles.versionButton}
              aria-pressed={selected === version.id}
              onClick={() => onSelect(version.id)}
              disabled={busy}
            >
              <div className={styles.versionLabel}>
                <Badge
                  size="xs"
                  color={version.kind === 'manual' ? 'blue' : 'gray'}
                  className={styles.kind}
                >
                  {version.kind === 'manual' ? '手动' : '自动'}
                </Badge>
                <Text size="sm" fw={500} className={styles.versionName}>
                  <bdi>{version.label || '自动保存'}</bdi>
                </Text>
              </div>
              <Text size="xs" c="dimmed">
                {versionDate(version.createdAt)}
              </Text>
            </UnstyledButton>
          ))
        )}
        {nextBefore && (
          <Button
            variant="default"
            size="xs"
            className={styles.loadMore}
            onClick={onLoadMore}
            loading={busy}
          >
            加载更早版本
          </Button>
        )}
      </nav>
      <section className={styles.preview} aria-label="版本内容预览">
        {loadingDetail ? (
          <Loader size="sm" aria-label="正在读取版本内容" />
        ) : detail ? (
          <>
            <div className={styles.previewHeader}>
              <h2
                className={styles.previewTitle}
                title={detail.version.label || '自动保存'}
              >
                <bdi>{detail.version.label || '自动保存'}</bdi>
              </h2>
              <Text size="xs" c="dimmed">
                {versionDate(detail.version.createdAt)} ·{' '}
                {Math.ceil(detail.version.payloadBytes / 1024)} KiB
              </Text>
            </div>
            {detail.markdown && (
              <Tabs
                value={view}
                onChange={setView}
                className={styles.previewTabs}
              >
                <Tabs.List className={styles.tabList}>
                  <Tabs.Tab value="content">正文</Tabs.Tab>
                  <Tabs.Tab value="diff" disabled={!comparison}>
                    差异
                  </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="content" className={styles.previewPanel}>
                  <Code block className={styles.code}>
                    {detail.markdown.markdown}
                  </Code>
                </Tabs.Panel>
                <Tabs.Panel value="diff" className={styles.previewPanel}>
                  <Code block className={styles.diffCode}>
                    {comparison
                      ?.map(
                        (line) =>
                          `${line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}${line.text}`,
                      )
                      .join('\n') || '两个版本没有变化。'}
                  </Code>
                </Tabs.Panel>
              </Tabs>
            )}
            {detail.whiteboard && (
              <>
                <div className={styles.boardViewport}>
                  {boardPreview && boardPreview !== 'error' ? (
                    <img
                      src={boardPreview}
                      alt="白板版本预览"
                      className={styles.boardImage}
                    />
                  ) : (
                    <Text size="sm" c="dimmed">
                      {boardPreview === 'error'
                        ? '无法生成白板预览。'
                        : '正在生成白板预览…'}
                    </Text>
                  )}
                </div>
                <Text size="xs" c="dimmed" mt="xs">
                  场景版本 {detail.whiteboard.revision} · 保留附件{' '}
                  {detail.assetIds.length} 项
                </Text>
              </>
            )}
            {role !== 'viewer' && (
              <div className={styles.previewFooter}>
                <Button
                  variant="default"
                  leftSection={<Copy size={15} aria-hidden />}
                  className={styles.action}
                  onClick={onRestore}
                  disabled={busy}
                >
                  恢复为新副本
                </Button>
              </div>
            )}
          </>
        ) : (
          <Text size="sm" c="dimmed">
            选择一个检查点查看内容。
          </Text>
        )}
      </section>
    </div>
  );
}
