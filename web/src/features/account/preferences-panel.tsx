import { useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { usePreferences } from './preferences-provider';
import { defaultPreferences } from './preferences-model';
import * as styles from './account.css';
export function PreferencesPanel() {
  const { values, set, status, error, retry } = usePreferences();
  const [reset, setReset] = useState(false);
  return (
    <Stack gap="lg">
      <div>
        <Text fw={650} size="lg">
          Markdown 偏好
        </Text>
        <Text size="sm" c="dimmed">
          应用于你的所有 Markdown
          文档，并随账号同步；不会改变文档内容或其他成员的显示。
        </Text>
        <Text size="xs" mt="xs" role="status" aria-label="偏好同步状态">
          {status === 'saving'
            ? '保存中'
            : status === 'pending' || error
              ? '待同步'
              : '已同步'}
        </Text>
      </div>
      {error && (
        <Alert color="orange" role="alert">
          <Group justify="space-between">
            <Text size="sm">{error}</Text>
            <Button variant="subtle" onClick={retry}>
              重试同步
            </Button>
          </Group>
        </Alert>
      )}
      <Text fw={600}>阅读</Text>
      <div className={styles.preferenceRow}>
        <div>
          <Text size="sm">正文字号</Text>
          <Text size="xs" c="dimmed">
            正文与标题按比例调整
          </Text>
        </div>
        <NumberInput
          className={styles.control}
          aria-label="正文字号"
          min={14}
          max={22}
          step={1}
          allowDecimal={false}
          suffix=" px"
          value={values.fontSize}
          onChange={(value) =>
            typeof value === 'number' && set({ fontSize: value })
          }
        />
      </div>
      <div className={styles.preferenceRow}>
        <Text size="sm">行距</Text>
        <Select
          className={styles.control}
          aria-label="行距"
          value={String(values.lineHeight)}
          data={[
            { value: '1.5', label: '紧凑' },
            { value: '1.75', label: '标准' },
            { value: '2', label: '宽松' },
          ]}
          onChange={(value) => value && set({ lineHeight: Number(value) })}
        />
      </div>
      <div className={styles.preferenceRow}>
        <Text size="sm">正文宽度</Text>
        <Select
          className={styles.control}
          aria-label="正文宽度"
          value={String(values.contentWidth)}
          data={[
            { value: '640', label: '窄 · 640px' },
            { value: '760', label: '标准 · 760px' },
            { value: '960', label: '宽 · 960px' },
          ]}
          onChange={(value) => value && set({ contentWidth: Number(value) })}
        />
      </div>
      <div
        className={styles.preview}
        aria-label="阅读预览"
        style={{ fontSize: values.fontSize, lineHeight: values.lineHeight }}
      >
        <strong>写下值得记住的事</strong>
        <div>文档记录想法，白板连接思路。让阅读和书写保持舒适。</div>
      </div>
      <Divider />
      <Text fw={600}>代码</Text>
      <Switch
        label="显示代码行号"
        aria-label="显示代码行号"
        description="在代码块左侧显示行号"
        classNames={{
          body: styles.switchBody,
          labelWrapper: styles.switchLabel,
        }}
        labelPosition="left"
        checked={values.codeLineNumbers}
        onChange={(event) =>
          set({ codeLineNumbers: event.currentTarget.checked })
        }
      />
      <div className={styles.preview} aria-label="代码预览">
        <div className={styles.codePreview}>
          {values.codeLineNumbers && (
            <span aria-hidden="true">
              1<br />2
            </span>
          )}
          <code>
            const idea = 'madoc';
            <br />
            write(idea);
          </code>
        </div>
      </div>
      <Divider />
      <Text fw={600}>书写</Text>
      {(
        [
          ['autoPair', '括号与引号自动配对', '补全闭合符，支持越过和成对删除'],
          ['focusMode', '专注模式', '突出当前段落，减弱其他内容'],
          ['typewriterMode', '打字机模式', '让当前输入位置保持在视野中部'],
        ] as const
      ).map(([key, label, description]) => (
        <Switch
          key={key}
          label={label}
          aria-label={label}
          description={description}
          classNames={{
            body: styles.switchBody,
            labelWrapper: styles.switchLabel,
          }}
          labelPosition="left"
          checked={values[key]}
          onChange={(event) => set({ [key]: event.currentTarget.checked })}
        />
      ))}
      <Divider />
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          仅恢复 Markdown 偏好
        </Text>
        <Button variant="default" onClick={() => setReset(true)}>
          恢复默认设置
        </Button>
      </Group>
      <Modal
        opened={reset}
        onClose={() => setReset(false)}
        title="恢复默认设置？"
      >
        <Stack>
          <Text size="sm">
            字号、行距、正文宽度和书写开关将恢复默认。个人资料与文档内容不受影响。
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setReset(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                set(defaultPreferences);
                setReset(false);
              }}
            >
              确认恢复
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
