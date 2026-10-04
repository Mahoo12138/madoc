import { expect, test } from '@playwright/test';

test('direct management link retries a transient session failure', async ({ page }) => {
  const status = await (await page.request.get('/api/setup/status')).json();
  const auth = await page.request.post(
    status.initialized ? '/api/auth/sign-in' : '/api/setup/admin',
    {
      data: {
        ...(!status.initialized ? { name: 'Owner' } : {}),
        email: 'owner@example.test',
        password: 'password123',
      },
    },
  );
  expect(auth.ok()).toBeTruthy();
  const { csrfToken } = await auth.json();
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const created = await page.request.post('/api/workspaces', {
    headers: { 'x-madoc-csrf-token': csrfToken, Origin: origin },
    data: { name: '直达管理测试' },
  });
  expect(created.ok()).toBeTruthy();
  const workspace = (await created.json()) as { id: string };

  let failSession = true;
  let sessionRequests = 0;
  const failedSession = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/session') && response.status() === 503,
  );
  // Mount the lazy page after the global account query has already failed.
  await page.route('**/assets/workspace-management-page-*.js', async (route) => {
    await failedSession;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.route('**/api/auth/session', async (route) => {
    sessionRequests++;
    if (failSession) {
      failSession = false;
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Unavailable' } },
      });
    } else await route.continue();
  });
  await page.goto(`/workspace/${workspace.id}/manage#workspace`);
  await expect(page.getByRole('alert')).toContainText('无法确认登录状态');
  await expect(page).toHaveURL(`/workspace/${workspace.id}/manage#workspace`);
  expect(sessionRequests).toBe(1);
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByRole('main', { name: '工作区管理' })).toBeVisible();
  expect(sessionRequests).toBe(2);
});
