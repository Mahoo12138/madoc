import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openDocument } from './helpers/writing';

test('export waits for the confirmed Markdown projection instead of downloading stale cache', async ({ page }) => {
  let hold = false;
  const cacheMessages: string[] = [];
  let send = (_message: string) => {};
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    send = message => server.send(message);
    socket.onMessage(message => {
      if (hold && JSON.parse(String(message)).type === 'markdown.cache.update') {
        cacheMessages.push(String(message));
        return;
      }
      server.send(message);
    });
  });
  const id = await openDocument(page, 'Before');
  await expect.poll(async () => (await page.request.get(`/api/items/${id}/export.md`)).status()).toBe(200);
  hold = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' freshly confirmed');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const stale = await page.request.get(`/api/items/${id}/export.md`);
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error.code).toBe('EXPORT_NOT_READY');
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('正在确认修改并准备导出');
  await expect.poll(() => cacheMessages.length).toBeGreaterThan(1);
  expect(downloads).toBe(0);
  const downloadReady = page.waitForEvent('download');
  hold = false;
  send(cacheMessages[cacheMessages.length - 1]);
  const download = await downloadReady;
  expect(await readFile((await download.path())!, 'utf8')).toContain('Before freshly confirmed');
  expect(download.suggestedFilename()).toBe('Inline writing.md');
  const exported = await page.request.get(`/api/items/${id}/export.md`);
  expect(exported.headers()['cache-control']).toBe('no-store');
  expect(Number(exported.headers()['x-madoc-content-seq'])).toBeGreaterThan(0);
  expect(exported.headers()['x-madoc-content-generation']).toBe('1');
});

test('offline export explicitly offers a local copy with unsent text', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let offline = false;
  let disconnect = () => {};
  await page.routeWebSocket('**/ws', socket => {
    if (offline) { socket.close({ code: 1000 }); return; }
    const server = socket.connectToServer();
    disconnect = () => { server.close({ code: 1000 }); socket.close({ code: 1000 }); };
  });
  await openDocument(page, 'Offline');
  offline = true;
  disconnect();
  await expect(page.getByText('离线', { exact: true })).toBeVisible();
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' local only');
  await expect(page.getByText('已保存到此设备，待同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('当前未连接服务器');
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载本地副本', exact: true }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toContain('本地副本');
  expect(await readFile((await download.path())!, 'utf8')).toContain('Offline local only');
  await page.screenshot({ path: testInfo.outputPath('offline-export-mobile.png') });
});

test('export waits for all local ACKs and rejects malformed or obsolete watermark requests', async ({ page }) => {
  let block = false;
  const acknowledgements: string[] = [];
  let deliver = (_message: string) => {};
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    deliver = message => socket.send(message);
    server.onMessage(message => {
      if (block && JSON.parse(String(message)).type === 'markdown.update.ack') {
        acknowledgements.push(String(message));
        return;
      }
      socket.send(message);
    });
  });
  const id = await openDocument(page, 'ACK');
  block = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' first');
  await page.keyboard.insertText(' second');
  await expect.poll(() => acknowledgements.length).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  deliver(acknowledgements[0]);
  await expect(page.getByRole('status')).toContainText('正在确认修改');
  const downloadReady = page.waitForEvent('download');
  block = false;
  for (const ack of acknowledgements.slice(1)) deliver(ack);
  const download = await downloadReady;
  expect(await readFile((await download.path())!, 'utf8')).toContain('ACK first second');
  for (const query of ['?generation=1', '?generation=-1&minSeq=0', '?generation=1&minSeq=x', '?generation=1&generation=2&minSeq=0']) {
    expect((await page.request.get(`/api/items/${id}/export.md${query}`)).status()).toBe(400);
  }
  const obsolete = await page.request.get(`/api/items/${id}/export.md?generation=0&minSeq=0`);
  expect(obsolete.status()).toBe(409);
  expect((await obsolete.json()).error.code).toBe('GENERATION_CHANGED');
});

test('projection timeout keeps export explicit and retry succeeds after recovery', async ({ page }) => {
  let hold = false;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (hold && JSON.parse(String(message)).type === 'markdown.cache.update') return;
      server.send(message);
    });
  });
  await openDocument(page, 'Timeout');
  hold = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' latest text');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('导出等待超时', { timeout: 12000 });
  expect(downloads).toBe(0);
  hold = false;
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: '重试导出', exact: true }).click();
  const download = await downloadReady;
  expect(await readFile((await download.path())!, 'utf8')).toContain('Timeout latest text');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('viewer can export confirmed content without writing a projection; failed auth has a local fallback', async ({ page }) => {
  const id = await openDocument(page, 'Viewer export');
  await expect.poll(async () => (await page.request.get(`/api/items/${id}/export.md`)).status()).toBe(200);
  const url = page.url();
  const workspaceId = new URL(url).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const invite = await (await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
    headers: { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { email: 'export-viewer@example.test', role: 'viewer' },
  })).json();
  await page.context().clearCookies();
  expect((await page.request.post(`/api/invites/${invite.token}/accept`, { data: { name: 'Viewer', password: 'password123' } })).ok()).toBeTruthy();
  let writes = 0;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (['markdown.update', 'markdown.cache.update', 'markdown.snapshot.commit'].includes(JSON.parse(String(message)).type)) writes += 1;
      server.send(message);
    });
  });
  await page.reload();
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  expect(await readFile((await (await downloadReady).path())!, 'utf8')).toContain('Viewer export');
  expect(writes).toBe(0);
  await page.context().clearCookies();
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录或访问权限已失效');
  await expect(page.getByRole('button', { name: '下载本地副本', exact: true })).toBeVisible();
});
