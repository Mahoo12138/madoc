import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { APIError, type AdminUser, type AdminUserChanges, type AdminUserDetail, type AdminUserList, type AdminUserListParams, type AuditEventList, type AuditEventListParams, type EnrollmentList, type ItemType, type Role, type SiteInfo, type SiteSettings, type SiteSettingsChanges } from './types';

const retryWorkspaceRead = (count: number, error: Error) =>
  !(error instanceof APIError && [401, 403, 404].includes(error.status)) && count < 3;
// Retrying an auth decision cannot change it: 401 sends the page to /sign-in and
// 403 renders the no-permission state, so both must fail on the first response.
const retrySiteSettingsRead = (count: number, error: Error) =>
  !(error instanceof APIError && (error.status === 401 || error.status === 403)) && count < 3;
// Same reasoning for the user list: an auth decision (401/403) and a rejected
// write (409) are both final answers, so retrying only hides them.
const retryAdminUsersRead = (count: number, error: Error) =>
  !(error instanceof APIError && [401, 403, 404, 409].includes(error.status)) && count < 3;
// 审计列表同理由：401/403 是授权结论，400 是被白名单拒绝的筛选，重试都不会变。
const retryAdminAuditRead = (count: number, error: Error) =>
  !(error instanceof APIError && [400, 401, 403].includes(error.status)) && count < 3;

// Same reasoning for the enrollment list: 401/403 are authorization decisions
// and 404/409 are final answers about this record.
const retryEnrollmentRead = (count: number, error: Error) =>
  !(error instanceof APIError && [401, 403, 404, 409].includes(error.status)) && count < 3;

export const keys = { session: ['session'] as const, workspaces: ['workspaces'] as const, workspace: (id: string) => ['workspace', id] as const, items: (id: string) => ['items', id] as const, members: (id: string) => ['members', id] as const, invites: (id: string) => ['invites', id] as const, activity: (id: string) => ['activity', id] as const, markdown: (id: string) => ['markdown', id] as const, whiteboard: (id: string) => ['whiteboard', id] as const, siteSettings: ['siteSettings'] as const, siteInfo: ['siteInfo'] as const, /** 前缀根：失效后所有筛选与分页重新读取。 */ adminUsers: ['adminUsers'] as const, adminUserList: (params: AdminUserListParams) => ['adminUsers', 'list', params] as const, adminUser: (id: string) => ['adminUsers', 'detail', id] as const, /** 前缀根：撤销或新建后重新读取待激活列表。 */ accountEnrollments: ['accountEnrollments'] as const, /** 前缀根：设置或账号变更后让操作记录重新读取。 */ adminAudit: ['adminAudit'] as const, auditEventList: (params: AuditEventListParams) => ['adminAudit', 'list', params] as const };
export const useSession = () => useQuery({ queryKey: keys.session, queryFn: api.session, staleTime: 60_000, retry: false, retryOnMount: false });
export const useWorkspaces = () => useQuery({ queryKey: keys.workspaces, queryFn: api.workspaces });
export const useWorkspace = (id: string) => useQuery({ queryKey: keys.workspace(id), queryFn: () => api.workspace(id), retry: retryWorkspaceRead, retryOnMount: false });
export const useItems = (id: string) => useQuery({ queryKey: keys.items(id), queryFn: () => api.items(id), retry: retryWorkspaceRead, retryOnMount: false });
export const useMembers = (id: string) => useQuery({ queryKey: keys.members(id), queryFn: () => api.members(id) });
export const useInvites = (id: string, enabled = true) => useQuery({ queryKey: keys.invites(id), queryFn: () => api.invites(id), enabled });
export const useWorkspaceActivity = (id: string) => useInfiniteQuery({ queryKey: keys.activity(id), queryFn: ({ pageParam }) => api.workspaceActivity(id, pageParam), initialPageParam: '', getNextPageParam: (page) => page.nextBefore || undefined });
export const useMarkdown = (id: string) => useQuery({ queryKey: keys.markdown(id), queryFn: () => api.markdown(id) });
export const useWhiteboard = (id: string) => useQuery({ queryKey: keys.whiteboard(id), queryFn: () => api.whiteboard(id) });
export const useSiteSettings = () => useQuery({ queryKey: keys.siteSettings, queryFn: api.siteSettings, retry: retrySiteSettingsRead, retryOnMount: false });
// 匿名可读的公开站点信息：失败只是少一句说明文案，登录页与邀请页都要静默降级。
export const useSiteInfo = () => useQuery<SiteInfo>({ queryKey: keys.siteInfo, queryFn: api.siteInfo, retry: false, retryOnMount: false, staleTime: 60_000 });
export const useUpdateSiteSettings = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedRevision: number; changes: SiteSettingsChanges }) => api.updateSiteSettings(input.expectedRevision, input.changes),
    // The response is the complete DTO including the new revision: write it
    // straight into the cache instead of paying for a second round trip.
    onSuccess: (settings) => client.setQueryData<SiteSettings>(keys.siteSettings, settings),
  });
};

export const useAdminUsers = (params: AdminUserListParams) => useQuery<AdminUserList>({ queryKey: keys.adminUserList(params), queryFn: () => api.adminUsers(params), retry: retryAdminUsersRead, retryOnMount: false, placeholderData: (previous) => previous });
export const useAdminUser = (userId: string | null) => useQuery<AdminUserDetail>({ queryKey: keys.adminUser(userId ?? ''), queryFn: () => api.adminUser(userId!), enabled: !!userId, retry: retryAdminUsersRead, retryOnMount: false });
export const useUpdateAdminUser = () => {
  const client = useQueryClient();
  return useMutation({
    // 权限修改不做乐观更新（§10.3）：只有服务端确认后的返回值才进入缓存。
    mutationFn: (input: { userId: string; expectedRevision: number; changes: AdminUserChanges }) => api.updateAdminUser(input.userId, input.expectedRevision, input.changes),
    retry: false,
    onSuccess: (user) => {
      if (client.getQueryData<AdminUserDetail>(keys.adminUser(user.id)))
        client.setQueryData<AdminUserDetail>(keys.adminUser(user.id), (previous) => (previous ? { ...previous, ...user } : previous));
      void client.invalidateQueries({ queryKey: keys.adminUsers });
    },
  });
};
export const useRevokeUserSessions = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.revokeUserSessions(userId),
    // 危险动作失败不得自动重试（§6.4）：稍后误撤销用户新建立的会话比失败更糟。
    retry: false,
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.adminUsers }),
  });
};

/**
 * 待激活的激活记录列表（§11.3）。这不是用户列表的一部分：它是「已批准但还没有账号」
 * 的授权记录，只有服务端能给出它的状态。
 */
export const useAccountEnrollments = () => useQuery<EnrollmentList>({ queryKey: keys.accountEnrollments, queryFn: api.accountEnrollments, retry: retryEnrollmentRead, retryOnMount: false });
export const useCreateAccountEnrollment = () => {
  const client = useQueryClient();
  return useMutation({
    // 不做乐观更新（§10.3）：列表行只能来自服务端确认，激活链接更是只能用服务端的那一次返回。
    mutationFn: (input: { email: string; canCreateWorkspace: boolean }) => api.createAccountEnrollment(input.email, input.canCreateWorkspace),
    // 写失败不重试：重复 POST 会白白发掉一条新的建号授权，而失败原因多半不会自行消失。
    retry: false,
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.accountEnrollments }),
  });
};
export const useRevokeAccountEnrollment = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) => api.revokeAccountEnrollment(enrollmentId),
    // 危险动作失败不自动重试：一次误撤销等于收回管理员明确给出的准入授权。
    retry: false,
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.accountEnrollments }),
  });
};
export const useCompleteAccountEnrollment = () =>
  useMutation({
    // 令牌只能被消费一次：失败不重试，否则第二次请求会把「响应丢失」变成一次真实建号。
    mutationFn: (input: { token: string; name: string; password: string }) => api.completeAccountEnrollment(input.token, { name: input.name, password: input.password }),
    retry: false,
  });

/**
 * 操作记录按 keyset 游标分页（`before` = 上一页最小的 `id`），不是偏移量：
 * 翻页期间新写入的记录不会让已读的页错位或重复。游标由 `pageParam` 驱动，
 * 因此筛选参数里刻意不含 `before`，查询键只跟随筛选变化。
 */
export const useAuditEvents = (params: Omit<AuditEventListParams, 'before'>) =>
  useInfiniteQuery({
    queryKey: keys.auditEventList(params),
    queryFn: ({ pageParam }) => api.auditEvents({ ...params, before: pageParam || undefined }),
    initialPageParam: '',
    getNextPageParam: (page: AuditEventList) => page.nextBefore ?? undefined,
    retry: retryAdminAuditRead,
    retryOnMount: false,
  });

export function useWorkspaceMutations(workspaceId?: string) {
  const client = useQueryClient();
  const refreshItems = () => workspaceId ? client.invalidateQueries({ queryKey: keys.items(workspaceId) }) : Promise.resolve();
  return {
    createWorkspace: useMutation({ mutationFn: api.createWorkspace, onSuccess: () => client.invalidateQueries({ queryKey: keys.workspaces }) }),
    createItem: useMutation({ mutationFn: (input: { type: ItemType; title: string; parentId: string | null }) => api.createItem(workspaceId!, input.type, input.title, input.parentId), onSuccess: refreshItems }),
    renameItem: useMutation({ mutationFn: (input: { id: string; title: string }) => api.renameItem(input.id, input.title), onSuccess: refreshItems }),
    deleteItem: useMutation({ mutationFn: api.deleteItem, onSuccess: refreshItems }),
    moveItem: useMutation({ mutationFn: (input: { id: string; parentId: string | null; index: number }) => api.moveItem(input.id, input.parentId, input.index), onSuccess: refreshItems }),
    updateMember: useMutation({ mutationFn: (input: { userId: string; role: Role }) => api.updateMember(workspaceId!, input.userId, input.role), onSuccess: () => client.invalidateQueries({ queryKey: keys.members(workspaceId!) }) }),
    removeMember: useMutation({ mutationFn: (userId: string) => api.removeMember(workspaceId!, userId), onSuccess: () => client.invalidateQueries({ queryKey: keys.members(workspaceId!) }) }),
    createInvite: useMutation({ mutationFn: (input: { email: string; role: 'editor' | 'viewer' }) => api.createInvite(workspaceId!, input.email, input.role), onSuccess: () => client.invalidateQueries({ queryKey: keys.invites(workspaceId!) }) }),
    revokeInvite: useMutation({ mutationFn: (inviteId: string) => api.revokeInvite(workspaceId!, inviteId), onSuccess: () => client.invalidateQueries({ queryKey: keys.invites(workspaceId!) }) }),
  };
}
