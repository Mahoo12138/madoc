import { expect, test } from '@playwright/test';
import { accountHeaders } from './helpers/account';
import { openDocument } from './helpers/writing';

test('workspace members see safe activity summaries within their access boundary', async ({
  page,
  browser,
}) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const itemId = new URL(page.url()).pathname.split('/')[3];
  const { user: actor } = await (
    await page.request.get('/api/auth/session')
  ).json();
  const body = 'comment text excluded from activity';
  await page.getByRole('button', { name: '文档评论' }).click();
  const comments = page.getByRole('dialog', { name: /评论/ });
  await comments.getByRole('textbox', { name: '添加评论' }).fill(body);
  await comments.getByRole('button', { name: '发送评论' }).click();
  await expect(comments).toContainText(body);

  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const invitation = await (
    await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
      headers,
      data: {
        email: `activity-viewer-${Date.now()}@example.test`,
        role: 'viewer',
      },
    })
  ).json();
  const viewerContext = await browser.newContext();
  try {
    const viewerPage = await viewerContext.newPage();
    const accepted = await viewerContext.request.post(
      `http://127.0.0.1:3100/api/invites/${invitation.token}/accept`,
      {
        data: { name: 'Activity Viewer', password: 'password123' },
      },
    );
    expect(accepted.ok()).toBeTruthy();

    const activityResponse = await viewerContext.request.get(
      `http://127.0.0.1:3100/api/workspaces/${workspaceId}/activity`,
    );
    expect(activityResponse.ok()).toBeTruthy();
    const activity = await activityResponse.json();
    expect(activity.events[0]).toMatchObject({
      itemId,
      itemTitle: 'Inline writing',
      actorName: actor.name,
      summary: '添加了一条评论',
    });
    expect(JSON.stringify(activity)).not.toContain(body);

    await viewerPage.goto(`http://127.0.0.1:3100/workspace/${workspaceId}`);
    await viewerPage.getByRole('button', { name: '工作区菜单' }).click();
    await viewerPage.getByRole('menuitem', { name: '管理' }).click();
    await viewerPage
      .getByRole('navigation', { name: '工作区管理导航' })
      .getByRole('button', { name: '活动记录' })
      .click();
    const drawer = viewerPage.getByRole('main', { name: '工作区管理' });
    await expect(drawer).toContainText('添加了一条评论');
    await expect(drawer).not.toContainText(body);
    await viewerPage.screenshot({
      path: '/tmp/madoc-management-activity.png',
      animations: 'disabled',
    });
  } finally {
    await viewerContext.close();
  }
});

test('activity keeps loaded records when an older page fails and retries', async ({
  page,
}) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  let failOlderPage = true;
  await page.route(
    `**/api/workspaces/${workspaceId}/activity?*`,
    async (route) => {
      const before = new URL(route.request().url()).searchParams.get('before');
      if (before && failOlderPage) {
        await route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'Unavailable' } },
        });
        return;
      }
      await route.fulfill({
        json: before
          ? {
              events: [
                {
                  id: 'older-event',
                  actorName: 'Old Member',
                  type: 'item.created',
                  summary: '更早的活动',
                  createdAt: '2026-09-28T08:00:00Z',
                },
              ],
              nextBefore: '',
            }
          : {
              events: [
                {
                  id: 'recent-event',
                  actorName: 'Current Member',
                  type: 'item.created',
                  summary: '最近的活动',
                  createdAt: '2026-09-29T08:00:00Z',
                },
              ],
              nextBefore: 'older',
            },
      });
    },
  );

  await page.getByRole('button', { name: '工作区菜单' }).click();
  await page.getByRole('menuitem', { name: '管理' }).click();
  const management = page.getByRole('main', { name: '工作区管理' });
  await page.getByRole('navigation', { name: '工作区管理导航' })
    .getByRole('button', { name: '活动记录' }).click();
  await expect(management).toContainText('最近的活动');
  await management.getByRole('button', { name: '加载更早记录' }).click();
  await expect(management).toContainText('更早的记录加载失败');
  await expect(management).toContainText('最近的活动');
  failOlderPage = false;
  await management.getByRole('button', { name: '重试加载' }).click();
  await expect(management).toContainText('更早的活动');
  await expect(management).not.toContainText('更早的记录加载失败');
});
