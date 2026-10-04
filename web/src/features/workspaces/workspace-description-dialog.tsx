import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Textarea } from "@mantine/core";
import * as styles from "./workspace-management.css";

export function WorkspaceDescriptionDialog({
  description,
  opened,
  busy,
  blocked,
  error,
  onClose,
  onSave,
}: {
  description: string;
  opened: boolean;
  busy: boolean;
  blocked: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (description: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(description);
  const submitting = useRef(false);
  useEffect(() => {
    if (!opened) setDraft(description);
  }, [description, opened]);
  const value = draft.trim();
  const length = Array.from(value).length;
  const canSave = length <= 500 && value !== description;
  const close = () => {
    if (!busy && !submitting.current) onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="编辑工作区介绍"
      centered
      closeOnClickOutside={!busy && !blocked}
      closeOnEscape={!busy && !blocked}
      trapFocus={!blocked}
      withCloseButton={!busy}
      classNames={{ content: styles.dialogContent }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canSave || busy || submitting.current) return;
          submitting.current = true;
          try {
            await onSave(value);
          } catch {
            /* The parent mutation keeps the error visible and the draft available for retry. */
          } finally {
            submitting.current = false;
          }
        }}
      >
        <Textarea
          data-autofocus
          label="工作区介绍"
          description={`简要说明工作区的用途，留空可清除介绍。${length} / 500 字`}
          placeholder="例如：记录项目文档、会议笔记和设计白板"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          autosize
          minRows={4}
          maxRows={8}
          disabled={busy}
          error={length > 500 ? "介绍不能超过 500 字" : undefined}
        />
        {error && (
          <Alert color="red" role="alert" mt="md">
            {error}
          </Alert>
        )}
        <div className={styles.formActions}>
          <Button variant="default" onClick={close} disabled={busy}>
            取消
          </Button>
          <Button type="submit" disabled={!canSave || busy} loading={busy}>
            保存介绍
          </Button>
        </div>
      </form>
    </Modal>
  );
}
