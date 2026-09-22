import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openDocument } from './helpers/writing';

test('removed member receives no further content and can rescue pending local edits', async ({ page, browser }) => {
  const itemId = await openDocument(page, 'Shared before removal');
  const url = page.url();
  const workspaceId = new URL(url).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  const invite = await (await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
    headers, data: { email: 'removed-editor@example.test', role: 'editor' },
  })).json();
  const context = await browser.newContext();
  try {
    const member = await context.newPage();
    const acceptance = await context.request.post(`http://127.0.0.1:3100/api/invites/${invite.token}/accept`, {
      data: { name: 'Removed editor', password: 'password123' },
    });
    expect(acceptance.ok()).toBeTruthy();
    const { user } = await acceptance.json();
    let hold = false;
    const received: string[] = [];
    await member.routeWebSocket('**/ws', socket => {
      const server = socket.connectToServer();
      socket.onMessage(message => {
        if (hold && JSON.parse(String(message)).type === 'markdown.update') return;
        server.send(message);
      });
      server.onMessage(message => { received.push(String(message)); socket.send(message); });
    });
    await member.goto(url);
    await expect(member.getByText('已保存', { exact: true })).toBeVisible();
    hold = true;
    await member.locator('.ProseMirror').click();
    await member.keyboard.press('End');
    await member.keyboard.insertText(' local unsent rescue');
    await expect(member.getByText('保存中', { exact: true })).toBeVisible();
    expect((await page.request.delete(`/api/workspaces/${workspaceId}/members/${user.id}`, { headers })).status()).toBe(204);
    received.length = 0;
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' secret after removal');
    await expect(member.getByRole('alert')).toContainText('服务器拒绝了保存');
    await expect(member.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
    await expect(member.locator('.ProseMirror')).toContainText('local unsent rescue');
    await expect(member.locator('.ProseMirror')).not.toContainText('secret after removal');
    expect(received.map(value => JSON.parse(value).type)).not.toContain('markdown.update.remote');
    expect((await context.request.get(`http://127.0.0.1:3100/api/items/${itemId}/markdown`)).status()).toBe(403);
    const ready = member.waitForEvent('download');
    await member.getByRole('button', { name: '下载本地副本', exact: true }).click();
    const text = await readFile((await (await ready).path())!, 'utf8');
    expect(text).toContain('local unsent rescue');
    expect(text).not.toContain('secret after removal');
  } finally {
    await context.close();
  }
});
