import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

test('find is literal and case-sensitive; replace all is one collaborative undo step', async ({ page, context }) => {
  await openDocument(page, 'foo **foo** Foo 中文词 foo');
  const peer = await context.newPage();
  await peer.goto(page.url());
  await expect(peer.locator('.ProseMirror')).toContainText('中文词');

  await page.getByRole('button', { name: '文内查找与替换' }).click();
  const dialog = page.getByRole('dialog', { name: '文内查找与替换' });
  await dialog.getByLabel('查找文本').fill('foo');
  await expect(dialog.getByText('1 / 3 个匹配项')).toBeVisible();
  await peer.locator('.ProseMirror').click();
  await peer.keyboard.press('ControlOrMeta+End');
  await peer.keyboard.insertText(' foo');
  await expect(dialog.getByText('1 / 4 个匹配项')).toBeVisible();
  await dialog.getByLabel('替换为').fill('bar');
  await dialog.getByRole('button', { name: '全部替换' }).click();
  await expect(dialog.getByText('没有匹配项')).toBeVisible();
  await expect(page.locator('.ProseMirror p')).toContainText('bar bar Foo 中文词 bar bar');
  await expect(peer.locator('.ProseMirror p')).toContainText('bar bar Foo 中文词 bar bar');

  await page.keyboard.press('Escape');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.ProseMirror p')).toContainText('foo foo Foo 中文词 foo foo');
  await expect(peer.locator('.ProseMirror p')).toContainText('foo foo Foo 中文词 foo foo');
  await peer.close();
});

test('replace one match spanning adjacent formatting nodes and keep the following content', async ({ page }) => {
  await openDocument(page, '**粗**体后的文本');
  await page.getByRole('button', { name: '文内查找与替换' }).click();
  const dialog = page.getByRole('dialog', { name: '文内查找与替换' });
  await dialog.getByLabel('查找文本').fill('粗体');
  await expect(dialog.getByText('1 / 1 个匹配项')).toBeVisible();
  await dialog.getByLabel('替换为').fill('完整');
  await dialog.getByRole('button', { name: '替换', exact: true }).click();
  await expect(page.locator('.ProseMirror')).toHaveText('完整后的文本');
  await expect(dialog.getByText('没有匹配项')).toBeVisible();
});

test('viewer can search but cannot replace or write document updates', async ({ page, browser }) => {
  await openDocument(page, 'viewer 可查找 viewer');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const invite = await (await page.request.post(`/api/workspaces/${workspace}/invites`, {
    headers,
    data: { email: 'find-viewer@example.test', role: 'viewer' },
  })).json();
  const context = await browser.newContext();
  try {
    await context.request.post(`http://127.0.0.1:3100/api/invites/${invite.token}/accept`, {
      data: { name: 'Viewer', password: 'password123' },
    });
    const viewer = await context.newPage();
    let updates = 0;
    await viewer.routeWebSocket('**/ws', (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) => {
        if (JSON.parse(String(message)).type === 'markdown.update') updates++;
        server.send(message);
      });
    });
    await viewer.goto(page.url());
    await expect(viewer.locator('.ProseMirror')).toContainText('viewer 可查找');
    await viewer.getByRole('button', { name: '文内查找与替换' }).click();
    const dialog = viewer.getByRole('dialog', { name: '文内查找与替换' });
    await dialog.getByLabel('查找文本').fill('viewer');
    await expect(dialog.getByText('1 / 2 个匹配项')).toBeVisible();
    await expect(dialog.getByLabel('替换为')).toBeDisabled();
    await expect(dialog.getByText('当前为只读文档，无法替换内容。')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '全部替换' })).toHaveCount(0);
    expect(updates).toBe(0);
    await context.close();
  } finally {
    await context.close();
  }
});
