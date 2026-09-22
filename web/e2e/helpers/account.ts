import { expect, type Page } from '@playwright/test';
export async function accountFixture(
  page: Page,
  baseURL: string,
  markdown = '',
) {
  const initialized = (
    await (await page.request.get(`${baseURL}/api/setup/status`)).json()
  ).initialized;
  const response = await page.request.post(
    `${baseURL}/api/${initialized ? 'auth/sign-in' : 'setup/admin'}`,
    {
      data: {
        ...(!initialized ? { name: 'Owner' } : {}),
        email: 'owner@example.test',
        password: 'password123',
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const { user, csrfToken } = await response.json();
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: baseURL };
  const workspace = await (
    await page.request.post(`${baseURL}/api/workspaces`, {
      headers,
      data: { name: 'Account settings' },
    })
  ).json();
  const item = await (
    await page.request.post(`${baseURL}/api/workspaces/${workspace.id}/items`, {
      headers,
      data: { type: 'markdown', title: 'Account document', parentId: null },
    })
  ).json();
  if (markdown) {
    const reset = await page.request.put(
      `${baseURL}/api/items/${item.id}/markdown`,
      { headers, data: { snapshot: '', markdown } },
    );
    expect(reset.ok()).toBeTruthy();
  }
  await page.goto(`${baseURL}/workspace/${workspace.id}/${item.id}`);
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  return { user, workspace, item };
}
export async function accountHeaders(page: Page, baseURL: string) {
  const cookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'madoc_csrf',
  );
  return { 'x-madoc-csrf-token': cookie!.value.split('.')[0], Origin: baseURL };
}
export async function openAccount(page: Page, section = '个人资料') {
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '设置', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '个人设置', exact: true }),
  ).toBeVisible();
  if (section !== '个人资料') {
    const mobile = page.getByRole('textbox', {
      name: '个人设置分类',
      exact: true,
    });
    if (await mobile.isVisible()) {
      await mobile.click();
      await page.getByRole('option', { name: section, exact: true }).click();
    } else {
      await page
        .getByRole('navigation', { name: '个人设置分类' })
        .getByRole('button', { name: section, exact: true })
        .click();
    }
  }
}
