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
    if (next.length < 8 || new TextEncoder().encode(next).length > 72) {
      setError('新密码至少 8 个字符，且不超过 72 字节');
      return;
    }
    if (next !== confirmation) {
      setError('两次输入的新密码不一致');
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
            />
            <PasswordInput
              label="确认新密码"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              disabled={busy}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close} disabled={busy}>
                取消
              </Button>
              <Button
                type="submit"
                loading={busy}
                disabled={!current || !next || !confirmation}
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
