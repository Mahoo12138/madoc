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
  await page.route('**/api/auth/session', async (route) => {
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
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByRole('main', { name: '工作区管理' })).toBeVisible();
});
