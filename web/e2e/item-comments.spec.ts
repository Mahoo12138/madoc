import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

test('owner and editor comments are item-scoped, visible to viewers, and read-only for viewers', async ({ page, browser }) => {
  await openDocument(page, 'Comment target');
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  await page.getByRole('button', { name: '文档评论' }).click();
  let drawer = page.getByRole('dialog', { name: '评论 · Inline writing' });
  await drawer.getByLabel('添加评论').fill('Check the deployment note.\nKeep the current rollback step.');
  await drawer.getByRole('button', { name: '发送评论' }).click();
  await expect(drawer.getByText(/Check the deployment note/)).toBeVisible();
  await expect(drawer.getByText(/Keep the current rollback step/)).toBeVisible();

  const session = await (await page.request.get('/api/auth/session')).json() as { csrfToken: string };
  const invitation = await (await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
    headers: { 'x-madoc-csrf-token': session.csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { email: `comment-viewer-${workspaceId}@example.test`, role: 'viewer' },
  })).json() as { token: string };
  const context = await browser.newContext();
  try {
    const viewer = await context.newPage();
    const acceptance = await viewer.request.post(`/api/invites/${invitation.token}/accept`, {
      headers: { Origin: 'http://127.0.0.1:3100' },
      data: { name: 'Comment viewer', password: 'password123' },
    });
    expect(acceptance.ok()).toBeTruthy();
    await viewer.goto(page.url());
    await expect(viewer.locator('.ProseMirror')).toHaveText('Comment target');
    await viewer.getByRole('button', { name: '文档评论' }).click();
    let viewerDrawer = viewer.getByRole('dialog', { name: '评论 · Inline writing' });
    await expect(viewerDrawer.getByText(/Check the deployment note/)).toBeVisible();
    await expect(viewerDrawer.getByLabel('添加评论')).toHaveCount(0);
    await expect(viewerDrawer.getByText('查看者可以阅读评论，但不能新增或删除评论。')).toBeVisible();
    const viewerSession = await (await viewer.request.get('/api/auth/session')).json() as { csrfToken: string };
    const denied = await viewer.request.post(`/api/items/${new URL(page.url()).pathname.split('/').pop()}/comments`, {
      headers: { 'x-madoc-csrf-token': viewerSession.csrfToken, Origin: 'http://127.0.0.1:3100' },
      data: { body: 'viewer must not write comments' },
    });
    expect(denied.status()).toBe(403);

    await drawer.getByRole('button', { name: '删除评论' }).click();
    const confirm = page.getByRole('dialog', { name: '删除评论？' });
    await confirm.getByRole('button', { name: '删除评论' }).click();
    await expect(drawer.getByText(/Check the deployment note/)).toHaveCount(0);
    await viewer.keyboard.press('Escape');
    await viewer.getByRole('button', { name: '文档评论' }).click();
    viewerDrawer = viewer.getByRole('dialog', { name: '评论 · Inline writing' });
    await expect(viewerDrawer.getByText('还没有评论。')).toBeVisible();
  } finally { await context.close(); }
});
