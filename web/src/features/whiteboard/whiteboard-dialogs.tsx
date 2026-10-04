import { useEffect, useState } from 'react';
import {
  Button,
  Group,
  Kbd,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { Search } from 'lucide-react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import * as styles from './whiteboard-editor.css';

export type WhiteboardDialog = 'search' | 'help' | 'clear' | null;
const shortcuts = [
  ['选择工具', 'V / 1'],
  ['移动画布', 'H / 空格拖动'],
  ['矩形 / 菱形 / 椭圆', 'R / D / O'],
  ['箭头 / 直线 / 画笔', 'A / L / P'],
  ['文字', 'T'],
  ['撤销', '⌘ / Ctrl + Z'],
  ['重做', '⌘ / Ctrl + Shift + Z'],
  ['查找画布', '⌘ / Ctrl + F'],
  ['缩放至全部内容', 'Shift + 1'],
  ['切换显示主题', 'Shift + Alt + D'],
  ['快捷键帮助', '?'],
];

export function WhiteboardDialogs({
  dialog,
  api,
  onClose,
  onClear,
  canEdit,
}: {
  dialog: WhiteboardDialog;
  api?: ExcalidrawImperativeAPI;
  onClose: () => void;
  onClear: () => void;
  canEdit: boolean;
}) {
  const [query, setQuery] = useState('');
  const [searchElements, setSearchElements] = useState<
    ReturnType<ExcalidrawImperativeAPI['getSceneElements']>
  >([]);
  useEffect(() => {
    if (dialog !== 'search') return;
    setQuery('');
    if (!api) return;
    const refresh = () => setSearchElements([...api.getSceneElements()]);
    refresh();
    return api.onChange(refresh);
  }, [dialog, api]);
  const matches = query.trim()
    ? searchElements.filter(
        (element) =>
          element.type === 'text' &&
          element.originalText
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      )
    : [];
  return (
    <>
      <Modal
        opened={dialog === 'clear' && canEdit}
        onClose={onClose}
        title="清空画布"
      >
        <Stack>
          <Text size="sm">
            清空当前白板的全部元素。此操作会同步给协作者，也可以通过撤销恢复。
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              取消
            </Button>
            <Button color="red" onClick={onClear}>
              清空画布
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={dialog === 'search'} onClose={onClose} title="查找画布">
        <Stack>
          <TextInput
            autoFocus
            data-autofocus
            label="查找文字"
            placeholder="输入画布中的文字"
            leftSection={<Search size={16} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <ScrollArea.Autosize mah={320}>
            <div className={styles.searchResults}>
              {matches.map((element) => (
                <UnstyledButton
                  key={element.id}
                  className={styles.searchResult}
                  onClick={() => {
                    api?.scrollToContent(element, { animate: true });
                    onClose();
                  }}
                >
                  {element.type === 'text' ? element.originalText : ''}
                </UnstyledButton>
              ))}
              {!matches.length && (
                <Text size="sm" c="dimmed" py="sm">
                  {query.trim()
                    ? '没有找到匹配的文字'
                    : '输入关键词，定位画布中的文字。'}
                </Text>
              )}
            </div>
          </ScrollArea.Autosize>
        </Stack>
      </Modal>
      <Modal opened={dialog === 'help'} onClose={onClose} title="白板快捷键">
        <Table verticalSpacing="sm">
          <Table.Tbody>
            {shortcuts.map(([action, key]) => (
              <Table.Tr key={action}>
                <Table.Td>{action}</Table.Td>
                <Table.Td>
                  <Kbd>{key}</Kbd>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Modal>
    </>
  );
}
