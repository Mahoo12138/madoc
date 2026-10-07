import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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

const NAME_MAX = 80;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/png', 'image/jpeg'];

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
  // Without a reset the file input keeps its value, so choosing the same image
  // twice in a row fires no change event and the second pick looks ignored.
  const fileInput = useRef<() => void>(null);
  const dirty = name !== user.name || avatar !== undefined;
  const nameLength = [...name].length;
  const nameError =
    name.length > 0 && !name.trim()
      ? '显示名称不能只包含空格'
      : nameLength > NAME_MAX
        ? `显示名称不能超过 ${NAME_MAX} 个字符，当前 ${nameLength} 个`
        : null;

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
    if (!trimmed || nameError) {
      setError(nameError ?? '显示名称不能为空');
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
    // Reset first so re-picking the same file still reports a change.
    fileInput.current?.();
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      setError('请选择 PNG 或 JPEG 图片');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError(
        `图片大小为 ${(file.size / 1024 / 1024).toFixed(1)}MB，请选择不超过 2MB 的图片`,
      );
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
                    resetRef={fileInput}
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
                    onClick={() => {
                      setAvatar(null);
                      setError('');
                    }}
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
              onChange={(event) => {
                setName(event.currentTarget.value);
                if (error) setError('');
              }}
              onKeyDown={(event) => {
                // Enter confirms an IME candidate; submitting there would save
                // a partially composed name.
                if (
                  event.key === 'Enter' &&
                  !event.nativeEvent.isComposing &&
                  dirty
                )
                  void save();
              }}
              error={nameError ?? undefined}
              description={`用于成员列表和协作身份 · ${nameLength} / ${NAME_MAX} 字`}
              autoFocus
            />
            <div className={styles.actions}>
              <Button variant="default" disabled={busy} onClick={requestClose}>
                取消
              </Button>
              <Button
                type="submit"
                loading={busy}
                disabled={!dirty || !!nameError}
              >
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
