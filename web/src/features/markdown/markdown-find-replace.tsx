import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import type { MarkdownFindController, MarkdownFindMatch } from './markdown-find';

export function MarkdownFindReplace({
  controller,
  readonly,
  onClose,
}: {
  controller?: MarkdownFindController;
  readonly: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matches, setMatches] = useState<MarkdownFindMatch[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const fullScreen = useMediaQuery('(max-width: 48em)');

  useEffect(() => {
    const refresh = () => {
      const next = controller?.find(query) ?? [];
      setMatches((current) => {
        if (current.length === next.length && current.every((match, index) => match.from === next[index]?.from && match.to === next[index]?.to)) return current;
        return next;
      });
    };
    refresh();
    return controller?.subscribe(refresh);
  }, [controller, query]);

  useEffect(() => {
    setActiveIndex((current) => matches.length ? Math.min(current, matches.length - 1) : 0);
  }, [matches]);

  const select = (index: number) => {
    if (!matches.length) return;
    const nextIndex = (index + matches.length) % matches.length;
    setActiveIndex(nextIndex);
    controller?.select(matches[nextIndex]);
  };

  const replaceCurrent = () => {
    const match = matches[activeIndex];
    if (!match || !controller?.replace(match, replacement)) return;
    const next = controller.find(query);
    setMatches(next);
    setActiveIndex(next.length ? Math.min(activeIndex, next.length - 1) : 0);
    if (next.length) controller.select(next[Math.min(activeIndex, next.length - 1)]);
  };

  const replaceAll = () => {
    if (!controller) return;
    controller.replaceAll(matches, replacement);
    setMatches(controller.find(query));
    setActiveIndex(0);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title="文内查找与替换"
      centered
      size="md"
      fullScreen={fullScreen}
      aria-label="文内查找与替换"
    >
      <Stack gap="sm">
        <TextInput
          label="查找文本"
          placeholder="输入要查找的内容"
          value={query}
          onChange={(event) => { setQuery(event.currentTarget.value); setActiveIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); select(activeIndex + (event.shiftKey ? -1 : 1)); }
          }}
          data-autofocus
        />
        <Text size="sm" c="dimmed" aria-live="polite">
          {!query ? '只搜索当前文档，区分大小写。' : matches.length ? `${activeIndex + 1} / ${matches.length} 个匹配项` : '没有匹配项'}
        </Text>
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <Button variant="default" disabled={!matches.length} onClick={() => select(activeIndex - 1)}>上一个</Button>
            <Button variant="default" disabled={!matches.length} onClick={() => select(activeIndex + 1)}>下一个</Button>
          </Group>
        </Group>
        <TextInput
          label="替换为"
          placeholder="输入替换文本"
          value={replacement}
          onChange={(event) => setReplacement(event.currentTarget.value)}
          disabled={readonly}
        />
        {readonly ? (
          <Text size="sm" c="dimmed">当前为只读文档，无法替换内容。</Text>
        ) : (
          <Group justify="flex-end">
            <Button variant="default" disabled={!matches.length} onClick={replaceCurrent}>替换</Button>
            <Button disabled={!matches.length} onClick={replaceAll}>全部替换</Button>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}
