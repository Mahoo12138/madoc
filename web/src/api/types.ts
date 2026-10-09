export type Role = 'owner' | 'editor' | 'viewer';
export type ItemType = 'folder' | 'markdown' | 'whiteboard';

/** 服务端计算的能力位（`/api/auth/session` 与 `/api/me` 同构）；前端只读，不根据 `isAdmin` 推导。 */
export interface UserCapabilities { canManageSite: boolean; canCreateWorkspace: boolean }

export interface User { avatarUrl?: string | null; id: string; name: string; email: string; isAdmin: boolean; disabled: boolean; capabilities: UserCapabilities }
export interface Workspace { id: string; name: string; description: string; role: Role; createdAt: string; updatedAt: string }
export interface Member { avatarUrl?: string | null; userId: string; name: string; email: string; role: Role; createdAt: string }
export interface Invite { id: string; workspaceId: string; email: string; role: Exclude<Role, 'owner'>; status: string; expiresAt: string; createdAt: string }
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

export class APIError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
