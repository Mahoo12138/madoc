import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
} from '@mantine/core';
import { accountAPI } from '@/api/account';
import { APIError } from '@/api/types';
import * as styles from './account.css';

const PASSWORD_MIN = 8;
// bcrypt hashes at most 72 bytes; anything longer is silently truncated by the
// server, so the limit has to be stated before the user picks a longer password.
const PASSWORD_MAX_BYTES = 72;
const passwordBytes = (value: string) => new TextEncoder().encode(value).length;

export function SecurityPanel({
  onBusy,
  onEditingChange,
  onDirty,
}: {
  onBusy: (busy: boolean) => void;
  onEditingChange: (editing: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [editing, setEditing] = useState(false);
  // Only flag a mismatch once both fields have content, so the form does not
  // shout at the user while they are still typing the first one.
  const mismatch = confirmation.length > 0 && next !== confirmation;
  const tooLong = passwordBytes(next) > PASSWORD_MAX_BYTES;
  const tooShort = next.length > 0 && next.length < PASSWORD_MIN;
  const nextError = tooLong
    ? `新密码为 ${passwordBytes(next)} 字节，超过 ${PASSWORD_MAX_BYTES} 字节上限`
    : tooShort
      ? `新密码至少需要 ${PASSWORD_MIN} 个字符`
      : mismatch
        ? '两次输入的新密码不一致'
        : null;

  useEffect(() => {
    onEditingChange(editing);
    return () => onEditingChange(false);
  }, [editing, onEditingChange]);

  useEffect(() => {
    onDirty(!!(current || next || confirmation));
  }, [current, next, confirmation, onDirty]);

  useEffect(() => () => onDirty(false), [onDirty]);

  const close = () => {
    if (busy) return;
    setCurrent('');
    setNext('');
    setConfirmation('');
    setError('');
    setEditing(false);
  };

  const submit = async () => {
    if (busy) return;
    setError('');
    setSuccess(false);
    if (nextError) {
      setError(nextError);
      return;
    }
    if (!current) {
      setError('请输入当前密码');
      return;
    }
    setBusy(true);
    onBusy(true);
    try {
      await accountAPI.password(current, next);
      setCurrent('');
      setNext('');
      setConfirmation('');
      setSuccess(true);
      setEditing(false);
    } catch (error) {
      setError(
        error instanceof APIError && error.code === 'INCORRECT_PASSWORD'
          ? '当前密码不正确'
          : '修改失败，请检查网络后重试',
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <>
      <Stack gap="lg">
        <div>
          <Text fw={650} size="lg">
            账号安全
          </Text>
          <Text size="sm" c="dimmed">
            修改后，此浏览器保持登录，其他设备需要重新登录。
          </Text>
        </div>
        {success && (
          <Alert color="green" role="status">
            密码已修改，其他设备已退出登录。
          </Alert>
        )}
        <Button
          variant="default"
          className={styles.editButton}
          onClick={() => {
            setSuccess(false);
            setEditing(true);
          }}
        >
          修改密码
        </Button>
      </Stack>

      <Modal
        opened={editing}
        onClose={close}
        title="修改密码"
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
        withCloseButton={!busy}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Stack gap="lg">
            {error && (
              <Alert role="alert" color="red">
                {error}
              </Alert>
            )}
            <PasswordInput
              label="当前密码"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.currentTarget.value)}
              disabled={busy}
              autoFocus
            />
            <PasswordInput
              label="新密码"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.currentTarget.value)}
              disabled={busy}
              error={nextError ?? undefined}
              description={`至少 ${PASSWORD_MIN} 个字符，最多 ${PASSWORD_MAX_BYTES} 字节（中文与 emoji 按字节计）`}
            />
            <PasswordInput
              label="确认新密码"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              disabled={busy}
              error={mismatch ? '两次输入的新密码不一致' : undefined}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close} disabled={busy}>
                取消
              </Button>
              <Button
                type="submit"
                loading={busy}
                disabled={!current || !next || !confirmation || !!nextError}
              >
                保存密码
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
