import { useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useSiteSettings, useUpdateSiteSettings } from '@/api/hooks';
import {
  APIError,
  type RegistrationMode,
  type SiteSettings,
  type SiteSettingKey,
  type SiteSettingsChanges,
} from '@/api/types';
import { EmptyState } from '@/features/shared/empty-state';
import * as styles from './admin.css';

/** 只有布尔设置能由开关直接承载；`registrationMode` 是枚举，前端不提供选择器。 */
type BooleanSiteSettingKey = Exclude<SiteSettingKey, 'registrationMode'>;

/** 展示顺序：先本次已接入的一项，再按 PRD §7.3 的表格顺序。 */
const SETTING_ORDER: SiteSettingKey[] = [
  'inviteDefaultCanCreateWorkspace',
  'registrationMode',
  'allowWorkspaceOwnerInviteNewUsers',
  'publicSignupDefaultCanCreateWorkspace',
];

interface SettingCopy {
  title: string;
  /** 区一说明（14px）：这一项真实生效时会发生什么。 */
  description: string;
  /** 区二说明（12px）：尚未接入时它不影响什么。 */
  pendingNote: string;
}

const COPY: Record<SiteSettingKey, SettingCopy> = {
  inviteDefaultCanCreateWorkspace: {
    title: '受邀新账号默认可创建工作区',
    description:
      '关闭后，通过工作区邀请新建的账号只能作为协作者加入，不能自己创建工作区。仅影响之后创建的新账号；已有账号的授权不变，请在用户管理中单独调整。',
    pendingNote:
      '该设置将在后续版本接入，当前不生效。在此之前通过邀请新建的账号仍按服务端既有规则授权。',
  },
  registrationMode: {
    title: '注册模式',
    description: '控制站点是否接受公开自助注册。',
    pendingNote:
      '尚无公开自助注册入口。该设置将在后续版本接入，当前不影响站点行为；所有新账号仍通过工作区邀请创建。',
  },
  allowWorkspaceOwnerInviteNewUsers: {
    title: '普通 owner 邀请新用户',
    description: '控制工作区 owner 是否可以邀请尚无账号的人加入。',
    pendingNote:
      '该设置将在后续版本接入。当前工作区 owner 邀请尚无账号的人时，不检查此项。',
  },
  publicSignupDefaultCanCreateWorkspace: {
    title: '公开注册新账号默认创建授权',
    description: '控制通过公开注册新建的账号是否默认可创建工作区。',
    pendingNote: '公开注册尚未提供，此设置在接入前不会生效。',
  },
};

function booleanText(value: boolean): string {
  return value ? '允许' : '不允许';
}

function registrationModeText(mode: RegistrationMode): string {
  if (mode === 'invite_only') return '仅邀请（invite_only）';
  if (mode === 'closed') return '已关闭（closed）';
  return '公开注册（open）';
}

function valueText(settings: SiteSettings, key: SiteSettingKey): string {
  return key === 'registrationMode'
    ? registrationModeText(settings.registrationMode)
    : booleanText(settings[key]);
}

/** PRD §7.5：与 `workspace-settings.tsx` 的 `errorMessage` 同构。 */
function errorMessage(error: Error | null): string {
  if (!error) return '';
  if (error instanceof APIError && error.code === 'CSRF_INVALID')
    return '会话校验已失效，请刷新页面后重试。';
  if (error instanceof APIError && error.code === 'ADMIN_REQUIRED')
    return '当前账号已无站点管理权限，请刷新页面确认。';
  if (error instanceof APIError && error.code === 'REVISION_CONFLICT')
    return '另一位管理员已修改站点设置。';
  if (error instanceof APIError && error.code === 'REGISTRATION_NOT_READY')
    return '公开注册尚未就绪，暂不能启用。';
  if (error instanceof APIError && error.status === 401)
    return '登录状态已失效，请重新登录。';
  return '操作未完成，请检查网络后重试。';
}

function booleanChange(
  key: BooleanSiteSettingKey,
  value: boolean,
): SiteSettingsChanges {
  if (key === 'inviteDefaultCanCreateWorkspace')
    return { inviteDefaultCanCreateWorkspace: value };
  if (key === 'allowWorkspaceOwnerInviteNewUsers')
    return { allowWorkspaceOwnerInviteNewUsers: value };
  return { publicSignupDefaultCanCreateWorkspace: value };
}

/**
 * 区一（已接入）+ 区二（未接入）+ 保存交互 + 409 冲突弹层。
 *
 * 服务端已确认值 = `useSiteSettings` 的缓存；用户待选值只活在本地 `draft`。
 * 展示值 = `draft ?? 服务端值`，保存成功后 `draft` 清空并由响应整体覆盖缓存。
 */
export function AdminSettingsPanel({ settings }: { settings: SiteSettings }) {
  const query = useSiteSettings();
  const update = useUpdateSiteSettings();
  // 请求序号：乱序到达的旧响应一律丢弃，不覆盖新状态（PRD P1-6）。
  const seq = useRef(0);
  const [draft, setDraft] = useState<{
    key: BooleanSiteSettingKey;
    value: boolean;
  } | null>(null);
  const [conflict, setConflict] = useState<{
    key: BooleanSiteSettingKey;
    value: boolean;
  } | null>(null);

  const implementedKeys = SETTING_ORDER.filter(
    (key) => settings.implemented?.[key] === true,
  );
  const pendingKeys = SETTING_ORDER.filter(
    (key) => settings.implemented?.[key] !== true,
  );

  const save = (key: BooleanSiteSettingKey, value: boolean) => {
    if (update.isPending) return;
    const id = (seq.current += 1);
    setDraft({ key, value });
    setConflict(null);
    update.reset();
    update.mutate(
      {
        expectedRevision: settings.revision,
        changes: booleanChange(key, value),
      },
      {
        onSuccess: () => {
          if (id !== seq.current) return;
          setDraft(null);
          setConflict(null);
          notifications.show({ message: '站点设置已保存', color: 'blue' });
        },
        onError: (error) => {
          if (id !== seq.current) return;
          if (error instanceof APIError && error.code === 'REVISION_CONFLICT') {
            // 冲突不自动重试、不自动覆盖：把双方取值交给管理员决定。
            setConflict({ key, value });
            void query.refetch();
          }
        },
      },
    );
  };

  const retry = () => {
    if (!draft || update.isPending) return;
    save(draft.key, draft.value);
  };
  const useServerValue = () => {
    setDraft(null);
    setConflict(null);
    update.reset();
  };

  const renderEditableRow = (key: BooleanSiteSettingKey) => {
    const copy = COPY[key];
    const serverValue = settings[key];
    const isDraftRow = draft?.key === key;
    const shown = isDraftRow ? draft.value : serverValue;
    const busy = update.isPending && isDraftRow;
    const notEffective = isDraftRow && draft.value !== serverValue;
    const failed = isDraftRow && !!update.error;
    return (
      <div key={key}>
        <div className={styles.actionRow}>
          <div className={styles.actionText}>
            <h3 className={styles.rowTitle}>{copy.title}</h3>
            <p className={styles.rowValue}>
              当前生效值：{valueText(settings, key)}
            </p>
            <p className={styles.description}>{copy.description}</p>
          </div>
          <div className={styles.control}>
            {busy && (
              <>
                <Loader size="xs" aria-hidden />
                <span className={styles.statusText}>保存中…</span>
              </>
            )}
            <Switch
              checked={shown}
              disabled={update.isPending}
              aria-label={copy.title}
              onChange={(event) => save(key, event.currentTarget.checked)}
            />
            {notEffective && <span className={styles.statusText}>尚未生效</span>}
          </div>
        </div>
        {failed && (
          <Alert color="red" role="alert" className={styles.rowAlert}>
            <Text size="sm" fw={600} className={styles.alertText}>
              {errorMessage(update.error)}
            </Text>
            <Text size="xs" c="dimmed">
              服务端当前值：{booleanText(serverValue)}
            </Text>
            <div className={styles.alertActions}>
              <Button
                size="sm"
                variant="default"
                disabled={update.isPending}
                onClick={retry}
              >
                重试
              </Button>
              <Button
                size="sm"
                variant="subtle"
                color="gray"
                disabled={update.isPending}
                onClick={useServerValue}
              >
                使用服务端当前值
              </Button>
            </div>
          </Alert>
        )}
      </div>
    );
  };

  const renderReadOnlyRow = (
    key: SiteSettingKey,
    withBadge: boolean,
    first: boolean,
  ) => {
    const copy = COPY[key];
    return (
      <div
        key={key}
        className={`${styles.readOnlyRow} ${first ? styles.readOnlyRowFirst : ''}`}
      >
        <div className={styles.readOnlyHead}>
          <h3 className={styles.readOnlyTitle}>{copy.title}</h3>
          {withBadge && (
            <Badge variant="light" color="gray">
              未接入
            </Badge>
          )}
        </div>
        <p className={styles.rowValue}>
          当前值：{valueText(settings, key)}
        </p>
        <p className={styles.pendingNote}>
          {withBadge ? copy.pendingNote : copy.description}
        </p>
      </div>
    );
  };

  return (
    <>
      {implementedKeys.length > 0 && (
        <section className={styles.section} aria-label="新建账号的默认授权">
          <h2 className={styles.sectionTitle}>新建账号的默认授权</h2>
          {implementedKeys.map((key) =>
            key === 'registrationMode'
              ? renderReadOnlyRow(key, false, true)
              : renderEditableRow(key),
          )}
          {settings.upgradedInstance && (
            <p className={styles.upgradeNote}>
              此实例由旧版本升级，已保留旧行为（受邀新账号默认可创建工作区）。如需收紧，请手动关闭。
            </p>
          )}
        </section>
      )}

      <section className={styles.sectionRule} aria-label="尚未接入的设置">
        <h2 className={styles.sectionTitle}>尚未接入的设置</h2>
        {pendingKeys.length > 0 ? (
          pendingKeys.map((key, index) =>
            renderReadOnlyRow(key, true, index === 0),
          )
        ) : (
          <div className={styles.emptySection}>
            <EmptyState size="section" title="暂无可配置的站点设置" />
          </div>
        )}
      </section>

      <Modal
        opened={conflict !== null}
        onClose={() => setConflict(null)}
        title="站点设置已被其他管理员修改"
        centered
        classNames={{ content: styles.dialogContent }}
      >
        <Stack gap="md">
          <Text size="sm">
            另一位管理员已修改站点设置。请决定采用哪一份——不会自动覆盖对方的修改，也不会自动重试。
          </Text>
          {conflict && (
            <div className={styles.conflictGrid}>
              <div className={styles.conflictColumn}>
                <Text size="xs" fw={600} c="dimmed">
                  你的修改
                </Text>
                <Text size="sm">{COPY[conflict.key].title}</Text>
                <p className={styles.conflictValue}>
                  {booleanText(conflict.value)}
                </p>
              </div>
              <div className={styles.conflictColumn}>
                <Text size="xs" fw={600} c="dimmed">
                  服务端当前值
                </Text>
                <Text size="sm">{COPY[conflict.key].title}</Text>
                {query.isFetching || !query.data ? (
                  <p className={styles.conflictValue}>正在读取…</p>
                ) : (
                  <p className={styles.conflictValue}>
                    {booleanText(query.data[conflict.key])}
                  </p>
                )}
              </div>
            </div>
          )}
          <Group justify="flex-end" gap={10}>
            <Button variant="default" onClick={useServerValue}>
              使用服务端当前值
            </Button>
            <Button variant="subtle" color="gray" onClick={() => setConflict(null)}>
              关闭
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
