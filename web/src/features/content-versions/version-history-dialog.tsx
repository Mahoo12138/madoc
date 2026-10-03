import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Modal, Progress, Tabs, Text } from '@mantine/core';
import { History, Link, Plus } from 'lucide-react';
import { api } from '@/api/client';
import { keys } from '@/api/hooks';
import {
  APIError,
  type ContentVersion,
  type ContentVersionDetail,
  type Item,
  type Role,
} from '@/api/types';
import { prepareContentSave } from '@/features/content/content-save';
import { diffLines } from './version-diff';
import { ItemShareManager } from './item-share-manager';
import { VersionActionDialog } from './version-action-dialog';
import { VersionHistoryBrowser } from './version-history-browser';
import * as styles from './version-history-dialog.css';

export function VersionHistoryDialog({
  item,
  role,
  onClose,
  assetIds,
}: {
  item: Item;
  role: Role;
  onClose: () => void;
  assetIds?: () => string[];
}) {
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [nextBefore, setNextBefore] = useState('');
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<ContentVersionDetail>();
  const [previous, setPrevious] = useState<ContentVersionDetail>();
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [sharesCloseBlocked, setSharesCloseBlocked] = useState(false);
  const [copyTitle, setCopyTitle] = useState(`${item.title} 恢复副本`);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [boardPreview, setBoardPreview] = useState('');
  const [usage, setUsage] =
    useState<Awaited<ReturnType<typeof api.contentVersionUsage>>>();
  const navigate = useNavigate();
  const queries = useQueryClient();

  useEffect(() => {
    let active = true;
    void api
      .contentVersions(item.id)
      .then((result) => {
        if (!active) return;
        setVersions(result.versions);
        setNextBefore(result.nextBefore);
        setSelected(result.versions[0]?.id ?? '');
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : '无法读取版本历史。',
          );
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, [item.id]);

  useEffect(() => {
    let active = true;
    void api
      .contentVersionUsage(item.workspaceId)
      .then((result) => {
        if (active) setUsage(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [item.workspaceId]);

  useEffect(() => {
    if (!selected) {
      setDetail(undefined);
      setPrevious(undefined);
      return;
    }
    let active = true;
    setLoadingDetail(true);
    setError('');
    const index = versions.findIndex((version) => version.id === selected);
    void Promise.all([
      api.contentVersion(item.id, selected),
      index >= 0 && versions[index + 1]
        ? api.contentVersion(item.id, versions[index + 1].id)
        : Promise.resolve(undefined),
    ])
      .then(([current, before]) => {
        if (active) {
          setDetail(current);
          setPrevious(before);
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : '无法读取所选版本。',
          );
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });
    return () => {
      active = false;
    };
  }, [item.id, selected, versions]);

  useEffect(() => {
    let active = true;
    let objectURL = '';
    setBoardPreview('');
    if (!detail?.whiteboard) return;
    void (async () => {
      try {
        const { exportToSvg } = await import('@excalidraw/excalidraw');
        const scene = JSON.parse(detail.whiteboard!.scene) as {
          elements: unknown[];
          appState: Record<string, unknown>;
          files: Record<string, unknown>;
        };
        const svg = await exportToSvg({
          elements: scene.elements as never[],
          appState: scene.appState as never,
          files: scene.files as never,
        });
        if (!active) return;
        objectURL = URL.createObjectURL(
          new Blob([svg.outerHTML], { type: 'image/svg+xml' }),
        );
        setBoardPreview(objectURL);
      } catch {
        if (active) setBoardPreview('error');
      }
    })();
    return () => {
      active = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [detail]);

  const comparison = useMemo(() => {
    if (!detail?.markdown) return undefined;
    return previous?.markdown
      ? diffLines(previous.markdown.markdown, detail.markdown.markdown)
      : undefined;
  }, [detail, previous]);

  const createVersion = async () => {
    if (!label.trim() || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15000);
      try {
        await prepareContentSave(item.id, role !== 'viewer', controller.signal);
      } finally {
        window.clearTimeout(timer);
      }
      const result = await api.createContentVersion(
        item.id,
        label.trim(),
        assetIds?.() ?? [],
      );
      setVersions((current) => [result.version, ...current]);
      setSelected(result.version.id);
      setLabel('');
      setCreatingVersion(false);
      setNotice('手动版本已保存。');
    } catch (failure) {
      setError(
        failure instanceof APIError
          ? failure.message
          : failure instanceof Error
            ? failure.message
            : '保存版本失败。',
      );
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (!nextBefore || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.contentVersions(item.id, nextBefore);
      setVersions((current) => [...current, ...result.versions]);
      setNextBefore(result.nextBefore);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : '加载更多版本失败。',
      );
    } finally {
      setBusy(false);
    }
  };

  const restoreCopy = async () => {
    if (!detail || !copyTitle.trim() || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.restoreContentVersionCopy(
        item.id,
        detail.version.id,
        copyTitle.trim(),
      );
      await queries.invalidateQueries({
        queryKey: keys.items(item.workspaceId),
      });
      await navigate({
        to: '/workspace/$workspaceId/$itemId',
        params: {
          workspaceId: result.item.workspaceId,
          itemId: result.item.id,
        },
      });
      onClose();
    } catch (failure) {
      setError(
        failure instanceof APIError
          ? failure.message
          : '恢复结果可能未确认。请先检查目录，再决定是否重试。',
      );
    } finally {
      setBusy(false);
    }
  };

  const closeBlocked =
    busy || creatingVersion || restoring || sharesCloseBlocked;

  return (
    <>
      <Modal
        opened
        title="版本历史"
        onClose={() => !closeBlocked && onClose()}
        size="min(1040px, calc(100vw - 32px))"
        closeOnClickOutside={!closeBlocked}
        closeOnEscape={!closeBlocked}
        withCloseButton={!closeBlocked}
        classNames={{
          content: styles.modal,
          header: styles.modalHeader,
          body: styles.modalBody,
        }}
      >
        {error && !creatingVersion && !restoring && (
          <Alert className={styles.notice} color="red" title="操作未完成">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert className={styles.notice} color="green">
            {notice}
          </Alert>
        )}
        <Tabs defaultValue="history" className={styles.tabs} keepMounted>
          <Tabs.List className={styles.tabList}>
            <Tabs.Tab
              value="history"
              leftSection={<History size={16} aria-hidden />}
            >
              历史记录
            </Tabs.Tab>
            {role === 'owner' && (
              <Tabs.Tab
                value="shares"
                leftSection={<Link size={16} aria-hidden />}
              >
                只读分享
              </Tabs.Tab>
            )}
          </Tabs.List>
          <Tabs.Panel value="history" className={styles.panel}>
            <div className={styles.toolbar}>
              <Text className={styles.itemTitle} title={item.title}>
                {item.title}
              </Text>
              {role !== 'viewer' && (
                <Button
                  variant="light"
                  className={styles.action}
                  leftSection={<Plus size={16} aria-hidden />}
                  onClick={() => {
                    setLabel('');
                    setError('');
                    setCreatingVersion(true);
                  }}
                  disabled={busy}
                >
                  保存手动版本
                </Button>
              )}
            </div>
            <VersionHistoryBrowser
              versions={versions}
              selected={selected}
              detail={detail}
              loadingList={loadingList}
              loadingDetail={loadingDetail}
              nextBefore={nextBefore}
              busy={busy}
              role={role}
              comparison={comparison}
              boardPreview={boardPreview}
              onSelect={setSelected}
              onLoadMore={() => void loadMore()}
              onRestore={() => {
                setCopyTitle(`${item.title} 恢复副本`);
                setError('');
                setRestoring(true);
              }}
            />
          </Tabs.Panel>
          {role === 'owner' && (
            <Tabs.Panel value="shares" className={styles.panel}>
              <ItemShareManager
                item={item}
                versions={versions}
                selectedVersionId={selected}
                onSelectVersion={setSelected}
                onCloseBlockedChange={setSharesCloseBlocked}
              />
            </Tabs.Panel>
          )}
        </Tabs>
        {usage && (
          <div className={styles.usage}>
            <div className={styles.usageSummary}>
              <Text size="xs" c="dimmed">
                工作区历史占用：{formatBytes(usage.usedBytes)} /{' '}
                {formatBytes(usage.limitBytes)}
              </Text>
              <Text size="xs" c="dimmed">
                手动 {usage.manualVersions} · 自动 {usage.automaticVersions}
              </Text>
            </div>
            <Progress
              value={Math.min(100, (usage.usedBytes / usage.limitBytes) * 100)}
              color={usage.automaticPaused ? 'orange' : 'blue'}
              size={3}
            />
            {usage.automaticPaused && (
              <Alert color="orange" py="xs">
                历史占用已达上限，自动版本暂停；手动版本和内容编辑仍可继续。
              </Alert>
            )}
          </div>
        )}
      </Modal>
      <VersionActionDialog
        opened={creatingVersion}
        title="保存手动版本"
        inputLabel="版本名称"
        value={label}
        maxLength={120}
        submitLabel="保存"
        pending={busy}
        error={error}
        onChange={setLabel}
        onSubmit={() => void createVersion()}
        onClose={() => {
          setCreatingVersion(false);
          setLabel('');
          setError('');
        }}
      />
      <VersionActionDialog
        opened={restoring}
        title="恢复为新副本"
        inputLabel="恢复副本名称"
        value={copyTitle}
        submitLabel="恢复副本"
        pending={busy}
        error={error}
        onChange={setCopyTitle}
        onSubmit={() => void restoreCopy()}
        onClose={() => {
          setRestoring(false);
          setCopyTitle(`${item.title} 恢复副本`);
          setError('');
        }}
      />
    </>
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}
