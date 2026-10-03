import { Alert, Button, Modal, Stack, TextInput } from '@mantine/core';
import * as styles from './version-history-dialog.css';

export function VersionActionDialog({
  opened,
  title,
  inputLabel,
  value,
  submitLabel,
  pending,
  error,
  onChange,
  onSubmit,
  onClose,
  maxLength,
}: {
  opened: boolean;
  title: string;
  inputLabel: string;
  value: string;
  submitLabel: string;
  pending: boolean;
  error: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  maxLength?: number;
}) {
  return (
    <Modal
      opened={opened}
      title={title}
      onClose={() => !pending && onClose()}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
      size="sm"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Stack gap="md">
          {error && (
            <Alert color="red" title="操作未完成">
              {error}
            </Alert>
          )}
          <TextInput
            label={inputLabel}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            maxLength={maxLength}
            disabled={pending}
            data-autofocus
          />
          <div className={styles.formActions}>
            <Button variant="default" onClick={onClose} disabled={pending}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={!value.trim() || pending}
              loading={pending}
            >
              {submitLabel}
            </Button>
          </div>
        </Stack>
      </form>
    </Modal>
  );
}
