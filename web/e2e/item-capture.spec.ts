import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

test('item capture returns a fixed Markdown or whiteboard state with its watermark', async ({ page }) => {
  const markdownId = await openDocument(page, 'Capture me');
  const markdownResponse = await page.request.get(`/api/items/${markdownId}/capture`);
  expect(markdownResponse.ok()).toBeTruthy();
  expect(markdownResponse.headers()['cache-control']).toBe('no-store');
  const markdownCapture = await markdownResponse.json();
  expect(markdownCapture.item.id).toBe(markdownId);
  expect(markdownCapture.item.type).toBe('markdown');
  expect(markdownCapture.capturedAt).toBeTruthy();
  expect(markdownCapture.markdown.generation).toBe(1);
  expect(markdownCapture.markdown.cacheSeq).toBe(markdownCapture.markdown.headSeq);
  expect(markdownCapture.markdown.markdown.trimEnd()).toBe('Capture me');
  expect(markdownCapture.markdown.snapshot).toBeDefined();
  expect(markdownCapture.markdown.updates?.length).toBeGreaterThan(0);
  expect(markdownCapture.whiteboard).toBeUndefined();

  const workspaceId = new URL(page.url()).pathname.split('/')[2]!;
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const boardResponse = await page.request.post(`/api/workspaces/${workspaceId}/items`, {
    headers: { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { type: 'whiteboard', title: 'Captured board', parentId: null },
  });
  expect(boardResponse.ok()).toBeTruthy();
  const board = await boardResponse.json();
  const whiteboardCapture = await (await page.request.get(`/api/items/${board.id}/capture`)).json();
  expect(whiteboardCapture.item.type).toBe('whiteboard');
  expect(whiteboardCapture.whiteboard).toMatchObject({ revision: 0, scene: { elements: [], appState: {}, files: {} } });
  expect(whiteboardCapture.markdown).toBeUndefined();
});
