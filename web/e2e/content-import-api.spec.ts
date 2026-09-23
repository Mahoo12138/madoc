import { createHash, randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import { expect, test, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=',
  'base64',
);

async function importPlan(page: Page) {
  const original = await openDocument(page);
  await page.locator('.ProseMirror').fill('Atomic import preserves this document');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const workspaceID = new URL(page.url()).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  const capture = await (await page.request.get(`/api/items/${original}/capture`)).json();
  const document = new Y.Doc();
  if (capture.markdown.snapshot) Y.applyUpdate(document, Buffer.from(capture.markdown.snapshot, 'base64'));
  for (const update of capture.markdown.updates) Y.applyUpdate(document, Buffer.from(update.update, 'base64'));
  const root = randomUUID(),
    doc = randomUUID(),
    board = randomUUID(),
    asset = randomUUID();
  const scene = {
    elements: [],
    appState: {},
    files: {
      image: { id: 'image', mimeType: 'image/png', dataURL: `data:image/png;base64,${image.toString('base64')}` },
    },
  };
  const plan = {
    id: randomUUID(),
    parentId: null,
    items: [
      {
        id: doc,
        parentId: root,
        type: 'markdown',
        title: 'Imported document',
        markdown: {
          snapshot: Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64'),
          markdown: capture.markdown.markdown,
        },
      },
      { id: root, parentId: null, type: 'folder', title: 'Imported bundle' },
      { id: board, parentId: root, type: 'whiteboard', title: 'Imported board', whiteboard: JSON.stringify(scene) },
    ],
    assets: [
      {
        id: asset,
        itemId: doc,
        fileName: 'image.png',
        mime: 'image/png',
        size: image.length,
        sha256: createHash('sha256').update(image).digest('hex'),
      },
    ],
  };
  document.destroy();
  const multipart = (payload = image) => ({
    plan: JSON.stringify(plan),
    [asset]: { name: 'image.png', mimeType: 'image/png', buffer: payload },
  });
  return {
    original,
    workspaceID,
    headers,
    plan,
    multipart,
    doc,
    board,
    asset,
    scene,
    endpoint: `/api/workspaces/${workspaceID}/imports`,
  };
}

test('atomic import publishes a complete tree and real files once, and notifies existing navigation', async ({
  page,
}) => {
  const f = await importPlan(page);
  const response = await page.request.post(f.endpoint, { headers: f.headers, multipart: f.multipart() });
  expect(response.status()).toBe(201);
  expect(response.headers()['cache-control']).toBe('no-store');
  const result = await response.json();
  expect(result).toMatchObject({ rootId: f.plan.items[1].id, itemCount: 3, attachmentCount: 1, replayed: false });
  await expect(page.getByRole('navigation', { name: '文件列表' })).toContainText('Imported bundle');
  expect(await (await page.request.get(`/api/assets/${f.asset}`)).body()).toEqual(image);
  expect((await (await page.request.get(`/api/items/${f.board}/whiteboard`)).json()).scene).toEqual(f.scene);
  const replay = await page.request.post(f.endpoint, { headers: f.headers, multipart: f.multipart() });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({ rootId: result.rootId, replayed: true });
  const items = await (await page.request.get(`/api/workspaces/${f.workspaceID}/items`)).json();
  expect(items).toHaveLength(4);
  await page.goto(`/workspace/${f.workspaceID}/${f.doc}`);
  await expect(page.locator('.ProseMirror')).toHaveText('Atomic import preserves this document');
  await page.locator('.ProseMirror').fill('Independent imported edit');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/items/${f.original}/export.md`)).text()).trim()).toBe(
    'Atomic import preserves this document',
  );
});

test('failed import never publishes partial content and unchanged retry succeeds', async ({ page }) => {
  const f = await importPlan(page);
  const before = await (await page.request.get(`/api/workspaces/${f.workspaceID}/items`)).json();
  const bad = Buffer.from(image);
  bad[bad.length - 1] ^= 1;
  const invalid = await page.request.post(f.endpoint, { headers: f.headers, multipart: f.multipart(bad) });
  expect(invalid.status()).toBe(400);
  expect(await (await page.request.get(`/api/workspaces/${f.workspaceID}/items`)).json()).toEqual(before);
  expect((await page.request.get(`/api/assets/${f.asset}`)).status()).toBe(404);
  const missing = await page.request.post(f.endpoint, {
    headers: f.headers,
    multipart: { plan: JSON.stringify(f.plan) },
  });
  expect(missing.status()).toBe(400);
  expect(await (await page.request.get(`/api/workspaces/${f.workspaceID}/items`)).json()).toEqual(before);
  expect((await page.request.post(f.endpoint, { headers: f.headers, multipart: f.multipart() })).status()).toBe(201);
  f.plan.items[1].title = 'Changed request';
  expect((await page.request.post(f.endpoint, { headers: f.headers, multipart: f.multipart() })).status()).toBe(409);
  expect(await (await page.request.get(`/api/assets/${f.asset}`)).body()).toEqual(image);
});

test('import endpoint enforces CSRF and viewer boundaries before consuming attachments', async ({ page, browser }) => {
  const f = await importPlan(page);
  expect((await page.request.post(f.endpoint, { multipart: f.multipart() })).status()).toBe(403);
  const invite = await (
    await page.request.post(`/api/workspaces/${f.workspaceID}/invites`, {
      headers: f.headers,
      data: { email: 'atomic-import-viewer@test', role: 'viewer' },
    })
  ).json();
  const context = await browser.newContext();
  try {
    const acceptance = await context.request.post(`http://127.0.0.1:3100/api/invites/${invite.token}/accept`, {
      data: { name: 'Viewer', password: 'password123' },
    });
    expect(acceptance.ok()).toBeTruthy();
    const { csrfToken } = await (await context.request.get('http://127.0.0.1:3100/api/auth/session')).json();
    const response = await context.request.post(`http://127.0.0.1:3100${f.endpoint}`, {
      headers: { ...f.headers, 'x-madoc-csrf-token': csrfToken },
      multipart: f.multipart(),
    });
    expect(response.status()).toBe(403);
    expect(await (await page.request.get(`/api/workspaces/${f.workspaceID}/items`)).json()).toHaveLength(1);
    expect((await page.request.get(`/api/assets/${f.asset}`)).status()).toBe(404);
  } finally {
    await context.close();
  }
});

test('import rejects malformed plans and upload limits, while content-only imports need no attachments', async ({
  page,
}) => {
  const f = await importPlan(page);
  const withPrivatePath = structuredClone(f.plan) as typeof f.plan & {
    assets: ((typeof f.plan.assets)[number] & { storageKey?: string })[];
  };
  withPrivatePath.assets[0].storageKey = '../server.secret';
  expect(
    (
      await page.request.post(f.endpoint, { headers: f.headers, multipart: { plan: JSON.stringify(withPrivatePath) } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(f.endpoint, { headers: f.headers, multipart: { plan: `${JSON.stringify(f.plan)} {}` } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(f.endpoint, { headers: f.headers, multipart: { wrong: JSON.stringify(f.plan) } })
    ).status(),
  ).toBe(400);
  f.plan.assets[0].size = 21 * 1024 * 1024;
  expect((await page.request.post(f.endpoint, { headers: f.headers, multipart: f.multipart() })).status()).toBe(400);
  expect(await (await page.request.get(`/api/workspaces/${f.workspaceID}/items`)).json()).toHaveLength(1);
  f.plan.assets = [];
  const created = await page.request.post(f.endpoint, {
    headers: f.headers,
    multipart: { plan: JSON.stringify(f.plan) },
  });
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({ itemCount: 3, attachmentCount: 0, replayed: false });
});
