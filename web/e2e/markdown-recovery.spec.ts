import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openDocument } from './helpers/writing';
import { openAccount, accountHeaders } from './helpers/account';

async function waitPending(page: Page) {
  await expect.poll(() => page.evaluate(() => new Promise<number>((resolve) => {
    const request = indexedDB.open('madoc-markdown-outbox', 1);
    request.onsuccess = () => {
      const transaction = request.result.transaction('updates', 'readonly');
      const records = transaction.objectStore('updates').getAll();
      transaction.oncomplete = () => {
        resolve(records.result.filter(record => record.pending && !record.archived).length);
        request.result.close();
      };
    };
  }))).toBeGreaterThan(0);
}

for (const width of [1280, 390]) {
  test(`deleted document can be recovered from account settings at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    let block = false;
    await page.routeWebSocket('**/ws', socket => {
      const server = socket.connectToServer();
      socket.onMessage(message => {
        if (block && JSON.parse(String(message)).type === 'markdown.update') return;
        server.send(message);
      });
    });
    const id = await openDocument(page, '# Rescue\n\nBody with **bold**, escaped \\*literal\\*, and a note[^n].\n\n[^n]: Footnote retained.');
    block = true;
    await page.locator('.ProseMirror p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' LOCAL RESCUE');
    await waitPending(page);
    await page.goto('/workspaces');
    const deleted = await page.request.delete(`/api/items/${id}`, { headers: await accountHeaders(page, 'http://127.0.0.1:3100') });
    expect(deleted.ok()).toBeTruthy();
    let originalReads = 0;
    await page.route(`**/api/items/${id}/**`, route => { originalReads += 1; return route.abort(); });
    await openAccount(page, '本地恢复');
    await page.getByRole('button', { name: '查看本地副本' }).click();
    const preview = page.getByLabel('本地 Markdown 副本');
    await expect(preview).toContainText('LOCAL RESCUE');
    await expect(preview).toContainText('**bold**');
    await expect(preview).toContainText('Footnote retained.');
    const downloadReady = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载本地副本', exact: true }).click();
    const download = await downloadReady;
    const markdown = await readFile((await download.path())!, 'utf8');
    expect(markdown).toContain('LOCAL RESCUE');
    expect(markdown).toContain('\\*literal\\*');
    expect(markdown).toContain('[^n]');
    expect(originalReads).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`local-recovery-${width}.png`) });
  });
}

test('only old generations can be marked handled and their recovery copy remains', async ({ page }) => {
  let block = false;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (block && JSON.parse(String(message)).type === 'markdown.update') return;
      server.send(message);
    });
  });
  const id = await openDocument(page, 'Original');
  const documentURL = page.url();
  block = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' retained old changes');
  await waitPending(page);
  await page.goto('/workspaces');
  await openAccount(page, '本地恢复');
  await page.getByRole('button', { name: '查看本地副本' }).click();
  await expect(page.getByLabel('本地 Markdown 副本')).toContainText('retained old changes');
  await page.getByRole('button', { name: '处理旧版本记录' }).click();
  const dialog = page.getByRole('dialog', { name: '处理旧版本记录？', exact: true });
  await dialog.getByRole('button', { name: '标记已处理' }).click();
  await expect(dialog.getByRole('alert')).toContainText('仍属于当前文档');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await waitPending(page);
  const reset = await page.request.put(`/api/items/${id}/markdown`, {
    headers: await accountHeaders(page, 'http://127.0.0.1:3100'), data: { snapshot: '', markdown: 'Replacement' },
  });
  expect(reset.ok()).toBeTruthy();
  await page.getByRole('button', { name: '处理旧版本记录' }).click();
  await dialog.getByRole('button', { name: '标记已处理' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('已处理，副本保留', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看本地副本' }).click();
  await expect(page.getByLabel('本地 Markdown 副本')).toContainText('retained old changes');
  block = false;
  await page.goto(documentURL);
  await expect(page.locator('.ProseMirror')).toHaveText('Replacement');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('recovery list stays isolated when another account signs in on the same browser', async ({ page }) => {
  let block = false;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (block && JSON.parse(String(message)).type === 'markdown.update') return;
      server.send(message);
    });
  });
  await openDocument(page, 'Account private draft');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const invite = await (await page.request.post(`/api/workspaces/${workspace}/invites`, {
    headers: await accountHeaders(page, 'http://127.0.0.1:3100'),
    data: { email: 'recovery-viewer@example.test', role: 'viewer' },
  })).json();
  block = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' private local edit');
  await waitPending(page);
  await page.goto('/workspaces');
  await page.context().clearCookies();
  const accepted = await page.request.post(`/api/invites/${invite.token}/accept`, { data: { name: 'Other account', password: 'password123' } });
  expect(accepted.ok()).toBeTruthy();
  await page.reload();
  await openAccount(page, '本地恢复');
  await expect(page.getByText('此设备没有需要恢复的文档。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看本地副本' })).toHaveCount(0);
  const login = await page.request.post('/api/auth/sign-in', { data: { email: 'owner@example.test', password: 'password123' } });
  expect(login.ok()).toBeTruthy();
  await page.reload();
  await openAccount(page, '本地恢复');
  await page.getByRole('button', { name: '查看本地副本' }).click();
  await expect(page.getByLabel('本地 Markdown 副本')).toContainText('private local edit');
});
