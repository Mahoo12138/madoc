import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { request } from '@/api/client';
import { keys } from '@/api/hooks';
import { APIError, type Item } from '@/api/types';

const maxCreateRequestBytes = 2 * 1024 * 1024 - 1;

export function MarkdownImportDialog({
  file,
  workspaceId,
  parentId,
  onClose,
}: {
  file?: File;
  workspaceId: string;
  parentId: string | null;
  onClose: () => void;
}) {
  const [markdown, setMarkdown] = useState('');
  const [title, setTitle] = useState('');
  const [reading, setReading] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const created = useRef<Item>();
  const queries = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    created.current = undefined;
    setError('');
    setMarkdown('');
    setReady(false);
    setTitle(file?.name.replace(/\.(?:md|markdown)$/i, '') ?? '');
    if (!file) { setReading(false); return; }
    if (!/\.(?:md|markdown)$/i.test(file.name)) {
      setError('目前只支持 Markdown 文件（.md 或 .markdown）。');
      setReading(false);
      return;
    }
    if (file.size > maxCreateRequestBytes) {
      setError('文件超过当前 2 MiB 请求上限，尚未读取或创建。请拆分文件后再导入。');
      setReading(false);
      return;
    }
    setReading(true);
    void file.text().then((text) => {
      if (active) { setMarkdown(text); setReady(true); }
    }).catch(() => {
      if (active) setError('无法读取这个文件，请选择其他 Markdown 文件。');
    }).finally(() => {
      if (active) setReading(false);
    });
    return () => { active = false; };
  }, [file]);

  const save = async () => {
    if (!file || !title.trim() || reading || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    let posting = false;
    try {
      if (!created.current) {
        const initialMarkdown = await (
          await import('./markdown-template')
        ).compileMarkdownSnapshot(markdown);
        const body = {
          type: 'markdown',
          title: title.trim(),
          parentId,
          initialMarkdown,
        };
        if (new TextEncoder().encode(JSON.stringify(body)).byteLength > maxCreateRequestBytes) {
          throw new Error('该文件转换后的内容超过当前导入限制，请拆分文件后再导入。');
        }
        posting = true;
        created.current = await request<Item>(`/workspaces/${workspaceId}/items`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        void queries.invalidateQueries({ queryKey: keys.items(workspaceId) });
      }
      await navigate({
        to: '/workspace/$workspaceId/$itemId',
        params: { workspaceId, itemId: created.current.id },
      });
      onClose();
    } catch (failure) {
      setError(created.current
        ? '文档已创建，但打开失败。可重试打开，也可以从目录中选择。'
        : failure instanceof APIError
          ? failure.message
          : posting
            ? '创建结果未确认，请先检查目录；确认未创建后再重试。'
            : failure instanceof Error
              ? failure.message
              : '导入失败，请重试。');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={Boolean(file)}
      title="导入 Markdown 预览"
      onClose={onClose}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
    >
      <Stack>
        <TextInput
          label="新文档名称"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          disabled={busy || !!created.current}
          autoFocus
        />
        <Text size="sm" c="dimmed">文件：{file?.name ?? ''}</Text>
        {reading ? <Text size="sm">正在读取文件…</Text> : (
          <Textarea
            label="内容预览"
            value={markdown}
            readOnly
            autosize
            minRows={6}
            maxRows={14}
          />
        )}
        <Text size="sm" c="blue.7">
          导入会在当前文件夹中新建文档，不会覆盖当前文档。此入口只导入 Markdown 文本，不包含图片附件；ZIP 资源包导入后续支持。
        </Text>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Button
          loading={busy}
          disabled={reading || !ready || !title.trim()}
          onClick={() => void save()}
        >
          {created.current ? '重新打开文档' : '创建为新文档'}
        </Button>
      </Stack>
    </Modal>
  );
}
