import type { AuditEvent } from '@/api/types';
import type { LucideIcon } from 'lucide-react';
import {
  FolderPlus as IconFolderPlus,
  KeyRound as IconKeyRound,
  Settings2 as IconSettings,
  ShieldCheck as IconShieldCheck,
  UserCheck as IconUserCheck,
  UserX as IconUserX,
} from 'lucide-react';

/**
 * 审计的机器值只存在于接口与日志里，页面上出现的一律是中文：
 * `user.admin_role_changed` 这种字符串不该被管理员读成界面文案。未登记的值
 * 退回中性描述而不是把原文透出去（§10.1：入口按身份决定，但文案由本模块负责）。
 */
const ACTION_LABELS: Record<string, string> = {
  'site.settings_changed': '修改了站点设置',
  'user.disabled': '停用了账号',
  'user.enabled': '启用了账号',
  'user.admin_role_changed': '调整了管理员身份',
  'user.workspace_creation_changed': '调整了创建工作区权限',
  'user.sessions_revoked': '撤销了账号的全部会话',
};

const ACTION_ICONS: Record<string, LucideIcon> = {
  'site.settings_changed': IconSettings,
  'user.disabled': IconUserX,
  'user.enabled': IconUserCheck,
  'user.admin_role_changed': IconShieldCheck,
  'user.workspace_creation_changed': IconFolderPlus,
  'user.sessions_revoked': IconKeyRound,
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  site_settings: '站点设置',
  user: '账号',
};

/** 变更字段的中文名。只覆盖白名单里的业务字段，不做兜底透传。 */
const CHANGE_LABELS: Record<string, string> = {
  registrationMode: '注册模式',
  allowWorkspaceOwnerInviteNewUsers: '工作区所有者可邀请新用户',
  inviteDefaultCanCreateWorkspace: '受邀新账号默认可创建工作区',
  publicSignupDefaultCanCreateWorkspace: '公开注册新账号默认可创建工作区',
  isAdmin: '站点管理员身份',
  disabled: '账号启用状态',
  canCreateWorkspace: '可创建工作区',
  sessionsRevoked: '同时被撤销的会话数',
};

const REGISTRATION_MODE_LABELS: Record<string, string> = {
  closed: '不开放注册',
  invite_only: '仅受邀可注册',
  open: '开放注册',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? '其他管理操作';
}

export function actionIcon(action: string): LucideIcon {
  return ACTION_ICONS[action] ?? IconShieldCheck;
}

export function targetTypeLabel(targetType: string): string {
  return TARGET_TYPE_LABELS[targetType] ?? '其他对象';
}

/**
 * 布尔取值逐字段给说法。通用说法是「允许 / 不允许」，但 `disabled` 的极性是
 * 反的：它为 true 表示**被禁用**。共用一套说法会把「停用账号」显示成
 * 「不允许 → 允许」，读起来正好说反——所以这里按字段覆盖。
 */
const BOOLEAN_VALUE_LABELS: Record<string, [falseText: string, trueText: string]> = {
  disabled: ['启用中', '已禁用'],
  isAdmin: ['普通用户', '站点管理员'],
};

function scalarText(key: string, value: unknown): string {
  if (typeof value === 'boolean') {
    const labels = BOOLEAN_VALUE_LABELS[key];
    return labels ? (value ? labels[1] : labels[0]) : value ? '允许' : '不允许';
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return REGISTRATION_MODE_LABELS[value] ?? value;
  if (value === null || value === undefined) return '无';
  return '已变更';
}

export interface AuditChangeLine {
  key: string;
  /** 「旧值 → 新值」的完整中文句子；无前后值的字段只给当前值。 */
  text: string;
}

function isValueChange(value: unknown): value is { from: unknown; to: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'from' in value &&
    'to' in value
  );
}

/**
 * 把 `changes_json` 翻译成逐行可读中文。字段名与取值都走白名单映射，未登记
 * 的键退化为中性描述——原始 JSON 字符串永远不出现在界面上。
 */
export function changeLines(changes: Record<string, unknown>): AuditChangeLine[] {
  const entries = Object.entries(changes);
  if (entries.length === 0) return [];
  return entries.map(([key, value]) => {
    const label = CHANGE_LABELS[key] ?? '其他设置项';
    if (isValueChange(value)) {
      return {
        key,
        text: `${label}：${scalarText(key, value.from)} → ${scalarText(key, value.to)}`,
      };
    }
    return { key, text: `${label}：${scalarText(key, value)}` };
  });
}

/** 目标的可读描述：账号类目标带姓名（可能已删除），设置类目标只有一种。 */
export function targetText(event: AuditEvent): string {
  if (event.targetType === 'site_settings') return '站点设置';
  if (event.targetType === 'user') return event.targetId ? `账号 ${event.targetId}` : '账号';
  return event.targetId ? `${targetTypeLabel(event.targetType)} ${event.targetId}` : targetTypeLabel(event.targetType);
}

/** 操作者姓名可能为空（账号已删除），那时说清楚而不是显示空白。 */
export function actorText(event: AuditEvent): string {
  return event.actorName || '已删除的账号';
}
