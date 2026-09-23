import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Code, Group, Loader, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core';
import { api } from '@/api/client';
import { keys } from '@/api/hooks';
import { APIError, type ContentVersion, type ContentVersionDetail, type Item, type Role } from '@/api/types';
import { prepareContentSave } from '@/features/content/content-save';
import { diffLines } from './version-diff';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function VersionHistoryDialog({ item, role, onClose, assetIds }: { item: Item; role: Role; onClose: () => void; assetIds?: () => string[] }) {
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [nextBefore, setNextBefore] = useState('');
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<ContentVersionDetail>();
  const [previous, setPrevious] = useState<ContentVersionDetail>();
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [copyTitle, setCopyTitle] = useState(`${item.title} 恢复副本`);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [boardPreview, setBoardPreview] = useState('');
  const navigate = useNavigate();
  const queries = useQueryClient();

  useEffect(() => {
    let active = true;
    void api.contentVersions(item.id).then((result) => {
      if (!active) return;
      setVersions(result.versions);
      setNextBefore(result.nextBefore);
      setSelected(result.versions[0]?.id ?? '');
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : '无法读取版本历史。');
    }).finally(() => { if (active) setLoadingList(false); });
    return () => { active = false; };
  }, [item.id]);

  useEffect(() => {
    if (!selected) { setDetail(undefined); setPrevious(undefined); return; }
    let active = true;
    setLoadingDetail(true);
    setError('');
    const index = versions.findIndex((version) => version.id === selected);
    void Promise.all([
      api.contentVersion(item.id, selected),
      index >= 0 && versions[index + 1] ? api.contentVersion(item.id, versions[index + 1].id) : Promise.resolve(undefined),
    ]).then(([current, before]) => {
      if (active) { setDetail(current); setPrevious(before); }
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : '无法读取所选版本。');
    }).finally(() => { if (active) setLoadingDetail(false); });
    return () => { active = false; };
  }, [item.id, selected, versions]);

  useEffect(() => {
    let active = true;
    let objectURL = '';
    setBoardPreview('');
    if (!detail?.whiteboard) return;
    void (async () => {
      try {
        const { exportToSvg } = await import('@excalidraw/excalidraw');
        const scene = JSON.parse(detail.whiteboard!.scene) as { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> };
        const svg = await exportToSvg({ elements: scene.elements as never[], appState: scene.appState as never, files: scene.files as never });
        if (!active) return;
        objectURL = URL.createObjectURL(new Blob([svg.outerHTML], { type: 'image/svg+xml' }));
        setBoardPreview(objectURL);
      } catch {
        if (active) setBoardPreview('error');
      }
    })();
    return () => { active = false; if (objectURL) URL.revokeObjectURL(objectURL); };
  }, [detail]);

  const comparison = useMemo(() => {
    if (!detail?.markdown) return undefined;
    return previous?.markdown ? diffLines(previous.markdown.markdown, detail.markdown.markdown) : undefined;
  }, [detail, previous]);

  const createVersion = async () => {
    if (!label.trim() || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15000);
      try { await prepareContentSave(item.id, role !== 'viewer', controller.signal); }
      finally { window.clearTimeout(timer); }
      const result = await api.createContentVersion(item.id, label.trim(), assetIds?.() ?? []);
      setVersions((current) => [result.version, ...current]);
      setSelected(result.version.id);
      setLabel('');
      setNotice('手动版本已保存。');
    } catch (failure) {
      setError(failure instanceof APIError ? failure.message : failure instanceof Error ? failure.message : '保存版本失败。');
    } finally { setBusy(false); }
  };

  const loadMore = async () => {
    if (!nextBefore || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api.contentVersions(item.id, nextBefore);
      setVersions((current) => [...current, ...result.versions]);
      setNextBefore(result.nextBefore);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '加载更多版本失败。'); }
    finally { setBusy(false); }
  };

  const restoreCopy = async () => {
    if (!detail || !copyTitle.trim() || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.restoreContentVersionCopy(item.id, detail.version.id, copyTitle.trim());
      await queries.invalidateQueries({ queryKey: keys.items(item.workspaceId) });
      await navigate({ to: '/workspace/$workspaceId/$itemId', params: { workspaceId: result.item.workspaceId, itemId: result.item.id } });
      onClose();
    } catch (failure) {
      setError(failure instanceof APIError ? failure.message : '恢复结果可能未确认。请先检查目录，再决定是否重试。');
    } finally { setBusy(false); }
  };

  return (
    <Modal opened title="版本历史" onClose={onClose} size="min(980px, 96vw)" closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack gap="md">
        {error && <Alert color="red" title="操作未完成">{error}</Alert>}
        {notice && <Alert color="green">{notice}</Alert>}
        {role !== 'viewer' && (
          <Group align="end">
            <TextInput label="版本名称" placeholder="例如：发布前" value={label} onChange={(event) => setLabel(event.currentTarget.value)} maxLength={120} style={{ flex: 1 }} disabled={busy} />
            <Button onClick={() => void createVersion()} disabled={!label.trim() || busy} loading={busy}>保存手动版本</Button>
          </Group>
        )}
        <Group align="stretch" wrap="nowrap" style={{ minHeight: 420 }}>
          <Stack w={290} gap="xs">
            <Text size="sm" fw={600}>检查点</Text>
            {loadingList ? <Loader size="sm" /> : versions.length === 0 ? <Text size="sm" c="dimmed">还没有版本记录。</Text> : (
              <ScrollArea h={370}>
                <Stack gap={6} pr="sm">
                  {versions.map((version) => (
                    <Button key={version.id} variant={selected === version.id ? 'light' : 'subtle'} color="gray" justify="space-between" onClick={() => setSelected(version.id)} styles={{ inner: { width: '100%' }, label: { width: '100%' } }}>
                      <Stack gap={2} align="flex-start" w="100%">
                        <Group gap="xs"><Badge size="xs" color={version.kind === 'manual' ? 'blue' : 'gray'}>{version.kind === 'manual' ? '手动' : '自动'}</Badge><Text size="sm" lineClamp={1}>{version.label || '自动保存'}</Text></Group>
                        <Text size="xs" c="dimmed">{formatDate(version.createdAt)}</Text>
                      </Stack>
                    </Button>
                  ))}
                  {nextBefore && <Button variant="default" size="xs" onClick={() => void loadMore()} loading={busy}>加载更早版本</Button>}
                </Stack>
              </ScrollArea>
            )}
          </Stack>
          <Stack style={{ flex: 1, minWidth: 0 }} gap="xs">
            {loadingDetail ? <Loader size="sm" /> : detail ? (
              <>
                <Group justify="space-between"><Text fw={600}>{detail.version.label || '自动保存'}</Text><Text size="xs" c="dimmed">{formatDate(detail.version.createdAt)} · {Math.ceil(detail.version.payloadBytes / 1024)} KiB</Text></Group>
                {detail.markdown && (
                  <>
                    {comparison && <Text size="sm" c="dimmed">与更早一个检查点的差异</Text>}
                    {comparison ? (
                      <ScrollArea h={180} type="auto" offsetScrollbars>
                        <Code block style={{ whiteSpace: 'pre', color: 'inherit' }}>
                          {comparison.map((line, index) => `${line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}${line.text}`).join('\n') || '两个版本没有变化。'}
                        </Code>
                      </ScrollArea>
                    ) : <Text size="sm" c="dimmed">这是当前加载范围内最早的版本，下面显示该版本正文。</Text>}
                    <ScrollArea h={180} type="auto" offsetScrollbars><Code block style={{ whiteSpace: 'pre-wrap', color: 'inherit' }}>{detail.markdown.markdown}</Code></ScrollArea>
                  </>
                )}
                {detail.whiteboard && (
                  <>
                    {boardPreview && boardPreview !== 'error' ? <img src={boardPreview} alt="白板版本预览" style={{ maxWidth: '100%', maxHeight: 350, objectFit: 'contain', border: '1px solid var(--mantine-color-default-border)' }} /> : <Text size="sm" c="dimmed">{boardPreview === 'error' ? '无法生成白板预览。' : '正在生成白板预览…'}</Text>}
                    <Text size="xs" c="dimmed">场景版本 {detail.whiteboard.revision} · 保留附件 {detail.assetIds.length} 项</Text>
                  </>
                )}
                {role !== 'viewer' && (
                  <Group align="end" mt="auto">
                    <TextInput label="恢复副本名称" value={copyTitle} onChange={(event) => setCopyTitle(event.currentTarget.value)} style={{ flex: 1 }} disabled={busy} />
                    <Button variant="default" onClick={() => void restoreCopy()} disabled={!copyTitle.trim() || busy} loading={busy}>恢复为新副本</Button>
                  </Group>
                )}
              </>
            ) : <Text size="sm" c="dimmed">选择一个检查点查看内容。</Text>}
          </Stack>
        </Group>
      </Stack>
    </Modal>
  );
}
