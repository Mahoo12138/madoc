import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

const embeddedImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=';
const scene = {
  elements: [],
  appState: { viewBackgroundColor: '#ffffff' },
  files: { image: { id: 'image', mimeType: 'image/png', dataURL: embeddedImage, created: 1 } },
};

async function openWhiteboard(page: Parameters<typeof openDocument>[0]) {
  await openDocument(page, 'Setup source');
  const workspaceId = new URL(page.url()).pathname.split('/')[2]!;
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const response = await page.request.post(`/api/workspaces/${workspaceId}/items`, {
    headers: { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { type: 'whiteboard', title: 'Source board', parentId: null },
  });
  expect(response.ok()).toBeTruthy();
  const source = await response.json();
  await page.goto(`/workspace/${workspaceId}/${source.id}`);
  await expect(page.getByRole('button', { name: '导出' })).toBeVisible();
  return { workspaceId, sourceId: source.id as string };
}

test('Excalidraw import previews structure and creates a separate board with embedded files', async ({ page }) => {
  const { sourceId } = await openWhiteboard(page);
  const file = { type: 'excalidraw', version: 2, source: 'https://excalidraw.com', ...scene };
  await page.getByRole('button', { name: '导出' }).click();
  await page.getByRole('menuitem', { name: '导入 Excalidraw JSON' }).click();
  await page.locator('input[type="file"][accept=".excalidraw,application/json"]').setInputFiles({
    name: 'Source board.excalidraw',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });

  const dialog = page.getByRole('dialog', { name: '导入 Excalidraw 预览' });
  await expect(dialog.getByLabel('新白板名称')).toHaveValue('Source board');
  await expect(dialog).toContainText('元素：0');
  await expect(dialog).toContainText('嵌入文件：1');
  await dialog.getByRole('button', { name: '创建为新白板' }).click();
  await expect(dialog).toHaveCount(0);

  const importedId = new URL(page.url()).pathname.split('/').at(-1)!;
  expect(importedId).not.toBe(sourceId);
  const imported = await (await page.request.get(`/api/items/${importedId}/whiteboard`)).json();
  expect(imported.revision).toBe(0);
  expect(imported.scene).toEqual(scene);
  const original = await (await page.request.get(`/api/items/${sourceId}/whiteboard`)).json();
  expect(original.revision).toBe(0);
  expect(original.scene).toEqual({ elements: [], appState: {}, files: {} });
});

test('unsupported Excalidraw data keeps the preview open and never creates a board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { sourceId } = await openWhiteboard(page);
  await page.getByRole('button', { name: '导出' }).click();
  await page.getByRole('menuitem', { name: '导入 Excalidraw JSON' }).click();
  await page.locator('input[type="file"][accept=".excalidraw,application/json"]').setInputFiles({
    name: 'Unsupported.excalidraw',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ type: 'excalidraw', version: 99, elements: [], appState: {}, files: {} })),
  });
  const dialog = page.getByRole('dialog', { name: '导入 Excalidraw 预览' });
  await expect(dialog.getByRole('alert')).toContainText('版本不受支持');
  await expect(dialog.getByRole('button', { name: '创建为新白板' })).toBeDisabled();
  const items = await (await page.request.get(`/api/workspaces/${new URL(page.url()).pathname.split('/')[2]}/items`)).json();
  expect(items.filter((item: { title: string }) => item.title === 'Unsupported')).toHaveLength(0);
  expect((await (await page.request.get(`/api/items/${sourceId}/whiteboard`)).json()).scene).toEqual({ elements: [], appState: {}, files: {} });
});
