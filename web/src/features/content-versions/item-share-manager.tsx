import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  CopyButton,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  Check as IconCheck,
  Copy as IconCopy,
  Link as IconLink,
  Trash as IconTrash,
} from 'lucide-react';
import { api } from '@/api/client';
import type { ContentVersion, Item, ItemShare } from '@/api/types';
import { EmptyState } from '@/features/shared/empty-state';
import * as styles from './version-history-dialog.css';

function date(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ItemShareManager({
  item,
  versions,
  selectedVersionId,
  onSelectVersion,
  onCloseBlockedChange,
}: {
  item: Item;
  versions: ContentVersion[];
  selectedVersionId: string;
  onSelectVersion: (id: string) => void;
  onCloseBlockedChange: (blocked: boolean) => void;
}) {
  const [shares, setShares] = useState<ItemShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [oneTimeLink, setOneTimeLink] = useState('');
  const [error, setError] = useState('');
  const [revoke, setRevoke] = useState<ItemShare>();
  const [creating, setCreating] = useState(false);
  const selected = versions.find((version) => version.id === selectedVersionId);
  const reload = async () => {
    const result = await api.itemShares(item.id);
    setShares(result.shares);
  };

  useEffect(() => {
    onCloseBlockedChange(busy || creating || Boolean(revoke));
    return () => onCloseBlockedChange(false);
  }, [busy, creating, revoke, onCloseBlockedChange]);

  useEffect(() => {
    let active = true;
    void api
      .itemShares(item.id)
      .then((result) => {
        if (active) setShares(result.shares);
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : '无法读取分享记录。',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item.id]);

  const create = async () => {
    if (!selected || selected.kind !== 'manual' || busy) return;
    setBusy(true);
    setError('');
    setOneTimeLink('');
    try {
      const result = await api.createItemShare(
        item.id,
        selected.id,
        expiresAt ? new Date(expiresAt).toISOString() : undefined,
      );
      setOneTimeLink(`${location.origin}${result.url}`);
      setExpiresAt('');
      setCreating(false);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '创建分享失败。');
    } finally {
      setBusy(false);
    }
  };

  const publish = async (share: ItemShare) => {
    if (!selected || selected.kind !== 'manual' || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.publishItemShare(item.id, share.id, selected.id);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '发布更新失败。');
    } finally {
      setBusy(false);
    }
  };

  const revokeShare = async () => {
    if (!revoke || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.revokeItemShare(item.id, revoke.id);
      setRevoke(undefined);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '撤销分享失败。');
    } finally {
      setBusy(false);
    }
  };

  const active = (share: ItemShare) =>
    !share.revokedAt &&
    (!share.expiresAt || new Date(share.expiresAt).getTime() > Date.now());
  const closeCreate = () => {
    if (!busy) {
      setCreating(false);
      setExpiresAt('');
      setError('');
    }
  };
  return (
    <section className={styles.sharePanel} aria-label="只读分享与发布">
      <div className={styles.shareHeader}>
        <Text size="sm" c="dimmed">
          只发布已保存的手动版本。后续编辑不会自动更新分享内容；选择另一个手动版本并点击“发布更新”才会替换外部看到的版本。
        </Text>
        <Select
          className={styles.shareSelector}
          label="发布版本"
          placeholder="选择已保存的手动版本"
          value={selected?.kind === 'manual' ? selected.id : null}
          data={versions
            .filter((version) => version.kind === 'manual')
            .map((version) => ({
              value: version.id,
              label: `${version.label} · ${date(version.createdAt)}`,
            }))}
          onChange={(value) => value && onSelectVersion(value)}
          disabled={busy}
          searchable
          allowDeselect={false}
        />
        <div className={styles.shareActions}>
          <Button
            variant="light"
            leftSection={<IconLink size={16} aria-hidden />}
            className={styles.action}
            onClick={() => {
              setError('');
              setCreating(true);
            }}
            disabled={!selected || selected.kind !== 'manual' || busy}
          >
            新建分享
          </Button>
          {selected?.kind !== 'manual' && (
            <Text size="xs" c="dimmed">
              自动版本不能公开；请选择手动版本。
            </Text>
          )}
        </div>
      </div>
      {error && !creating && !revoke && (
        <Alert color="red" title="操作未完成" mb="md">
          {error}
        </Alert>
      )}
      {oneTimeLink && (
        <Alert color="green" title="分享已创建" mb="md">
          链接密钥只显示在这里一次。请复制并妥善保存；若遗失，可撤销后重新创建。
          <div className={styles.shareLink}>
            <TextInput aria-label="分享链接" value={oneTimeLink} readOnly />
            <CopyButton value={oneTimeLink}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? '已复制' : '复制链接'}>
                  <ActionIcon
                    aria-label={copied ? '已复制' : '复制链接'}
                    variant="light"
                    size={36}
                    onClick={copy}
                  >
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </div>
        </Alert>
      )}
      {loading ? (
        <Text size="sm" c="dimmed" role="status">
          正在读取分享…
        </Text>
      ) : shares.length === 0 ? (
        <EmptyState
          icon={IconLink}
          title="还没有分享链接"
          description="选择一个手动版本后新建分享，即可生成只读链接。链接可随时撤销，也可以设置到期时间。"
        />
      ) : (
        shares.map((share) => (
          <div key={share.id} className={styles.shareRow}>
            <div className={styles.shareIdentity}>
              <Group gap="xs">
                <Badge color={active(share) ? 'green' : 'gray'}>
                  {active(share)
                    ? '有效'
                    : share.revokedAt
                      ? '已撤销'
                      : '已过期'}
                </Badge>
              </Group>
              <Text size="sm" fw={500} className={styles.shareName}>
                <bdi>{share.versionName}</bdi>
              </Text>
              <Text size="xs" c="dimmed">
                发布于 {date(share.updatedAt)}
                {share.expiresAt
                  ? ` · 到期 ${date(share.expiresAt)}`
                  : ' · 不设有效期'}
              </Text>
            </div>
            {active(share) && (
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  className={styles.action}
                  variant="light"
                  disabled={
                    busy ||
                    !selected ||
                    selected.kind !== 'manual' ||
                    share.versionId === selected.id
                  }
                  onClick={() => void publish(share)}
                >
                  发布更新
                </Button>
                <Tooltip label="撤销分享">
                  <ActionIcon
                    aria-label="撤销分享"
                    color="red"
                    variant="subtle"
                    disabled={busy}
                    onClick={() => setRevoke(share)}
                  >
                    <IconTrash size={15} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )}
          </div>
        ))
      )}
      <Modal
        opened={creating}
        onClose={closeCreate}
        title="新建只读分享"
        size="sm"
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Stack gap="md">
            {error && (
              <Alert color="red" title="操作未完成">
                {error}
              </Alert>
            )}
            <TextInput
              label="有效期（可选）"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.currentTarget.value)}
              disabled={busy}
              data-autofocus
            />
            <div className={styles.formActions}>
              <Button variant="default" disabled={busy} onClick={closeCreate}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={!selected || selected.kind !== 'manual' || busy}
                loading={busy}
              >
                创建只读分享
              </Button>
            </div>
          </Stack>
        </form>
      </Modal>
      <Modal
        opened={Boolean(revoke)}
        onClose={() => !busy && setRevoke(undefined)}
        title="撤销分享？"
        centered
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          {error && (
            <Alert color="red" title="操作未完成">
              {error}
            </Alert>
          )}
          <Text size="sm">
            撤销后，新请求将无法读取这条分享的内容和附件。已经下载的副本无法收回。
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setRevoke(undefined)}
              disabled={busy}
            >
              取消
            </Button>
            <Button
              color="red"
              onClick={() => void revokeShare()}
              loading={busy}
              disabled={busy}
            >
              撤销分享
            </Button>
          </Group>
        </Stack>
      </Modal>
    </section>
  );
}
