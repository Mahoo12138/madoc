import { request } from './client';

export type ContentImportResult = { rootId: string; itemCount: number; attachmentCount: number; replayed: boolean };

export async function submitContentImport(workspaceId: string, rootId: string, body: FormData, signal: AbortSignal) {
  const result = await request<ContentImportResult>(`/workspaces/${workspaceId}/imports`, {
    method: 'POST',
    body,
    signal,
  });
  // A malformed success response is an uncertain outcome, never permission to
  // generate a different import request and potentially publish a duplicate.
  if (
    !result ||
    result.rootId !== rootId ||
    !Number.isInteger(result.itemCount) ||
    result.itemCount < 1 ||
    !Number.isInteger(result.attachmentCount) ||
    result.attachmentCount < 0 ||
    typeof result.replayed !== 'boolean'
  ) {
    throw new Error('导入响应无法确认。');
  }
  return result;
}
