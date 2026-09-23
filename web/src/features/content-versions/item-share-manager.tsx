import { useEffect, useState } from 'react';
import { Alert, Badge, Button, CopyButton, Group, Modal, Paper, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { Check as IconCheck, Copy as IconCopy, Link as IconLink, Trash as IconTrash } from 'lucide-react';
import { api } from '@/api/client';
import type { ContentVersion, Item, ItemShare } from '@/api/types';

function date(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ItemShareManager({ item, versions, selectedVersionId }: { item: Item; versions: ContentVersion[]; selectedVersionId: string }) {
  const [shares, setShares] = useState<ItemShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [oneTimeLink, setOneTimeLink] = useState('');
  const [error, setError] = useState('');
  const [revoke, setRevoke] = useState<ItemShare>();
  const selected = versions.find((version) => version.id === selectedVersionId);
  const reload = async () => {
    const result = await api.itemShares(item.id);
    setShares(result.shares);
  };

  useEffect(() => {
    let active = true;
    void api.itemShares(item.id).then((result) => { if (active) setShares(result.shares); })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : '无法读取分享记录。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [item.id]);

  const create = async () => {
    if (!selected || selected.kind !== 'manual' || busy) return;
    setBusy(true); setError(''); setOneTimeLink('');
    try {
      const result = await api.createItemShare(item.id, selected.id, expiresAt ? new Date(expiresAt).toISOString() : undefined);
      setOneTimeLink(`${location.origin}${result.url}`);
      setExpiresAt('');
      await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '创建分享失败。'); }
    finally { setBusy(false); }
  };

  const publish = async (share: ItemShare) => {
    if (!selected || selected.kind !== 'manual' || busy) return;
    setBusy(true); setError('');
    try { await api.publishItemShare(item.id, share.id, selected.id); await reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '发布更新失败。'); }
    finally { setBusy(false); }
  };

  const revokeShare = async () => {
    if (!revoke || busy) return;
    setBusy(true); setError('');
    try { await api.revokeItemShare(item.id, revoke.id); setRevoke(undefined); await reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '撤销分享失败。'); }
    finally { setBusy(false); }
  };

  const active = (share: ItemShare) => !share.revokedAt && (!share.expiresAt || new Date(share.expiresAt).getTime() > Date.now());
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group gap="xs"><IconLink size={16} /><Text fw={600}>只读分享与发布</Text></Group>
        <Text size="sm" c="dimmed">只发布已保存的手动版本。后续编辑不会自动更新分享内容；选择另一个手动版本并点击“发布更新”才会替换外部看到的版本。</Text>
        {error && <Alert color="red" title="操作未完成">{error}</Alert>}
        {oneTimeLink && <Alert color="green" title="分享已创建">链接密钥只显示在这里一次。请复制并妥善保存；若遗失，可撤销后重新创建。<Group wrap="nowrap" mt="xs"><TextInput value={oneTimeLink} readOnly style={{ flex: 1 }} /><CopyButton value={oneTimeLink}>{({ copied, copy }) => <Tooltip label={copied ? '已复制' : '复制链接'}><Button variant="light" onClick={copy}>{copied ? <IconCheck size={16} /> : <IconCopy size={16} />}</Button></Tooltip>}</CopyButton></Group></Alert>}
        <Group align="end" wrap="wrap">
          <TextInput label="有效期（可选）" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.currentTarget.value)} disabled={busy} />
          <Button onClick={() => void create()} disabled={!selected || selected.kind !== 'manual' || busy} loading={busy}>创建只读分享</Button>
        </Group>
        {selected && selected.kind !== 'manual' && <Text size="xs" c="orange">自动版本不能公开；请选择手动版本。</Text>}
        {loading ? <Text size="sm" c="dimmed">正在读取分享…</Text> : shares.length === 0 ? <Text size="sm" c="dimmed">还没有分享链接。</Text> : (
          <Stack gap="xs">
            {shares.map((share) => (
              <Group key={share.id} justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Group gap="xs"><Badge color={active(share) ? 'green' : 'gray'}>{active(share) ? '有效' : share.revokedAt ? '已撤销' : '已过期'}</Badge><Text size="sm" fw={500} lineClamp={1}>{share.versionName}</Text></Group>
                  <Text size="xs" c="dimmed">发布于 {date(share.updatedAt)}{share.expiresAt ? ` · 到期 ${date(share.expiresAt)}` : ' · 不设有效期'}</Text>
                </Stack>
                {active(share) && <Group gap="xs" wrap="nowrap"><Button size="xs" variant="light" disabled={busy || !selected || selected.kind !== 'manual' || share.versionId === selected.id} onClick={() => void publish(share)}>发布更新</Button><Button aria-label="撤销分享" size="xs" color="red" variant="subtle" disabled={busy} onClick={() => setRevoke(share)}><IconTrash size={15} /></Button></Group>}
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
      <Modal opened={Boolean(revoke)} onClose={() => !busy && setRevoke(undefined)} title="撤销分享？" centered>
        <Stack><Text size="sm">撤销后，新请求将无法读取这条分享的内容和附件。已经下载的副本无法收回。</Text><Group justify="flex-end"><Button variant="default" onClick={() => setRevoke(undefined)} disabled={busy}>取消</Button><Button color="red" onClick={() => void revokeShare()} loading={busy}>撤销分享</Button></Group></Stack>
      </Modal>
    </Paper>
  );
}
