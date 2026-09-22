import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { WhiteboardDraft } from '../src/features/whiteboard/whiteboard-outbox';
import { openBoard, rectangle } from './helpers/whiteboard';
import { openAccount, accountHeaders } from './helpers/account';

async function stored(page: Page) {
  return page.evaluate(() => new Promise<WhiteboardDraft[]>((resolve, reject) => {
    const request = indexedDB.open('madoc-whiteboard-outbox', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction('drafts', 'readonly');
      const get = tx.objectStore('drafts').getAll();
      tx.oncomplete = () => { resolve(get.result); request.result.close(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
}

async function pendingBoard(page: Page) {
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (JSON.parse(String(message)).type !== 'whiteboard.scene.update') server.send(message);
    });
  });
  const id = await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await rectangle(page);
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  return id;
}

for (const width of [1280, 390]) {
  test(`deleted board drafts download independently with embedded files at ${width}px`, async ({ page }, testInfo) => {
    const id = await pendingBoard(page);
    await page.goto('/workspaces');
    // A second writer's snapshot also contains a deleted element and an embedded
    // file. Neither may be dropped by the independent recovery/download path.
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('madoc-whiteboard-outbox', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('drafts', 'readwrite');
          const store = tx.objectStore('drafts');
          const get = store.getAll();
          get.onsuccess = () => {
            const record = structuredClone(get.result[0]);
            record.key = JSON.stringify([record.scope, 'another-writer']);
            record.id = 'another-pending-scene';
            record.updatedAt += 1000;
            record.scene.elements.push({ ...record.scene.elements[0], id: 'deleted-element', isDeleted: true });
            record.scene.files.image = { id: 'image', mimeType: 'image/png', dataURL: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=', created: 1 };
            store.put(record);
          };
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    const before = (await stored(page)).sort((a, b) => b.updatedAt - a.updatedAt);
    expect((await page.request.delete(`/api/items/${id}`, { headers: await accountHeaders(page, 'http://127.0.0.1:3100') })).ok()).toBeTruthy();
    let itemRequests = 0;
    await page.route(`**/api/items/${id}/**`, route => { itemRequests += 1; return route.abort(); });
    await page.setViewportSize({ width, height: 844 });
    await openAccount(page, '本地恢复');
    const buttons = page.getByRole('button', { name: '下载白板本地副本', exact: true });
    await expect(buttons).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const ready = page.waitForEvent('download');
      await buttons.nth(i).click();
      const download = await ready;
      expect(download.suggestedFilename()).toMatch(/-本地副本\.excalidraw$/);
      const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
      expect(exported).toEqual({ type: 'excalidraw', version: 2, source: 'madoc', ...before[i].scene });
    }
    expect(itemRequests).toBe(0);
    expect((await stored(page)).sort((a, b) => b.updatedAt - a.updatedAt)).toEqual(before);
    await buttons.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`board-account-recovery-${width}.png`) });
  });
}

test('whiteboard recovery isolates accounts in the same browser', async ({ page }) => {
  await pendingBoard(page);
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const invite = await (await page.request.post(`/api/workspaces/${workspace}/invites`, {
    headers: await accountHeaders(page, 'http://127.0.0.1:3100'),
    data: { email: 'board-local-viewer@example.test', role: 'viewer' },
  })).json();
  await page.goto('/workspaces');
  await page.context().clearCookies();
  expect((await page.request.post(`/api/invites/${invite.token}/accept`, { data: { name: 'Other board account', password: 'password123' } })).ok()).toBeTruthy();
  await page.reload();
  await openAccount(page, '本地恢复');
  await expect(page.getByText('此设备没有需要恢复的白板。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '下载白板本地副本' })).toHaveCount(0);
  expect((await page.request.post('/api/auth/sign-in', { data: { email: 'owner@example.test', password: 'password123' } })).ok()).toBeTruthy();
  await page.reload();
  await openAccount(page, '本地恢复');
  await expect(page.getByRole('button', { name: '下载白板本地副本' })).toHaveCount(1);
});

test('whiteboard recovery read failure is explicit and can retry without deleting drafts', async ({ page }) => {
  await page.addInitScript(() => {
    const getAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      if (this.name === 'account' && this.objectStore.transaction.db.name === 'madoc-whiteboard-outbox' && sessionStorage.getItem('fail-board-list')) throw new DOMException('Unavailable', 'UnknownError');
      return getAll.apply(this, args);
    };
  });
  await pendingBoard(page);
  await page.goto('/workspaces');
  const before = await stored(page);
  await page.evaluate(() => sessionStorage.setItem('fail-board-list', '1'));
  await openAccount(page, '本地恢复');
  await expect(page.getByRole('alert')).toContainText('无法读取本地白板草稿');
  await expect(page.getByText('此设备没有需要恢复的白板。')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.removeItem('fail-board-list'));
  await page.getByRole('button', { name: '刷新白板列表' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '下载白板本地副本' })).toHaveCount(1);
  expect(await stored(page)).toEqual(before);
});
