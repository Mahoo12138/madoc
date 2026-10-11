import type { AdminUser } from '@/api/types';

/**
 * 状态与权限一律以文字表达，颜色只是辅助（DESIGN.md：状态不能只靠颜色）。
 * 未登记的来源按原样展示，不猜测、不隐藏。
 */
const SIGNUP_SOURCE_LABELS: Record<string, string> = {
  setup: '站点初始化',
  workspace_invite: '工作区邀请',
  public_signup: '公开注册',
  admin_created: '管理员创建',
  legacy: '既有账号（来源未记录）',
};

export function signupSourceLabel(source: string): string {
  return SIGNUP_SOURCE_LABELS[source] ?? source;
}

export function roleText(user: AdminUser): string {
  return user.isAdmin ? '站点管理员' : '普通用户';
}

export function statusText(user: AdminUser): string {
  return user.disabled ? '已禁用' : '启用中';
}

export function canCreateText(value: boolean): string {
  return value ? '可以创建' : '不能创建';
}

/**
 * §3.2：管理员的原始授权字段可以保留原值，最终能力由身份计算。两者不同时要如实说明，
 * 否则撤销管理员身份会变成一次隐式授权或隐式收权。
 */
export function effectiveNote(user: AdminUser): string {
  if (user.disabled) return '账号已禁用，当前不能创建工作区。';
  if (user.isAdmin) return '由管理员身份赋予，与「普通用户创建授权」的原始取值无关。';
  return '由「普通用户创建授权」决定。';
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
