export interface DocMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface LoadDocResult {
  missing: Uint8Array;
  state: Uint8Array;
  timestamp: number;
}

export interface DocUpdateBroadcast {
  spaceType: string;
  spaceId: string;
  docId: string;
  update: string; // base64
  timestamp: number;
  editor: string;
}
