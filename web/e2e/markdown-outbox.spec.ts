import { expect, test, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';

async function pendingIds(page: Page) {
  return page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open('madoc-markdown-outbox', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction('updates', 'readonly');
      const all = transaction.objectStore('updates').getAll();
      transaction.oncomplete = () => {
        resolve(all.result.filter(record => record.pending).map(record => record.id).sort());
        request.result.close();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

for (const lost of ['send', 'ack'] as const) {
  test(`reload recovers ${lost === 'send' ? 'unsent edits' : 'lost ACKs'} with unchanged update IDs`, async ({ page }) => {
    let block = false;
    const attempts: string[] = [];
    await page.routeWebSocket('**/ws', socket => {
      const server = socket.connectToServer();
      socket.onMessage(message => {
        const frame = JSON.parse(String(message));
        if (frame.type === 'markdown.update') {
          attempts.push(frame.payload.clientUpdateId);
          if (block && lost === 'send') return;
        }
        server.send(message);
      });
      server.onMessage(message => {
        if (block && lost === 'ack' && JSON.parse(String(message)).type === 'markdown.update.ack') return;
        socket.send(message);
      });
    });
    const id = await openDocument(page, 'Baseline');
    block = true;
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' recover me');
    await expect.poll(() => pendingIds(page)).not.toEqual([]);
    const pending = await pendingIds(page);
    await expect.poll(() => attempts.some(id => pending.includes(id))).toBe(true);
    const attemptCount = attempts.length;
    block = false;
    await page.reload();
    await expect(page.locator('.ProseMirror')).toHaveText('Baseline recover me');
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await expect.poll(() => pendingIds(page)).toEqual([]);
    for (const id of pending) expect(attempts.slice(attemptCount)).toContain(id);
    await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text()).trim()).toBe('Baseline recover me');
  });
}

test('offline edit is locally durable and retries after reconnect', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let disconnect = () => {};
  let offline = false;
  await page.routeWebSocket('**/ws', socket => {
    if (offline) { socket.close({ code: 1000 }); return; }
    const server = socket.connectToServer();
    disconnect = () => { server.close({ code: 1000 }); socket.close({ code: 1000 }); };
  });
  await openDocument(page, 'Offline baseline');
  offline = true;
  disconnect();
  await expect(page.getByText('离线', { exact: true })).toBeVisible();
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' local changes');
  await expect(page.getByText('已保存到此设备，待同步', { exact: true })).toBeVisible();
  expect((await pendingIds(page)).length).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('local-saved-mobile.png') });
  offline = false;
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await expect.poll(() => pendingIds(page)).toEqual([]);
  await page.reload();
  await expect(page.locator('.ProseMirror')).toHaveText('Offline baseline local changes');
});

test('storage failure stops editing, preserves text and supports retry', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const flags = window as unknown as { failLocalSave?: boolean; failPendingOnly?: boolean; failedRetries?: number };
      if (this.name === 'updates' && (flags.failLocalSave || (flags.failPendingOnly && args[0]?.pending))) {
        if (flags.failPendingOnly) flags.failedRetries = (flags.failedRetries ?? 0) + 1;
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  await openDocument(page, 'Storage baseline');
  await page.evaluate(() => { (window as unknown as { failLocalSave: boolean }).failLocalSave = true; });
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' rescued');
  await expect(page.getByRole('alert')).toContainText('无法将修改保存到此设备');
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByText('已保存到此设备，待同步', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('storage-failure-mobile.png') });
  const countRecords = () => page.evaluate(() => new Promise<number>((resolve) => {
    const request = indexedDB.open('madoc-markdown-outbox', 1);
    request.onsuccess = () => {
      const transaction = request.result.transaction('updates', 'readonly');
      const count = transaction.objectStore('updates').count();
      transaction.oncomplete = () => { resolve(count.result); request.result.close(); };
    };
  }));
  const beforeRetry = await countRecords();
  await page.evaluate(() => {
    const flags = window as unknown as { failLocalSave: boolean; failPendingOnly: boolean };
    flags.failLocalSave = false;
    flags.failPendingOnly = true;
  });
  await page.getByRole('button', { name: '重试本地保存' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { failedRetries?: number }).failedRetries ?? 0)).toBe(1);
  expect(await countRecords()).toBe(beforeRetry);
  await page.evaluate(() => { (window as unknown as { failPendingOnly: boolean }).failPendingOnly = false; });
  await page.getByRole('button', { name: '重试本地保存' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ProseMirror')).toHaveText('Storage baseline rescued');
});

test('switching documents retains unconfirmed edits without mixing their content', async ({ page }) => {
  let block = false;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (block && JSON.parse(String(message)).type === 'markdown.update') return;
      server.send(message);
    });
  });
  await openDocument(page, 'First document');
  await page.getByRole('button', { name: '新建内容', exact: true }).click();
  await page.getByRole('menuitem', { name: '文档', exact: true }).click();
  await page.getByLabel('名称').fill('Second document');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.getByRole('button', { name: 'Inline writing', exact: true }).click();
  await expect(page.locator('.ProseMirror')).toHaveText('First document');
  block = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' pending switch');
  await page.getByRole('button', { name: 'Second document', exact: true }).click();
  await expect(page.locator('.ProseMirror')).not.toContainText('pending switch');
  expect((await pendingIds(page)).length).toBeGreaterThan(0);
  block = false;
  await page.getByRole('button', { name: 'Inline writing', exact: true }).click();
  await expect(page.locator('.ProseMirror')).toHaveText('First document pending switch');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});

test('two tabs can close with pending edits and a new tab recovers both', async ({ page, context }) => {
  let block = false;
  await context.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (block && JSON.parse(String(message)).type === 'markdown.update') return;
      server.send(message);
    });
  });
  await openDocument(page, 'Shared baseline');
  const url = page.url();
  const second = await context.newPage();
  await second.goto(url);
  await expect(second.locator('.ProseMirror')).toHaveText('Shared baseline');
  block = true;
  for (const [tab, text] of [[page, ' tab-A'], [second, ' tab-B']] as const) {
    await tab.locator('.ProseMirror').click();
    await tab.keyboard.press('End');
    await tab.keyboard.insertText(text);
  }
  await expect.poll(async () => (await pendingIds(page)).length).toBeGreaterThanOrEqual(2);
  await page.close();
  await second.close();
  block = false;
  const restored = await context.newPage();
  await restored.goto(url);
  await expect(restored.locator('.ProseMirror')).toContainText('tab-A');
  await expect(restored.locator('.ProseMirror')).toContainText('tab-B');
  await expect(restored.getByText('已保存', { exact: true })).toBeVisible();
  await expect.poll(() => pendingIds(restored)).toEqual([]);
});

test('another account cannot replay the previous account pending edits', async ({ page }) => {
  let block = false;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (block && JSON.parse(String(message)).type === 'markdown.update') return;
      server.send(message);
    });
  });
  await openDocument(page, 'Public to workspace');
  const url = page.url();
  const workspace = new URL(url).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const invite = await (await page.request.post(`/api/workspaces/${workspace}/invites`, {
    headers: { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { email: 'outbox-viewer@example.test', role: 'viewer' },
  })).json();
  block = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' private pending');
  await expect.poll(() => pendingIds(page)).not.toEqual([]);
  const ownerPending = await pendingIds(page);
  await page.context().clearCookies();
  const accepted = await page.request.post(`/api/invites/${invite.token}/accept`, {
    data: { name: 'Other account', password: 'password123' },
  });
  expect(accepted.ok()).toBeTruthy();
  block = false;
  await page.reload();
  await expect(page.locator('.ProseMirror')).toHaveText('Public to workspace');
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  expect(await pendingIds(page)).toEqual(ownerPending);
  const login = await page.request.post('/api/auth/sign-in', { data: { email: 'owner@example.test', password: 'password123' } });
  expect(login.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText('private pending');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});

test('local log compaction retains confirmed content and future offline edits', async ({ page }) => {
  let block = false;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (block && JSON.parse(String(message)).type === 'markdown.update') return;
      server.send(message);
    });
  });
  await openDocument(page, 'Compaction ');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  for (let batch = 0; batch < 5; batch += 1) {
    await page.keyboard.type('x'.repeat(90));
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  }
  const total = await page.evaluate(() => new Promise<number>((resolve) => {
    const request = indexedDB.open('madoc-markdown-outbox', 1);
    request.onsuccess = () => {
      const transaction = request.result.transaction('updates', 'readonly');
      const count = transaction.objectStore('updates').count();
      transaction.oncomplete = () => { resolve(count.result); request.result.close(); };
    };
  }));
  expect(total).toBeLessThan(300);
  block = true;
  await page.keyboard.insertText(' retained after compaction');
  await expect.poll(() => pendingIds(page)).not.toEqual([]);
  block = false;
  await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText('x'.repeat(450));
  await expect(page.locator('.ProseMirror')).toContainText('retained after compaction');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});
