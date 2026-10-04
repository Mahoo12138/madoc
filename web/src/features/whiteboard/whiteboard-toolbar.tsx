import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  ColorInput,
  ColorSwatch,
  Menu,
  Popover,
  SegmentedControl,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  Check,
  ChevronDown,
  Download,
  History,
  Keyboard,
  MoreHorizontal,
  Moon,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  Users,
  WifiOff,
} from 'lucide-react';
import * as styles from './whiteboard-editor.css';

export type BoardStatus =
  | 'Saving'
  | 'Saved'
  | 'Offline'
  | 'Reconnecting'
  | 'Local';
const statusLabels: Record<BoardStatus, string> = {
  Saved: '已保存',
  Saving: '保存中',
  Offline: '离线',
  Reconnecting: '正在连接',
  Local: '已保存到此设备，待同步',
};
const backgrounds = [
  ['白色', '#ffffff'],
  ['浅灰', '#f8f9fa'],
  ['浅蓝', '#edf2ff'],
  ['米色', '#fff9db'],
  ['浅粉', '#fff0f6'],
  ['深灰', '#1e1e1e'],
] as const;

export function WhiteboardToolbar({
  status,
  presence,
  theme,
  onTheme,
  background,
  onBackground,
  canEdit,
  hasElements,
  onHistory,
  onExport,
  onImport,
  onDialog,
  actionsOpened,
  onActionsChange,
}: {
  status: BoardStatus;
  presence: number;
  theme: 'light' | 'dark';
  onTheme: (theme: 'light' | 'dark') => void;
  background: string;
  onBackground: (color: string) => void;
  canEdit: boolean;
  hasElements: boolean;
  onHistory: () => void;
  onExport: (format: 'png' | 'svg' | 'json') => void;
  onImport: () => void;
  onDialog: (dialog: 'search' | 'help' | 'clear') => void;
  actionsOpened: boolean;
  onActionsChange: (opened: boolean) => void;
}) {
  const [color, setColor] = useState(background);
  useEffect(() => setColor(background), [background]);
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="白板状态与操作">
      <div className={styles.status} role="status">
        <Badge
          variant="light"
          radius="sm"
          color={
            status === 'Saved' ? 'green' : status === 'Offline' ? 'red' : 'blue'
          }
          leftSection={
            status === 'Saved' ? (
              <Check size={12} />
            ) : status === 'Offline' ? (
              <WifiOff size={12} />
            ) : undefined
          }
        >
          {statusLabels[status]}
        </Badge>
        <span>
          <Users size={13} aria-hidden="true" /> {presence} 在线
        </span>
      </div>
      <div className={styles.actions}>
        <Button
          className={styles.action}
          size="compact-sm"
          variant="subtle"
          color="gray"
          leftSection={<History size={15} />}
          onClick={onHistory}
        >
          版本历史
        </Button>
        <Menu position="bottom-end" shadow="md" withinPortal>
          <Menu.Target>
            <Button
              className={styles.action}
              size="compact-sm"
              variant="subtle"
              color="gray"
              leftSection={<Download size={15} />}
              rightSection={<ChevronDown size={12} />}
            >
              导出
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Download size={15} />}
              onClick={() => onExport('png')}
            >
              PNG
            </Menu.Item>
            <Menu.Item
              leftSection={<Download size={15} />}
              onClick={() => onExport('svg')}
            >
              SVG
            </Menu.Item>
            <Menu.Item
              leftSection={<Download size={15} />}
              onClick={() => onExport('json')}
            >
              Excalidraw JSON
            </Menu.Item>
            {canEdit && (
              <>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<Upload size={15} />}
                  onClick={onImport}
                >
                  导入 Excalidraw JSON
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
        <Popover
          position="bottom-end"
          width={288}
          shadow="md"
          withinPortal
          trapFocus
          returnFocus
        >
          <Popover.Target>
            <Button
              className={styles.action}
              size="compact-sm"
              variant="subtle"
              color="gray"
              leftSection={<SlidersHorizontal size={15} />}
            >
              画布设置
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <div className={styles.settings}>
              <div className={styles.setting}>
                <Text size="sm" fw={600}>
                  显示主题
                </Text>
                <SegmentedControl
                  aria-label="显示主题"
                  fullWidth
                  value={theme}
                  onChange={(value) => onTheme(value as 'light' | 'dark')}
                  data={[
                    {
                      value: 'light',
                      label: (
                        <span>
                          <Sun size={14} /> 浅色
                        </span>
                      ),
                    },
                    {
                      value: 'dark',
                      label: (
                        <span>
                          <Moon size={14} /> 深色
                        </span>
                      ),
                    },
                  ]}
                />
                <Text size="xs" c="dimmed">
                  主题仅影响你在此设备的显示。
                </Text>
              </div>
              <div className={styles.setting}>
                <Text size="sm" fw={600}>
                  画布背景
                </Text>
                {canEdit ? (
                  <>
                    <div className={styles.swatches}>
                      {backgrounds.map(([name, value]) => (
                        <Tooltip key={value} label={name}>
                          <ColorSwatch
                            component="button"
                            radius="sm"
                            withShadow={false}
                            className={styles.swatch}
                            color={value}
                            aria-label={`${name}背景`}
                            aria-pressed={background.toLowerCase() === value}
                            onClick={() => onBackground(value)}
                          />
                        </Tooltip>
                      ))}
                    </div>
                    <ColorInput
                      label="自定义背景色"
                      size="sm"
                      format="hex"
                      value={color}
                      onChange={setColor}
                      onChangeEnd={(value) => {
                        if (/^#[0-9a-f]{6}$/i.test(value)) onBackground(value);
                        else setColor(background);
                      }}
                    />
                  </>
                ) : (
                  <Text size="sm">{background.toUpperCase()}</Text>
                )}
                <Text size="xs" c="dimmed">
                  {canEdit
                    ? '背景自动保存，并与协作者同步。'
                    : '你只有查看权限，无法修改画布背景。'}
                </Text>
              </div>
            </div>
          </Popover.Dropdown>
        </Popover>
        <Menu
          position="bottom-end"
          shadow="md"
          withinPortal
          opened={actionsOpened}
          onChange={onActionsChange}
        >
          <Menu.Target>
            <ActionIcon
              className={styles.action}
              size="lg"
              aria-label="白板操作"
            >
              <MoreHorizontal size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Search size={15} />}
              onClick={() => onDialog('search')}
            >
              查找画布
            </Menu.Item>
            <Menu.Item
              leftSection={<Keyboard size={15} />}
              onClick={() => onDialog('help')}
            >
              快捷键帮助
            </Menu.Item>
            {canEdit && (
              <>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  disabled={!hasElements}
                  leftSection={<Trash2 size={15} />}
                  onClick={() => onDialog('clear')}
                >
                  清空画布
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  );
}
