import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Modal,
  Select,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { request } from '@/api/client';
import { keys } from '@/api/hooks';
import { APIError, type Item } from '@/api/types';
import { documentTemplates } from './document-templates';

export function CreateDocument({
  workspaceId,
  parentId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  parentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('blank');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitted = useRef(false);
  const created = useRef<Item>();
  const queries = useQueryClient();
  const navigate = useNavigate();
  const selected = documentTemplates.find((entry) => entry.id === template)!;
  const save = async () => {
    if (submitted.current || !title.trim()) return;
    submitted.current = true;
    setBusy(true);
    setError('');
    let posting = false;
    try {
      if (!created.current) {
        const initialMarkdown = selected.markdown
          ? await (
              await import('@/features/markdown/markdown-template')
            ).compileTemplate(selected.markdown)
          : undefined;
        posting = true;
        created.current = await request<Item>(
          `/workspaces/${workspaceId}/items`,
          {
            method: 'POST',
            body: JSON.stringify({
              type: 'markdown',
              title,
              parentId,
              initialMarkdown,
            }),
          },
        );
        void queries.invalidateQueries({ queryKey: keys.items(workspaceId) });
      }
      await navigate({
        to: '/workspace/$workspaceId/$itemId',
        params: { workspaceId, itemId: created.current.id },
      });
      onCreated();
      onClose();
    } catch (failure) {
      setError(
        created.current
          ? '文档已创建，打开失败。请重试打开或从目录选择。'
          : failure instanceof APIError
            ? failure.message
            : posting
              ? '创建结果未确认，请检查目录后再重试。'
              : '模板准备失败，尚未创建文档，请重试。',
      );
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      opened
      title="新建文档"
      onClose={onClose}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
    >
      <Stack>
        <TextInput
          label="名称"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          disabled={busy || !!created.current}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing)
              void save();
          }}
        />
        <Select
          label="初始内容"
          value={template}
          onChange={(value) => setTemplate(value ?? 'blank')}
          data={documentTemplates.map((entry) => ({
            value: entry.id,
            label: entry.label,
          }))}
          disabled={busy || !!created.current}
        />
        {selected.markdown && (
          <Textarea
            label="模板预览"
            value={selected.markdown}
            readOnly
            autosize
            minRows={5}
            maxRows={8}
          />
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Button
          loading={busy}
          disabled={!title.trim()}
          onClick={() => void save()}
        >
          {created.current ? '打开文档' : '保存'}
        </Button>
      </Stack>
    </Modal>
  );
}
