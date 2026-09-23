import type { Role } from '@/api/types';

export const roleLabels: Record<Role, string> = {
  owner: '所有者',
  editor: '编辑者',
  viewer: '查看者',
};
