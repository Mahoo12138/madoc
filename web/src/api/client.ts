import type { PreflightResponse, ServerInfo, User } from './types';

async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      // response body is not JSON
    }
    throw new ApiError(res.status, message);
  }

  // Some endpoints (e.g. sign-out) return simple JSON
  return res.json().catch(() => ({}) as T);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  getInfo: () => request<ServerInfo>('/info'),

  getSession: () =>
    request<{ user: User | null }>('/api/auth/session'),

  preflight: (email: string) =>
    request<PreflightResponse>('/api/auth/preflight', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  signIn: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  signOut: () =>
    request<{ ok: string }>('/api/auth/sign-out', { method: 'POST' }),

  createAdmin: (name: string, email: string, password: string) =>
    request<{ id: string; name: string; email: string }>(
      '/api/setup/create-admin-user',
      {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      },
    ),
};
