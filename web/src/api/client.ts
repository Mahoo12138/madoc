import type {
  PreflightResponse,
  ServerInfo,
  User,
  Workspace,
} from './types';

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

// ─── REST API ──────────────────────────────────────

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

// ─── GraphQL ───────────────────────────────────────

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function graphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch('/graphql', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const body: GraphQLResponse<T> = await res.json();

  if (body.errors?.length) {
    throw new ApiError(res.status, body.errors[0].message);
  }

  return body.data as T;
}

export const gql = {
  workspaces: () =>
    graphql<{ workspaces: Workspace[] }>(`
      query {
        workspaces {
          id
          name
          public
          createdAt
          role
          memberCount
        }
      }
    `).then(r => r.workspaces),

  createWorkspace: () =>
    graphql<{ createWorkspace: Workspace }>(`
      mutation {
        createWorkspace {
          id
          name
          public
          createdAt
          role
          memberCount
        }
      }
    `).then(r => r.createWorkspace),

  updateWorkspace: (id: string, name: string) =>
    graphql<{ updateWorkspace: Workspace }>(
      `
      mutation updateWorkspace($input: UpdateWorkspaceInput!) {
        updateWorkspace(input: $input) {
          id
          name
          public
          createdAt
          role
          memberCount
        }
      }
      `,
      { input: { id, name } },
    ).then(r => r.updateWorkspace),
};
