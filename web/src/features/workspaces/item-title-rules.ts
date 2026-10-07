/**
 * Titles come from the server and are reused in headers, modals and confirm
 * copy. Keep one length rule so the client can reject an over-long draft with
 * a readable message instead of surfacing an opaque server error.
 */
export const TITLE_MAX = 120;

/** Unicode code points, not UTF-16 units: an emoji counts as one character. */
export function titleLength(value: string): number {
  return Array.from(value).length;
}

/** Empty or over-long titles are rejected before any request is sent. */
export function titleProblem(value: string): string | null {
  const length = titleLength(value);
  if (!value.trim()) return '名称不能为空';
  if (length > TITLE_MAX) return `名称不能超过 ${TITLE_MAX} 个字符，当前 ${length} 个`;
  return null;
}