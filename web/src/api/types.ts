export type Role = 'owner' | 'editor' | 'viewer';
export type ItemType = 'folder' | 'markdown' | 'whiteboard';

export interface User { avatarUrl?: string | null; id: string; name: string; email: string; isAdmin: boolean; disabled: boolean }
export interface Workspace { id: string; name: string; role: Role; createdAt: string; updatedAt: string }
export interface Member { avatarUrl?: string | null; userId: string; name: string; email: string; role: Role; createdAt: string }
export interface Invite { id: string; workspaceId: string; email: string; role: Exclude<Role, 'owner'>; status: string; expiresAt: string; createdAt: string }
export interface Item { id: string; workspaceId: string; parentId: string | null; type: ItemType; title: string; sortKey: number; createdBy: string; createdAt: string; updatedAt: string }
export interface Session { user: User | null; csrfToken?: string }
export interface MarkdownState { markdown: string; cacheSeq: number; generation: number }
export interface MarkdownCapture { generation: number; snapshot: string | null; snapshotSeq: number; markdown: string; cacheSeq: number; updates: { seq: number; update: string; userId?: string }[] | null; headSeq: number }
export interface BoardScene { elements: readonly unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> }
export interface WhiteboardState { revision: number; scene: BoardScene }
export interface ItemCapture { item: Item; capturedAt: string; markdown?: MarkdownCapture; whiteboard?: WhiteboardState }

export class APIError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
