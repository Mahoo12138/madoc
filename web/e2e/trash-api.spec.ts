import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

const origin = 'http://127.0.0.1:3100';

test('trash API preserves a deleted subtree, assets and previous deletion batches', async ({ page }) => {
  const doc = await openDocument(page, '# Kept document\n\nContent survives trash.');
  const url = page.url();
  const workspace = new URL(url).pathname.split('/')[2];
  const headers = await accountHeaders(page, origin);
  const create = async (type: string, title: string, parentId: string | null = null) => {
    const response = await page.request.post(`/api/workspaces/${workspace}/items`, { headers, data: { type, title, parentId } });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const folder = await create('folder', 'Preserved subtree');
  const earlier = await create('markdown', 'Earlier deletion', folder.id);
  const board = await create('whiteboard', 'Preserved board', folder.id);
  expect((await page.request.post(`/api/items/${doc}/move`, { headers, data: { parentId: folder.id, index: 0 } })).ok()).toBeTruthy();
  const scene = { elements: [{ id: 'kept-shape', type: 'rectangle', version: 1 }], appState: {}, files: {} };
  expect((await page.request.put(`/api/items/${board.id}/whiteboard`, { headers, data: { baseRevision: 0, scene } })).ok()).toBeTruthy();
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=', 'base64');
  const upload = await page.request.post(`/api/workspaces/${workspace}/assets`, { headers, multipart: { file: { name: 'kept.png', mimeType: 'image/png', buffer: image }, itemId: doc } });
  expect(upload.ok()).toBeTruthy();
  const { asset } = await upload.json();
  await page.goto('/workspaces');
  expect((await page.request.delete(`/api/items/${earlier.id}`, { headers })).status()).toBe(204);
  expect((await page.request.delete(`/api/items/${folder.id}`, { headers })).status()).toBe(204);
  expect(await (await page.request.get(`/api/workspaces/${workspace}/items`)).json()).toEqual([]);
  const list = `/api/workspaces/${workspace}/trash`;
  const batches = await (await page.request.get(list)).json();
  expect(batches).toHaveLength(2);
  const parentBatch = batches.find((batch: { root: { id: string } }) => batch.root.id === folder.id);
  const earlierBatch = batches.find((batch: { root: { id: string } }) => batch.root.id === earlier.id);
  expect(parentBatch.itemCount).toBe(3);
  for (const path of [`/api/items/${doc}`, `/api/items/${doc}/markdown`, `/api/items/${doc}/export.md`, `/api/items/${board.id}/whiteboard`]) {
    expect((await page.request.get(path)).status()).toBe(404);
  }
  expect((await page.request.put(`/api/items/${board.id}/whiteboard`, { headers, data: { baseRevision: 1, scene } })).status()).toBe(404);
  const invalid = await page.request.post(`${list}/${earlierBatch.id}/restore`, { headers, data: {} });
  expect(invalid.status()).toBe(409);
  expect((await invalid.json()).error.code).toBe('RESTORE_DESTINATION_REQUIRED');
  expect((await page.request.post(`${list}/${parentBatch.id}/restore`, { headers, data: {} })).status()).toBe(204);
  expect((await page.request.get(`/api/items/${earlier.id}`)).status()).toBe(404);
  expect((await (await page.request.get(`/api/items/${board.id}/whiteboard`)).json()).scene).toEqual(scene);
  expect(await (await page.request.get(`/api/assets/${asset.id}`)).body()).toEqual(image);
  await page.goto(url);
  await expect(page.locator('.ProseMirror h1')).toHaveText('Kept document');
  await expect(page.locator('.ProseMirror p')).toHaveText('Content survives trash.');
  expect((await page.request.post(`${list}/${earlierBatch.id}/restore`, { headers, data: { destination: { parentId: null } } })).status()).toBe(204);
  expect((await (await page.request.get(`/api/items/${earlier.id}`)).json()).parentId).toBeNull();
  expect(await (await page.request.get(list)).json()).toEqual([]);
});
