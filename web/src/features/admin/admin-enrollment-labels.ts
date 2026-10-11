import { APIError, type AccountEnrollment } from '@/api/types';

/**
 * 待激活记录的展示语言（§11.3）。状态一律以文字承载，颜色最多是辅助
 * （DESIGN.md：状态不能只靠颜色）；未登记的状态按原样展示，不猜测也不隐藏。
 */
const STATUS_LABELS: Record<string, string> = {
  pending: '待激活',
  consumed: '已完成',
  revoked: '已撤销',
  expired: '已过期',
};

export type EnrollmentDisplayState = 'pending' | 'consumed' | 'revoked' | 'expired';

/**
 * 服务端只落 `pending / consumed / revoked` 三种状态：过期是每次使用令牌时按
 * `expiresAt` 判定的，不写回行（不依赖定时清理才能失效）。所以「已过期」只能由
 * 前端按到期时间推导——否则一条已经打不开的链接会一直显示「待激活」。
 * 真正的准入判定仍在服务端，这里只负责把已知事实说清楚。
 */
export function enrollmentDisplayState(
  enrollment: AccountEnrollment,
  now = Date.now(),
): EnrollmentDisplayState {
  const status = enrollment.status;
  if (status !== 'pending' && status !== 'consumed' && status !== 'revoked')
    // 未登记的状态不猜测，按 pending 处理，再叠加过期的可能性。
    return isElapsed(enrollment.expiresAt, now) ? 'expired' : 'pending';
  if (status !== 'pending') return status;
  return isElapsed(enrollment.expiresAt, now) ? 'expired' : 'pending';
}

function isElapsed(iso: string, now: number): boolean {
  const at = Date.parse(iso);
  return !Number.isNaN(at) && at <= now;
}

export function enrollmentStatusText(enrollment: AccountEnrollment): string {
  const state = enrollmentDisplayState(enrollment);
  return STATUS_LABELS[state] ?? state;
}

/** 每一行要回答「现在还能不能用」，而不是只给一个词。 */
export function enrollmentStatusNote(enrollment: AccountEnrollment): string {
  switch (enrollmentDisplayState(enrollment)) {
    case 'pending':
      return '链接仍然有效，对方设置姓名与密码后账号才会创建。';
    case 'consumed':
      return '对方已完成激活，账号已在用户管理中。';
    case 'revoked':
      return '已被管理员撤销，原链接失效。';
    case 'expired':
      return '已过到期时间，原链接不再可用；如需让他进来，请重新新建一条。';
    default:
      return '';
  }
}

/** §11.3：这是管理员显式选定的初始授权，不是站点默认值。 */
export function enrollmentGrantText(value: boolean): string {
  return value ? '可以创建工作区' : '不能创建工作区';
}

/** 24 小时到期的记录需要看到时刻，只有日期会给出错误的紧迫感。 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * `includes('@')` 会把 "a@" 这种地址放过去，让服务端去拒绝。这里先解析一次，
 * 让弹窗能在提交之前就把问题说清楚。
 */
export function enrollmentEmailProblem(value: string): string | null {
  const email = value.trim();
  if (!email) return '请填写邮箱';
  if (/\s/.test(email)) return '邮箱不能包含空格';
  const parts = email.split('@');
  if (parts.length !== 2) return '请输入完整的邮箱地址，例如 name@example.com';
  const [local, domain] = parts;
  if (!local || !domain) return '请输入完整的邮箱地址，例如 name@example.com';
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.'))
    return '域名部分需要包含点号，例如 example.com';
  if (Array.from(email).length > 254) return '邮箱地址过长';
  return null;
}

/** 服务端错误码翻译成管理员能读懂的后果（PRD §7.5）。 */
export function enrollmentErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    if (error.code === 'EMAIL_ALREADY_REGISTERED')
      // §11.3：不能借激活流程改动已有账号。明确指向真正的出口，而不是暗示可以重置。
      return '该邮箱已有账号，请到「用户管理」中调整其状态与权限。';
    if (error.code === 'CSRF_INVALID')
      return '会话校验已失效，请刷新页面后重试。';
    if (error.code === 'ADMIN_REQUIRED')
      return '当前账号已无站点管理权限，请刷新页面确认。';
    if (error.code === 'INVALID_REQUEST')
      return '服务端拒绝了这次请求（邮箱或参数不合法）。请修改后重试。';
    if (error.status === 401) return '登录状态已失效，请重新登录。';
    if (error.status === 404) return '该记录已不存在，请刷新列表。';
    if (error.status === 429) return '操作过于频繁，请稍后重试。';
  }
  return '操作未完成，请检查网络后重试。';
}

/** 撤销的失败文案单独一份：它的后果与「没有创建成功」完全不同。 */
export function revokeErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    if (error.code === 'CSRF_INVALID')
      return '会话校验已失效，请刷新页面后重试。';
    if (error.code === 'ADMIN_REQUIRED')
      return '当前账号已无站点管理权限，请刷新页面确认。';
    if (error.status === 401) return '登录状态已失效，请重新登录。';
    if (error.status === 404) return '该记录已不存在，请刷新列表。';
  }
  return '撤销未生效，这条待激活记录仍然存在。请检查网络后重试。';
}
