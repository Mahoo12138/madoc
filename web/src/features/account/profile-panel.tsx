import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  FileButton,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { accountAPI } from '@/api/account';
import type { User } from '@/api/types';
import * as styles from './account.css';

export type ProfileHandle = { save: () => Promise<boolean> };

export const ProfilePanel = forwardRef<
  ProfileHandle,
  {
    user: User;
    onUser: (user: User) => void;
    onDirty: (dirty: boolean) => void;
    onBusy: (busy: boolean) => void;
    onEditingChange: (editing: boolean) => void;
  }
>(function ProfilePanel(
  { user, onUser, onDirty, onBusy, onEditingChange },
  ref,
) {
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState<File | null | undefined>();
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = name !== user.name || avatar !== undefined;

  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  useEffect(() => {
    onEditingChange(editing);
    return () => onEditingChange(false);
  }, [editing, onEditingChange]);

  useEffect(() => {
    if (!avatar) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(avatar);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);

  const discard = () => {
    setName(user.name);
    setAvatar(undefined);
    setError('');
    setConfirmDiscard(false);
    setEditing(false);
  };

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else discard();
  };

  const save = async () => {
    if (busy) return false;
    const trimmed = name.trim();
    if (!trimmed || [...trimmed].length > 80) {
      setError('显示名称需为 1–80 个字符');
      return false;
    }
    setBusy(true);
    onBusy(true);
    setError('');
    let avatarSaved = false;
    try {
      if (avatar !== undefined) {
        onUser(
          avatar === null
            ? await accountAPI.removeAvatar()
            : await accountAPI.avatar(avatar),
        );
        setAvatar(undefined);
        avatarSaved = true;
      }
      if (trimmed !== user.name) onUser(await accountAPI.rename(trimmed));
      setName(trimmed);
      onDirty(false);
      setConfirmDiscard(false);
      setEditing(false);
      return true;
    } catch {
      setError(
        avatarSaved
          ? '头像已保存，名称保存失败。草稿已保留，请重试。'
          : '保存失败，草稿已保留，请检查网络后重试。',
      );
      return false;
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  useImperativeHandle(ref, () => ({ save }));

  const selectFile = (file: File | null) => {
    if (!file) return;
    if (
      !['image/png', 'image/jpeg'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError('请选择不超过 2MB 的 PNG 或 JPEG 图片');
      return;
    }
    setAvatar(file);
    setError('');
  };

  return (
    <>
      <div className={styles.profile}>
        <div>
          <Text fw={650} size="lg">
            个人资料
          </Text>
          <Text size="sm" c="dimmed">
            让协作者更容易认出你。
          </Text>
        </div>
        <div className={styles.avatarRow}>
          <Avatar src={user.avatarUrl} size={72} radius="50%" alt="当前头像">
            {[...user.name][0]}
          </Avatar>
          <div className={styles.profileValue}>
            <Text size="sm" fw={600}>
              显示名称
            </Text>
            <Text size="sm">{user.name}</Text>
          </div>
        </div>
        <div className={styles.profileValue}>
          <Text size="sm" fw={600}>
            登录邮箱
          </Text>
          <Text size="sm">{user.email}</Text>
          <Text size="xs" c="dimmed">
            用于登录和接收邀请，此处不可修改
          </Text>
        </div>
        <Button
          variant="default"
          className={styles.editButton}
          onClick={() => setEditing(true)}
        >
          编辑资料
        </Button>
      </div>

      <Modal
        opened={editing}
        onClose={requestClose}
        title="编辑个人资料"
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
        withCloseButton={!busy}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Stack gap="lg">
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            <div className={styles.avatarRow}>
              <Avatar
                src={avatar === null ? null : (preview ?? user.avatarUrl)}
                size={72}
                radius="50%"
                alt="头像预览"
              >
                {[...user.name][0]}
              </Avatar>
              <Stack gap="xs">
                <Group gap="xs">
                  <FileButton
                    onChange={selectFile}
                    accept="image/png,image/jpeg"
                  >
                    {(props) => (
                      <Button {...props} variant="default" disabled={busy}>
                        更换头像
                      </Button>
                    )}
                  </FileButton>
                  <Button
                    variant="subtle"
                    disabled={busy || (!user.avatarUrl && !avatar)}
                    onClick={() => setAvatar(null)}
                  >
                    恢复默认
                  </Button>
                </Group>
                <Text size="xs" c="dimmed">
                  PNG / JPEG，最大 2MB · 居中裁切
                </Text>
              </Stack>
            </div>
            <TextInput
              label="显示名称"
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.currentTarget.value)}
              description="用于成员列表和协作身份"
              autoFocus
            />
            <div className={styles.actions}>
              <Button variant="default" disabled={busy} onClick={requestClose}>
                取消
              </Button>
              <Button type="submit" loading={busy} disabled={!dirty}>
                保存更改
              </Button>
            </div>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={confirmDiscard}
        onClose={() => !busy && setConfirmDiscard(false)}
        title="保存个人资料？"
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
      >
        <Stack>
          <Text size="sm">
            你有尚未保存的资料更改。放弃仅会丢弃这些更改，已保存的头像仍会保留。
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={busy}
              onClick={() => setConfirmDiscard(false)}
            >
              继续编辑
            </Button>
            <Button variant="subtle" disabled={busy} onClick={discard}>
              放弃更改
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                setConfirmDiscard(false);
                void save();
              }}
            >
              保存更改
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
});
