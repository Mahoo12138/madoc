export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface ServerInfo {
  version: string;
  type: string;
  flavor: string;
  initialized: boolean;
}

export interface PreflightResponse {
  registered: boolean;
  hasPassword: boolean;
}

export interface Workspace {
  id: string;
  name: string | null;
  public: boolean;
  createdAt: string;
  role: string;
  memberCount: number;
}
