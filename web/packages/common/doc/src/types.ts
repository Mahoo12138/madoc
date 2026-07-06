export interface DocMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface LoadDocResult {
  missing: Uint8Array;
  snapshot: Uint8Array;
  updates: Uint8Array[];
  state: Uint8Array;
  timestamp: number;
}

export interface DocUpdateBroadcast {
  spaceType: string;
  spaceId: string;
  docId: string;
  update: string;
  timestamp: number;
  editor: string;
}

export interface AwarenessBroadcast {
  spaceType: string;
  spaceId: string;
  docId: string;
  awarenessUpdate: string;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
