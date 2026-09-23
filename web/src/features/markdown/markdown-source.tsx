import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { downloadMarkdown } from './markdown-export';
import * as styles from './markdown-source.css';

export type SourceSnapshot = {
  markdown: string;
  pending: boolean;
  online: boolean;
  stopped: boolean;
};
export function MarkdownSource({
  title,
  read,
  onClose,
}: {
  title: string;
  read: () => SourceSnapshot;
  onClose: () => void;
}) {
  const capture = () => {
    try {
      return { value: read(), error: '' };
    } catch (error) {
      return {
        value: undefined,
        error:
          error instanceof Error ? error.message : '源码读取失败，请重试。',
      };
    }
  };
  const [snapshot, setSnapshot] = useState(capture);
  const [message, setMessage] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const mobile = useMediaQuery('(max-width: 48em)');
  const value = snapshot.value;
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.markdown);
      setMessage('源码已复制。');
    } catch {
      field.current?.focus();
      field.current?.select();
      setMessage('浏览器未允许访问剪贴板，已选中源码，请手动复制。');
    }
  };
  return (
    <Modal
      opened
      onClose={onClose}
      title="Markdown 源码"
      size="xl"
      fullScreen={mobile}
    >
      <Stack>
        <Text size="sm">
          只读显示当前编辑器的正文快照。刷新后查看最新内容，复制与下载均使用下方所示源码。
        </Text>
        {value && (value.pending || value.stopped || !value.online) && (
          <Alert color="orange">
            此快照可能包含尚未同步的修改，请保留本地副本。
          </Alert>
        )}
        {snapshot.error && <Alert color="red">{snapshot.error}</Alert>}
        <Textarea
          label="只读源码"
          value={value?.markdown ?? ''}
          readOnly
          ref={field}
          classNames={{ input: styles.source }}
          spellCheck={false}
        />
        <Group>
          <Button
            variant="default"
            onClick={() => {
              setSnapshot(capture());
              setMessage('');
            }}
          >
            刷新源码
          </Button>
          <Button disabled={!value} onClick={() => void copy()}>
            复制源码
          </Button>
          <Button
            variant="light"
            disabled={!value}
            onClick={() =>
              value && downloadMarkdown(value.markdown, `${title}-源码.md`)
            }
          >
            下载所示源码
          </Button>
        </Group>
        {message && (
          <Text role="status" size="sm">
            {message}
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
