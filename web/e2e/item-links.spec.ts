import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

const origin = 'http://127.0.0.1:3100';
for (const mobile of [false, true]) {
  test(`copied content links survive rename and move ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
    context,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const id = await openDocument(page, '# Stable destination');
    const url = page.url();
    const workspace = new URL(url).pathname.split('/')[2];
    const headers = await accountHeaders(page, origin);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    if (mobile)
      await page.getByRole('button', { name: '打开内容导航' }).click();
    await page.getByRole('button', { name: 'Inline writing 的操作' }).click();
    await page.getByRole('menuitem', { name: '复制链接', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(url);
    const folder = await (
      await page.request.post(`/api/workspaces/${workspace}/items`, {
        headers,
        data: { type: 'folder', title: 'Moved folder', parentId: null },
      })
    ).json();
    expect(
      (
        await page.request.patch(`/api/items/${id}`, {
          headers,
          data: { title: 'Renamed destination' },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await page.request.post(`/api/items/${id}/move`, {
          headers,
          data: { parentId: folder.id, index: 0 },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto(url);
    await expect(page.locator('.ProseMirror h1')).toHaveText(
      'Stable destination',
    );
    await expect(page.locator('header')).toContainText('Renamed destination');
    expect(page.url()).toBe(url);
    const board = await (
      await page.request.post(`/api/workspaces/${workspace}/items`, {
        headers,
        data: { type: 'whiteboard', title: 'Linked board', parentId: null },
      })
    ).json();
    await page.reload();
    if (mobile)
      await page.getByRole('button', { name: '打开内容导航' }).click();
    await page.getByRole('button', { name: 'Linked board 的操作' }).click();
    await page.getByRole('menuitem', { name: '复制链接', exact: true }).click();
    const boardURL = `${origin}/workspace/${workspace}/${board.id}`;
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(boardURL);
    await page.goto(boardURL);
    await expect(page.locator('.excalidraw')).toBeVisible();
    await page.request.delete(`/api/items/${id}`, { headers });
    await page.goto(url);
    await expect(page.getByRole('alert')).toContainText('无法打开此链接');
    await expect(page.locator('.ProseMirror')).toHaveCount(0);
    const batches = await (
      await page.request.get(`/api/workspaces/${workspace}/trash`)
    ).json();
    await page.request.post(
      `/api/workspaces/${workspace}/trash/${batches[0].id}/restore`,
      { headers, data: {} },
    );
    await page.reload();
    await expect(page.locator('.ProseMirror h1')).toHaveText(
      'Stable destination',
    );
  });
}

test('viewer can manually copy a private link, but revocation still denies access', async ({
  page,
  browser,
}) => {
  await openDocument(page, '# Private linked text');
  const url = page.url();
  const workspace = new URL(url).pathname.split('/')[2];
  const headers = await accountHeaders(page, origin);
  const invite = await (
    await page.request.post(`/api/workspaces/${workspace}/invites`, {
      headers,
      data: { email: 'link-viewer@example.test', role: 'viewer' },
    })
  ).json();
  const context = await browser.newContext();
  try {
    const accepted = await context.request.post(
      `${origin}/api/invites/${invite.token}/accept`,
      { data: { name: 'Link viewer', password: 'password123' } },
    );
    const { user } = await accepted.json();
    const viewer = await context.newPage();
    await viewer.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async () => {
            throw new Error('Denied');
          },
        },
      });
    });
    await viewer.goto(url);
    await expect(viewer.locator('.ProseMirror h1')).toHaveText(
      'Private linked text',
    );
    await viewer.getByRole('button', { name: 'Inline writing 的操作' }).click();
    await expect(
      viewer.getByRole('menuitem', { name: '删除', exact: true }),
    ).toHaveCount(0);
    await expect(
      viewer.getByRole('menuitem', { name: '重命名', exact: true }),
    ).toHaveCount(0);
    await viewer
      .getByRole('menuitem', { name: '复制链接', exact: true })
      .click();
    await expect(
      viewer.getByRole('dialog', { name: '复制链接' }),
    ).toBeVisible();
    await expect(viewer.getByLabel('内容链接')).toHaveValue(url);
    await expect(viewer.getByLabel('内容链接')).toHaveAttribute('readonly', '');
    await page.request.delete(
      `/api/workspaces/${workspace}/members/${user.id}`,
      { headers },
    );
    await viewer.reload();
    await expect(viewer.getByRole('alert')).toContainText('无法打开此链接');
    await expect(viewer.locator('.ProseMirror')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
