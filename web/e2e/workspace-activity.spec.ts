import { expect, test } from '@playwright/test';
import { accountHeaders } from './helpers/account';
import { openDocument } from './helpers/writing';

test('workspace members see safe activity summaries within their access boundary', async ({ page, browser }) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const itemId = new URL(page.url()).pathname.split('/')[3];
  const body = 'comment text excluded from activity';
  await page.getByRole('button', { name: '文档评论' }).click();
  const comments = page.getByRole('dialog', { name: /评论/ });
  await comments.getByRole('textbox', { name: '添加评论' }).fill(body);
  await comments.getByRole('button', { name: '发送评论' }).click();
  await expect(comments).toContainText(body);

  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const invitation = await (await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
    headers,
    data: { email: `activity-viewer-${Date.now()}@example.test`, role: 'viewer' },
  })).json();
  const viewerContext = await browser.newContext();
  try {
    const viewerPage = await viewerContext.newPage();
    const accepted = await viewerContext.request.post(`http://127.0.0.1:3100/api/invites/${invitation.token}/accept`, {
      data: { name: 'Activity Viewer', password: 'password123' },
    });
    expect(accepted.ok()).toBeTruthy();

    const activityResponse = await viewerContext.request.get(`http://127.0.0.1:3100/api/workspaces/${workspaceId}/activity`);
    expect(activityResponse.ok()).toBeTruthy();
    const activity = await activityResponse.json();
    expect(activity.events[0]).toMatchObject({ itemId, itemTitle: 'Inline writing', actorName: 'Owner', summary: '添加了一条评论' });
    expect(JSON.stringify(activity)).not.toContain(body);

    await viewerPage.goto(`http://127.0.0.1:3100/workspace/${workspaceId}`);
    await viewerPage.getByRole('button', { name: '活动记录' }).click();
    const drawer = viewerPage.getByRole('dialog', { name: /活动记录/ });
    await expect(drawer).toContainText('添加了一条评论');
    await expect(drawer).not.toContainText(body);
  } finally {
    await viewerContext.close();
  }
});
