import type { Role } from '@/api/types';

export const roleLabels: Record<Role, string> = {
  owner: '所有者',
  editor: '编辑者',
  viewer: '查看者',
};

export const roleDescriptions: Record<Role, string> = {
  owner: '可管理工作区、成员和全部内容。',
  editor: '可创建、编辑和管理工作区内容。',
  viewer: '仅可查看工作区内容，不能修改。',
};

export const inviteStatusLabels: Record<string, string> = {
  pending: '待接受',
  accepted: '已接受',
  revoked: '已撤销',
  expired: '已过期',
};

export function inviteStatusLabel(status: string) {
  return inviteStatusLabels[status] ?? status;
}
