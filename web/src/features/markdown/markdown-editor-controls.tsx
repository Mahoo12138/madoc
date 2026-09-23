import {
  ActionIcon,
  Badge,
  Divider,
  Group,
  Kbd,
  Popover,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  Code as IconSource,
  AlignCenterVertical as IconTypewriter,
  Download as IconDownload,
  FileInput as IconFileImport,
  Focus as IconFocus,
  Keyboard as IconKeyboard,
  Package as IconPackage,
  BookOpen as IconReading,
  PenLine as IconEdit,
  Printer as IconPrint,
  Search as IconSearch,
  Wifi as IconWifi,
  WifiOff as IconWifiOff,
} from 'lucide-react';
import type { MarkdownStats } from './markdown-stats';

import type { SaveStatus } from './markdown-save-state';

const statusLabels: Record<SaveStatus, string> = {
  Local: '已保存到此设备，待同步',
  Error: '保存已停止',
  Saving: '保存中',
  Saved: '已保存',
  Offline: '离线',
  Reconnecting: '重新连接',
};

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <Group justify="space-between" gap="xl" wrap="nowrap">
      <Text size="sm">{label}</Text>
      <Group gap={4} wrap="nowrap">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </Group>
    </Group>
  );
}

export function MarkdownEditorControls({
  status,
  presence,
  stats,
  readonly,
  readingMode,
  focusMode,
  typewriterMode,
  onExport,
  onPackageExport,
  onSource,
  onFind,
  onToggleReading,
  onPrint,
  exporting,
  exportingPackage,
  onImport,
  onToggleFocus,
  onToggleTypewriter,
}: {
  status: SaveStatus;
  presence: number;
  stats: MarkdownStats;
  readonly: boolean;
  readingMode: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  onExport: () => void;
  onPackageExport: () => void;
  onSource: () => void;
  onFind: () => void;
  onToggleReading: () => void;
  onPrint: () => void;
  exporting: boolean;
  exportingPackage: boolean;
  onImport: () => void;
  onToggleFocus: () => void;
  onToggleTypewriter: () => void;
}) {
  const modifier = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

  return (
    <Group justify="space-between" gap="sm" wrap="wrap">
      <Group gap="xs">
        <Badge
          variant="light"
          color={
            status === 'Saved' ? 'green' : status === 'Offline' ? 'red' : 'blue'
          }
          leftSection={
            status === 'Offline' ? (
              <IconWifiOff size={12} />
            ) : (
              <IconWifi size={12} />
            )
          }
        >
          {statusLabels[status]}
        </Badge>
        <Text size="xs" c="dimmed">
          {presence} 人在线
        </Text>
        <Text size="xs" c="dimmed" aria-label="文档统计">
          {stats.characters} 字
          {stats.readingMinutes > 0 ? ` · 约 ${stats.readingMinutes} 分钟` : ''}
        </Text>
      </Group>

      <Group gap={4}>
        {!readingMode && (
          <Tooltip label={`专注模式（${modifier}+Shift+F）`}>
            <ActionIcon
              aria-label="切换专注模式"
              aria-pressed={focusMode}
              variant={focusMode ? 'light' : 'subtle'}
              color={focusMode ? 'blue' : 'gray'}
              onClick={onToggleFocus}
            >
              <IconFocus size={17} />
            </ActionIcon>
          </Tooltip>
        )}
        {!readingMode && (
          <Tooltip label="打字机模式">
            <ActionIcon
              aria-label="切换打字机模式"
              aria-pressed={typewriterMode}
              variant={typewriterMode ? 'light' : 'subtle'}
              color={typewriterMode ? 'blue' : 'gray'}
              onClick={onToggleTypewriter}
            >
              <IconTypewriter size={17} />
            </ActionIcon>
          </Tooltip>
        )}
        {!readingMode && (
          <Popover width={280} position="bottom-end" shadow="md">
            <Popover.Target>
              <ActionIcon aria-label="查看编辑快捷键">
                <IconKeyboard size={17} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <MarkdownShortcuts />
            </Popover.Dropdown>
          </Popover>
        )}
        {!readingMode && (readonly ? null : (
          <Tooltip label="导入 Markdown">
            <ActionIcon aria-label="导入 Markdown" onClick={onImport}>
              <IconFileImport size={17} />
            </ActionIcon>
          </Tooltip>
        ))}
        <Tooltip label="查看 Markdown 源码">
          <ActionIcon aria-label="查看 Markdown 源码" onClick={onSource}>
            <IconSource size={17} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="文内查找与替换">
          <ActionIcon aria-label="文内查找与替换" onClick={onFind}>
            <IconSearch size={17} />
          </ActionIcon>
        </Tooltip>
        {readingMode && (
          <Tooltip label="打印">
            <ActionIcon aria-label="打印" onClick={onPrint}>
              <IconPrint size={17} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="导出 Markdown">
          <ActionIcon
            aria-label="导出 Markdown"
            onClick={onExport}
            loading={exporting}
            disabled={exportingPackage}
          >
            <IconDownload size={17} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="导出 Markdown 和附件 ZIP">
          <ActionIcon
            aria-label="导出 Markdown 和附件 ZIP"
            onClick={onPackageExport}
            loading={exportingPackage}
            disabled={exporting}
          >
            <IconPackage size={17} />
          </ActionIcon>
        </Tooltip>
        {readonly ? null : (
          <Tooltip label={readingMode ? '返回编辑' : '阅读视图'}>
            <ActionIcon
              aria-label={readingMode ? '返回编辑' : '进入阅读视图'}
              aria-pressed={readingMode}
              onClick={onToggleReading}
            >
              {readingMode ? <IconEdit size={17} /> : <IconReading size={17} />}
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Group>
  );
}

export function MarkdownShortcuts() {
  const modifier = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
  return (
    <>
      <Text fw={650} size="sm">
        编辑快捷键
      </Text>
      <Text size="xs" c="dimmed" mt={2}>
        选择文本后会出现格式工具栏；空行输入 / 可快速插入内容。
      </Text>
      <Divider my="sm" />
      <Stack gap="xs">
        <Shortcut label="加粗" keys={[modifier, 'B']} />
        <Shortcut label="斜体" keys={[modifier, 'I']} />
        <Shortcut label="链接" keys={[modifier, 'K']} />
        <Shortcut label="专注模式" keys={[modifier, 'Shift', 'F']} />
      </Stack>
    </>
  );
}
