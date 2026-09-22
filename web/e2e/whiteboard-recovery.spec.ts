import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openBoard, rectangle } from './helpers/whiteboard';

async function drafts(page: Page) {
  return page.evaluate(() => new Promise<{ id: string; scene: { elements: unknown[] } }[]>((resolve, reject) => {
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

for (const lost of ['send', 'ack']) {
  test(`reload recovers a locally persisted board after lost ${lost}`, async ({ page }) => {
    let hold = false;
    const ids: string[] = [];
    await page.routeWebSocket('**/ws', socket => {
      const server = socket.connectToServer();
      socket.onMessage(message => {
        const frame = JSON.parse(String(message));
        if (frame.type === 'whiteboard.scene.update') {
          ids.push(frame.requestId);
          if (hold && lost === 'send') return;
        }
        server.send(message);
      });
      server.onMessage(message => {
        if (hold && lost === 'ack' && JSON.parse(String(message)).type === 'whiteboard.scene.ack') return;
        socket.send(message);
      });
    });
    const id = await openBoard(page);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    hold = true;
    await rectangle(page);
    await expect.poll(async () => (await drafts(page)).filter(record => record.scene.elements.length === 1).length).toBe(1);
    const pending = (await drafts(page))[0].id;
    await expect.poll(() => ids.includes(pending)).toBe(true);
    const count = ids.length;
    hold = false;
    await page.reload();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(ids.slice(count)).toContain(pending);
    await expect.poll(() => drafts(page)).toEqual([]);
    expect((await (await page.request.get(`/api/items/${id}/whiteboard`)).json()).scene.elements).toHaveLength(1);
  });
}

test('two closed offline tabs retain independent shapes and a new tab merges both', async ({ page }) => {
  let offline = false;
  const disconnects: (() => void)[] = [];
  const route = async (target: Page) => target.routeWebSocket('**/ws', socket => {
    if (offline) { socket.close({ code: 1000 }); return; }
    const server = socket.connectToServer();
    disconnects.push(() => { server.close({ code: 1000 }); socket.close({ code: 1000 }); });
  });
  await route(page);
  const id = await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const url = page.url();
  const peer = await page.context().newPage();
  await route(peer);
  await peer.goto(url);
  await expect(peer.getByText('Saved', { exact: true })).toBeVisible();
  offline = true;
  disconnects.forEach(disconnect => disconnect());
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await expect(peer.getByText('Offline', { exact: true })).toBeVisible();
  await rectangle(page);
  await rectangle(peer, 60);
  await expect(page.getByText('已保存到此设备，待同步', { exact: true })).toBeVisible();
  await expect(peer.getByText('已保存到此设备，待同步', { exact: true })).toBeVisible();
  await expect.poll(async () => (await drafts(page)).length).toBe(2);
  const context = page.context();
  await peer.close();
  await page.close();
  const recovered = await context.newPage();
  await recovered.goto(url);
  await expect(recovered.getByText('Saved', { exact: true })).toBeVisible();
  await expect.poll(() => drafts(recovered)).toEqual([]);
  expect((await (await recovered.request.get(`/api/items/${id}/whiteboard`)).json()).scene.elements).toHaveLength(2);
  await recovered.close();
});

test('local storage failure prevents sends, preserves the board and can be retried', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'drafts' && (window as unknown as { failBoardStorage: boolean }).failBoardStorage) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  let writes = 0;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (JSON.parse(String(message)).type === 'whiteboard.scene.update') writes += 1;
      server.send(message);
    });
  });
  const id = await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const before = writes;
  await page.evaluate(() => { (window as unknown as { failBoardStorage: boolean }).failBoardStorage = true; });
  await rectangle(page);
  await expect(page.getByRole('alert')).toContainText('无法将白板修改保存到此设备');
  await page.waitForTimeout(500);
  expect(writes).toBe(before);
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载本地白板副本' }).click();
  const exported = JSON.parse(await readFile((await (await ready).path())!, 'utf8'));
  expect(exported.elements.length).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('whiteboard-storage-failed-mobile.png') });
  await page.evaluate(() => { (window as unknown as { failBoardStorage: boolean }).failBoardStorage = false; });
  await page.getByRole('button', { name: '重试本地保存' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect.poll(() => drafts(page)).toEqual([]);
  expect((await (await page.request.get(`/api/items/${id}/whiteboard`)).json()).scene.elements.length).toBeGreaterThan(0);
});

test('failed draft reads can retry without overwriting the existing local copy', async ({ page }) => {
  await page.addInitScript(() => {
    const getAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      if (this.objectStore.name === 'drafts' && sessionStorage.getItem('fail-board-read')) throw new DOMException('Unavailable', 'UnknownError');
      return getAll.apply(this, args);
    };
  });
  let hold = false;
  let writes = 0;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (JSON.parse(String(message)).type === 'whiteboard.scene.update') { writes += 1; if (hold) return; }
      server.send(message);
    });
  });
  const id = await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  hold = true;
  await rectangle(page);
  await expect.poll(async () => (await drafts(page)).length).toBe(1);
  await page.evaluate(() => sessionStorage.setItem('fail-board-read', '1'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('无法读取或准备本地白板草稿');
  const count = writes;
  await page.waitForTimeout(400);
  expect(writes).toBe(count);
  expect((await drafts(page))[0].scene.elements).toHaveLength(1);
  await page.evaluate(() => sessionStorage.removeItem('fail-board-read'));
  hold = false;
  await page.getByRole('button', { name: '重试本地保存' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect.poll(() => drafts(page)).toEqual([]);
  expect((await (await page.request.get(`/api/items/${id}/whiteboard`)).json()).scene.elements).toHaveLength(1);
});

test('a server revision older than the draft baseline opens a local rescue without writes', async ({ page }) => {
  let hold = false;
  let writes = 0;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (JSON.parse(String(message)).type === 'whiteboard.scene.update') { writes += 1; if (hold) return; }
      server.send(message);
    });
  });
  const id = await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await rectangle(page);
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/whiteboard`)).json()).revision).toBeGreaterThan(0);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  hold = true;
  await rectangle(page, 60);
  await expect.poll(async () => (await drafts(page)).filter(record => record.scene.elements.length === 2).length).toBe(1);
  await page.route(`**/api/items/${id}/whiteboard`, async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, revision: 0 } });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('服务器白板版本早于本地草稿');
  const count = writes;
  await page.waitForTimeout(400);
  expect(writes).toBe(count);
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载本地白板副本' }).click();
  expect(JSON.parse(await readFile((await (await ready).path())!, 'utf8')).elements).toHaveLength(2);
  expect((await drafts(page)).length).toBeGreaterThan(0);
});

test('an editor downgraded to viewer can rescue drafts without replaying them', async ({ page, browser }) => {
  const id = await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const url = page.url();
  const workspaceId = new URL(url).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  const invite = await (await page.request.post(`/api/workspaces/${workspaceId}/invites`, { headers, data: { email: 'board-recovery-member@example.test', role: 'editor' } })).json();
  const context = await browser.newContext();
  try {
    const member = await context.newPage();
    const accepted = await context.request.post(`http://127.0.0.1:3100/api/invites/${invite.token}/accept`, { data: { name: 'Board member', password: 'password123' } });
    expect(accepted.ok()).toBeTruthy();
    const { user } = await accepted.json();
    let hold = false;
    let writes = 0;
    await member.routeWebSocket('**/ws', socket => {
      const server = socket.connectToServer();
      socket.onMessage(message => {
        if (JSON.parse(String(message)).type === 'whiteboard.scene.update') { writes += 1; if (hold) return; }
        server.send(message);
      });
    });
    await member.goto(url);
    await expect(member.getByText('Saved', { exact: true })).toBeVisible();
    hold = true;
    await rectangle(member);
    await expect.poll(async () => (await drafts(member)).length).toBe(1);
    expect((await page.request.patch(`/api/workspaces/${workspaceId}/members/${user.id}`, { headers, data: { role: 'viewer' } })).status()).toBe(204);
    await member.reload();
    await expect(member.getByRole('alert')).toContainText('当前账号没有编辑权限');
    const count = writes;
    await member.waitForTimeout(500);
    expect(writes).toBe(count);
    const ready = member.waitForEvent('download');
    await member.getByRole('button', { name: '下载本地白板副本' }).click();
    expect(JSON.parse(await readFile((await (await ready).path())!, 'utf8')).elements).toHaveLength(1);
    expect((await drafts(member)).length).toBe(1);
    expect((await (await page.request.get(`/api/items/${id}/whiteboard`)).json()).scene.elements).toHaveLength(0);
  } finally { await context.close(); }
});

test('switching to another item retains an unconfirmed local board draft', async ({ page }) => {
  let hold = false;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (hold && JSON.parse(String(message)).type === 'whiteboard.scene.update') return;
      server.send(message);
    });
  });
  const id = await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  hold = true;
  await rectangle(page);
  await expect.poll(async () => (await drafts(page)).length).toBe(1);
  await page.getByText('Inline writing', { exact: true }).click();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  expect((await drafts(page)).length).toBe(1);
  hold = false;
  await page.getByText('Save state board', { exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect.poll(() => drafts(page)).toEqual([]);
  expect((await (await page.request.get(`/api/items/${id}/whiteboard`)).json()).scene.elements).toHaveLength(1);
});
