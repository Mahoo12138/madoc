import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

const origin = 'http://127.0.0.1:3100';
test('duplicate creates independent real Yjs documents and preserves board resources', async ({
  page,
}) => {
  const id = await openDocument(page, '# Original\n\n**Strong** and $x^2$.');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, origin);
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Live tail');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const state = await (
        await page.request.get(`/api/items/${id}/markdown`)
      ).json();
      return state.markdown.includes('Live tail');
    })
    .toBe(true);
  const before = await (
    await page.request.get(`/api/items/${id}/markdown`)
  ).json();
  expect(
    (
      await page.request.post(`/api/items/${id}/duplicate`, {
        data: { title: 'CSRF denied' },
      })
    ).status(),
  ).toBe(403);
  const response = await page.request.post(`/api/items/${id}/duplicate`, {
    headers,
    data: { title: 'Independent copy' },
  });
  expect(response.status()).toBe(201);
  const copy = await response.json();
  expect(copy.id).not.toBe(id);
  const state = await (
    await page.request.get(`/api/items/${copy.id}/markdown`)
  ).json();
  expect(state.markdown).toBe(before.markdown);
  expect(
    (await page.request.get(`/api/items/${copy.id}/export.md`)).status(),
  ).toBe(200);
  await page.goto(`/workspace/${workspace}/${copy.id}`);
  await expect(editor.locator('h1')).toHaveText('Original');
  await expect(editor.locator('strong')).toHaveText('Strong');
  await expect(editor).toContainText('Live tail');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Copy only');
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/items/${copy.id}/markdown`)
          ).json()
        ).markdown,
    )
    .toContain('Copy only');
  expect(
    (await (await page.request.get(`/api/items/${id}/markdown`)).json())
      .markdown,
  ).toBe(before.markdown);
  const board = await (
    await page.request.post(`/api/workspaces/${workspace}/items`, {
      headers,
      data: { type: 'whiteboard', title: 'Resource board', parentId: null },
    })
  ).json();
  const scene = {
    elements: [{ id: 'image', type: 'image', fileId: 'file', version: 1 }],
    appState: {},
    files: {
      file: {
        id: 'file',
        dataURL: 'data:image/png;base64,YQ==',
        mimeType: 'image/png',
        created: 1,
      },
    },
  };
  expect(
    (
      await page.request.put(`/api/items/${board.id}/whiteboard`, {
        headers,
        data: { baseRevision: 0, scene },
      })
    ).ok(),
  ).toBeTruthy();
  const boardCopy = await (
    await page.request.post(`/api/items/${board.id}/duplicate`, {
      headers,
      data: { title: 'Board copy' },
    })
  ).json();
  const copiedScene = await (
    await page.request.get(`/api/items/${boardCopy.id}/whiteboard`)
  ).json();
  expect(copiedScene.scene).toEqual(scene);
  expect(copiedScene.revision).toBe(0);
});

test('copy rejects a lagging projection without leaving an empty item', async ({
  page,
}) => {
  let hold = false;
  let lastCache = '';
  let forward = (_message: string) => {};
  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    forward = (message) => server.send(message);
    socket.onMessage((message) => {
      if (
        hold &&
        JSON.parse(String(message)).type === 'markdown.cache.update'
      ) {
        lastCache = String(message);
        return;
      }
      server.send(message);
    });
  });
  const id = await openDocument(page, 'Saved');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, origin);
  hold = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' acknowledged');
  await expect.poll(() => lastCache).not.toBe('');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const failed = await page.request.post(`/api/items/${id}/duplicate`, {
    headers,
    data: { title: 'Pending copy' },
  });
  expect(failed.status()).toBe(409);
  expect((await failed.json()).error.code).toBe('COPY_NOT_READY');
  const items = await (
    await page.request.get(`/api/workspaces/${workspace}/items`)
  ).json();
  expect(items).toHaveLength(1);
  hold = false;
  forward(lastCache);
  await expect
    .poll(async () =>
      (await page.request.get(`/api/items/${id}/export.md`)).status(),
    )
    .toBe(200);
  expect(
    (
      await page.request.post(`/api/items/${id}/duplicate`, {
        headers,
        data: { title: 'Ready copy' },
      })
    ).status(),
  ).toBe(201);
});
