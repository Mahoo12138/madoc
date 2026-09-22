import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

const origin = 'http://127.0.0.1:3100';

test('owner purge requires confirmation and preserves nested batches and asset files', async ({ page }) => {
  const doc = await openDocument(page, 'Purge fixture');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, origin);
  const folder = await (await page.request.post(`/api/workspaces/${workspace}/items`, { headers, data: { type: 'folder', title: 'Parent batch' } })).json();
  const nested = await (await page.request.post(`/api/workspaces/${workspace}/items`, { headers, data: { type: 'markdown', title: 'Earlier batch', parentId: folder.id } })).json();
  expect((await page.request.post(`/api/items/${doc}/move`, { headers, data: { parentId: folder.id, index: 0 } })).ok()).toBeTruthy();
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=', 'base64');
  const upload = await page.request.post(`/api/workspaces/${workspace}/assets`, { headers, multipart: { itemId: doc, file: { name: 'shared.png', mimeType: 'image/png', buffer: image } } });
  expect(upload.ok()).toBeTruthy();
  const { asset } = await upload.json();
  await page.goto('/workspaces');
  expect((await page.request.delete(`/api/items/${nested.id}`, { headers })).status()).toBe(204);
  expect((await page.request.delete(`/api/items/${folder.id}`, { headers })).status()).toBe(204);
  const list = `/api/workspaces/${workspace}/trash`;
  const batches = await (await page.request.get(list)).json();
  const selected = batches.find((batch: { root: { id: string } }) => batch.root.id === folder.id);
  const earlier = batches.find((batch: { root: { id: string } }) => batch.root.id === nested.id);
  const details = await (await page.request.get(`${list}/${selected.id}/items`)).json();
  expect(details.map((item: { id: string }) => item.id).sort()).toEqual([folder.id, doc].sort());
  expect((await page.request.delete(`${list}/${selected.id}`, { data: { confirmation: 'Parent batch' } })).status()).toBe(403);
  expect((await page.request.delete(`${list}/${selected.id}`, { headers, data: {} })).status()).toBe(400);
  expect((await page.request.delete(`${list}/${selected.id}`, { headers, data: { confirmation: 'Wrong batch' } })).status()).toBe(400);
  expect((await page.request.delete(`${list}/${selected.id}`, { headers, data: { confirmation: 'Parent batch' } })).status()).toBe(204);
  expect(await (await page.request.get(`/api/assets/${asset.id}`)).body()).toEqual(image);
  const remaining = await (await page.request.get(list)).json();
  expect(remaining).toHaveLength(1);
  expect(remaining[0].id).toBe(earlier.id);
  expect((await page.request.get(`${list}/${selected.id}/items`)).status()).toBe(404);
  expect((await page.request.post(`${list}/${earlier.id}/restore`, { headers, data: {} })).status()).toBe(409);
  expect((await page.request.post(`${list}/${earlier.id}/restore`, { headers, data: { destination: { parentId: null } } })).status()).toBe(204);
  expect((await page.request.get(`/api/items/${nested.id}`)).ok()).toBeTruthy();
  expect((await page.request.get(`/api/items/${doc}`)).status()).toBe(404);
});

for (const role of ['editor', 'viewer']) {
  test(`${role} cannot purge a batch through the API`, async ({ page, browser }) => {
    const doc = await openDocument(page, 'Protected batch');
    const workspace = new URL(page.url()).pathname.split('/')[2];
    const headers = await accountHeaders(page, origin);
    const invite = await (await page.request.post(`/api/workspaces/${workspace}/invites`, { headers, data: { email: `purge-${role}@example.test`, role } })).json();
    await page.goto('/workspaces');
    expect((await page.request.delete(`/api/items/${doc}`, { headers })).status()).toBe(204);
    const list = `/api/workspaces/${workspace}/trash`;
    const [batch] = await (await page.request.get(list)).json();
    const context = await browser.newContext();
    try {
      const accepted = await context.request.post(`${origin}/api/invites/${invite.token}/accept`, { data: { name: role, password: 'password123' } });
      expect(accepted.ok()).toBeTruthy();
      const { csrfToken } = await (await context.request.get(`${origin}/api/auth/session`)).json();
      const response = await context.request.delete(`${origin}${list}/${batch.id}`, { headers: { Origin: origin, 'x-madoc-csrf-token': csrfToken }, data: { confirmation: batch.root.title } });
      expect(response.status()).toBe(403);
      expect((await context.request.get(`${origin}${list}/${batch.id}/items`)).status()).toBe(role === 'editor' ? 200 : 403);
      expect(await (await page.request.get(list)).json()).toHaveLength(1);
    } finally { await context.close(); }
  });
}
