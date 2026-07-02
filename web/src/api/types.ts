// Shared API types

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
// Shared API types

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
}

export interface PreflightResponse {
  registered: boolean;
  hasPassword: boolean;
}
