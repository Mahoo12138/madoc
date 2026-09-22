import { request } from './client';
import type { User } from './types';
export const accountAPI = {
  rename: (name: string) =>
    request<User>('/me', { method: 'PATCH', body: JSON.stringify({ name }) }),
  avatar: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<User>('/me/avatar', { method: 'PUT', body });
  },
  removeAvatar: () => request<User>('/me/avatar', { method: 'DELETE' }),
  password: (currentPassword: string, newPassword: string) =>
    request<void>('/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};
