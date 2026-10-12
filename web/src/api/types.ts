export type Role = 'owner' | 'editor' | 'viewer';
export type ItemType = 'folder' | 'markdown' | 'whiteboard';

/** 服务端计算的能力位（`/api/auth/session` 与 `/api/me` 同构）；前端只读，不根据 `isAdmin` 推导。 */
export interface UserCapabilities { canManageSite: boolean; canCreateWorkspace: boolean }

export interface User { avatarUrl?: string | null; id: string; name: string; email: string; isAdmin: boolean; disabled: boolean; capabilities: UserCapabilities }
export interface Workspace { id: string; name: string; description: string; role: Role; createdAt: string; updatedAt: string }
export interface Member { avatarUrl?: string | null; userId: string; name: string; email: string; role: Role; createdAt: string }
export interface Invite { id: string; workspaceId: string; email: string; role: Exclude<Role, 'owner'>; status: string; expiresAt: string; createdAt: string }
/** 邀请预览（`GET /api/invites/{token}`）。`canCreateAccount` 由服务端按当前站点策略实时判定。 */
export interface InvitePreview { invite: Invite; workspaceName: string; canCreateAccount: boolean }
export interface Item { id: string; workspaceId: string; parentId: string | null; type: ItemType; title: string; sortKey: number; createdBy: string; createdAt: string; updatedAt: string }
export interface Session { user: User | null; csrfToken?: string }
export interface MarkdownState { markdown: string; cacheSeq: number; generation: number }
export interface MarkdownCapture { generation: number; snapshot: string | null; snapshotSeq: number; markdown: string; cacheSeq: number; updates: { seq: number; update: string; userId?: string }[] | null; headSeq: number }
export interface BoardScene { elements: readonly unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> }
export interface WhiteboardState { revision: number; scene: BoardScene }
export interface ItemCapture { item: Item; capturedAt: string; markdown?: MarkdownCapture; whiteboard?: WhiteboardState }
export interface ContentVersion {
  id: string; itemId: string; workspaceId: string; contentType: 'markdown' | 'whiteboard';
  kind: 'manual' | 'automatic'; label?: string | null; createdBy?: string | null;
  generation?: number | null; snapshotSeq?: number | null; headSeq?: number | null;
  whiteboardRevision?: number | null; payloadBytes: number; createdAt: string;
}
export interface ContentVersionDetail {
  version: ContentVersion;
  markdown?: MarkdownCapture;
  whiteboard?: { revision: number; scene: string };
  assetIds: string[];
}
export interface ContentVersionUsage {
  workspaceId: string; usedBytes: number; limitBytes: number;
  manualVersions: number; automaticVersions: number; automaticPaused: boolean;
}
export interface ItemShare {
  id: string; itemId: string; versionId: string; contentType: 'markdown' | 'whiteboard';
  versionName: string; createdAt: string; updatedAt: string; expiresAt?: string | null; revokedAt?: string | null;
}
export interface SharedItem {
  title: string; contentType: 'markdown' | 'whiteboard'; versionName: string; publishedAt: string;
  markdown?: string; whiteboard?: { revision: number; scene: string };
  assets: { id: string; fileName: string; mime: string }[];
}
export interface ItemComment {
  id: string; itemId: string; authorName: string; body: string; createdAt: string; canDelete: boolean;
}
export interface ActivityEvent {
  id: string; itemId?: string | null; itemTitle?: string; actorName: string;
  type: string; summary: string; createdAt: string;
}

export type RegistrationMode = 'closed' | 'invite_only' | 'open';
/** 最小公开站点信息（`GET /api/site`，不需要登录）。 */
export interface SiteInfo {
  registrationMode: RegistrationMode;
  /**
   * 综合判定结果，不等于 `registrationMode === 'open'`：它同时要求模式为 `open`
   * **且**发送验证邮件所需的 SMTP 已就绪（§11.1）。SMTP 未配置的实例不得显示
   * 公开注册入口，否则给出的每一步都会被服务端拒绝。
   */
  publicRegistrationAvailable: boolean;
}

/**
 * 公开注册申请的受理响应（`POST /api/auth/sign-up/request`，202）。
 *
 * 「可以注册」「邮箱已有账号」「当前不可注册」三种情况的响应**逐字节一致**，
 * 因此这个类型里不存在、也不允许出现任何能区分邮箱状态的字段。前端只把它当作
 * 「已受理」，绝不据此推断邮箱是否存在。
 *
 * 服务端同响应里还有一个统一的 `message` 文案；页面刻意不渲染它——受理文案只在
 * 前端有一处来源，页面就不可能因为响应里换了句话而泄露状态。
 */
export interface SignUpRequestResult { accepted: boolean }
/**
 * 站点设置键。与后端 `internal/site` 的 `Key*` 常量一一对应，新增字段必须两侧同时改。
 * 命名约定：DB 列 `snake_case`，JSON `camelCase`。
 */
export type SiteSettingKey =
  | 'registrationMode'
  | 'allowWorkspaceOwnerInviteNewUsers'
  | 'inviteDefaultCanCreateWorkspace'
  | 'publicSignupDefaultCanCreateWorkspace';
export interface SiteSettings {
  schemaVersion: number;
  /** 乐观并发令牌：仅成功变更后 +1。 */
  revision: number;
  registrationMode: RegistrationMode;
  allowWorkspaceOwnerInviteNewUsers: boolean;
  inviteDefaultCanCreateWorkspace: boolean;
  publicSignupDefaultCanCreateWorkspace: boolean;
  /**
   * 服务端事实来源：哪些设置已真正接入生效。前端不得硬编码这份映射。
   * 为 true 的设置进入「已接入」区并提供控件；为 false 的进入「未接入」区且零交互控件。
   */
  implemented: Record<SiteSettingKey, boolean>;
  /** 本次初始化时实例已有账号（迁移 `origin = "upgrade"`）。 */
  upgradedInstance: boolean;
  updatedAt: string;
}
/** PATCH 只接受业务字段；`schemaVersion` / `revision` / `implemented` 由服务端拒绝。 */
export type SiteSettingsChanges = Partial<Pick<SiteSettings, SiteSettingKey>>;

/** 账号创建来源（§3.1）：只由可信的服务端流程写入，前端只做展示。 */
export type SignupSource =
  | 'setup'
  | 'workspace_invite'
  | 'public_signup'
  | 'admin_created'
  | 'legacy';

/** 站点级账号管理视图（`GET /api/admin/users`）。 */
export interface AdminUser {
  id: string;
  avatarUrl: string | null;
  name: string;
  email: string;
  isAdmin: boolean;
  disabled: boolean;
  /** 管理员维护的原始授权字段，不是最终能力。 */
  canCreateWorkspace: boolean;
  /** 服务端按身份计算的最终能力：`isAdmin || canCreateWorkspace`（且账号启用）。 */
  effectiveCanCreateWorkspace: boolean;
  signupSource: string;
  createdAt: string;
  revision: number;
}
/** 详情附带的风险统计（`GET /api/admin/users/{userId}`）。 */
export interface AdminUserStats {
  memberWorkspaces: number;
  ownedWorkspaces: number;
  /** 该账号可能是某些工作区唯一的可用 owner。是提示，不是禁止操作的理由（§6.6）。 */
  soleOwnerRisk: boolean;
}
export interface AdminUserDetail extends AdminUser { stats: AdminUserStats }
export interface AdminUserList { users: AdminUser[]; nextCursor: string | null }

/** `status` 只接受 `enabled / disabled`；`role` 只接受 `admin / user`；省略代表不筛选。 */
export type AdminUserStatusFilter = 'all' | 'enabled' | 'disabled';
export type AdminUserRoleFilter = 'all' | 'admin' | 'user';
export interface AdminUserListParams {
  q?: string;
  status?: AdminUserStatusFilter;
  role?: AdminUserRoleFilter;
  limit?: number;
  cursor?: string | null;
}
/** `changes` 只允许这三项，至少 1 个；布尔必须保留明确的 false。 */
export type AdminUserChanges = Partial<
  Pick<AdminUser, 'isAdmin' | 'disabled' | 'canCreateWorkspace'>
>;

/**
 * 管理审计事件（`GET /api/admin/audit-events`）。与后端 `internal/site` 的
 * `AuditEvent` 一一对应：`action` / `targetType` 是服务端白名单里的机器值，
 * `changes` 只含白名单业务字段的 `from` / `to`，不含密码、哈希、Cookie、
 * CSRF、令牌、请求体或 IP。页面负责把它们翻译成中文。
 */
export interface AuditEvent {
  id: number;
  actorKind: string;
  /** 操作者账号已删除时为 null（外键 `ON DELETE SET NULL`）。 */
  actorId: string | null;
  /** 操作者账号已删除时为空字符串，不是错误。 */
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  /** 业务字段前后值，例如 `{ disabled: { from: false, to: true } }`。 */
  changes: Record<string, unknown>;
  createdAt: string;
}
export interface AuditEventList { events: AuditEvent[]; nextBefore: string | null }

/** `action` 只接受服务端已登记的动作；`targetType` 只接受已登记的目标类型；省略代表不筛选。 */
export type AuditActionFilter =
  | 'all'
  | 'site.settings_changed'
  | 'user.disabled'
  | 'user.enabled'
  | 'user.admin_role_changed'
  | 'user.workspace_creation_changed'
  | 'user.sessions_revoked';
export type AuditTargetTypeFilter = 'all' | 'site_settings' | 'user';
export interface AuditEventListParams {
  action?: AuditActionFilter;
  targetType?: AuditTargetTypeFilter;
  limit?: number;
  /** keyset 游标：上一页最小的 `id`，不是偏移量。 */
  before?: string | null;
}

/**
 * 管理员显式建号的激活记录（§11.3）。它是**一条建号授权**，不是已存在的用户：
 * 账号要到对方自行设置姓名与密码后才产生。
 *
 * `status` 是服务端状态机值（pending / consumed / revoked / expired），未登记的值按原样展示；
 * 列表接口不返回任何令牌——原始令牌只在创建响应里出现一次。
 */
export interface AccountEnrollment {
  id: string;
  kind: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
  /** 签发管理员的 ID；账号已删除时为 null。 */
  createdBy: string | null;
  /** 管理员显式选定的初始创建授权（§11.3），不是站点默认值。 */
  canCreateWorkspace: boolean;
}
export interface EnrollmentList { enrollments: AccountEnrollment[] }
/** 创建响应：`token` / `url` 是原始令牌唯一一次出现的地方，列表无法再次取得。 */
export interface CreatedEnrollment { enrollment: AccountEnrollment; token: string; url: string }
/** 完成激活响应：服务端直接建立会话，`email_verified_at` 不会被写入（§11.4）。 */
export interface CompletedEnrollment { user: User; csrfToken: string }

/**
 * 完成公开注册响应（`POST /api/auth/sign-up/complete`）。服务端在同一事务里创建
 * 账号、写入 `email_verified_at`、消耗令牌并建立会话（§11.2），随后直接下发新
 * 的 CSRF 令牌。
 */
export interface CompletedSignUp { user: User; csrfToken: string }

/**
 * 发信能力诊断（`GET /api/admin/mail`）。
 *
 * 这是**部署侧配置**的只读镜像，不是站点设置：页面没有、也不需要有写它的控件。
 * 结构里刻意没有密码字段——管理页不请求、不展示、也不回显任何凭证；SMTP 用户名
 * 同样不回显，「配没配认证」是管理页唯一需要知道的事（§11.1）。
 *
 * 与 `internal/config.MailDiagnosis` 一一对应。`configured` 才是「能否启用公开注册」
 * 的前提；`host` / `port` / `from` / `publicUrl` 只是脱敏诊断，未配置时是空值，
 * 不是一个错误。
 */
export interface AdminMailStatus {
  configured: boolean;
  host: string;
  port: number;
  from: string;
  /** `none` / `starttls` / `implicit`：传输加密方式，不是布尔开关。 */
  tls: string;
  authConfigured: boolean;
  /** 发信链接使用的公开站点地址；空表示部署者没有显式配置。 */
  publicUrl: string;
}

export class APIError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
