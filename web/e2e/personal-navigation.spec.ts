import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

for (const mobile of [false, true]) {
  test(`favorites and recent navigation survive reload, hide trash and recover ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const id = await openDocument(page, 'Personal content');
    const workspace = new URL(page.url()).pathname.split('/')[2];
    const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
    if (mobile)
      await page.getByRole('button', { name: '打开内容导航' }).click();
    await page
      .getByRole('button', { name: '收藏 Inline writing', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: '取消收藏 Inline writing',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('tab', { name: '我的', exact: true }).click();
    const favorites = page.getByRole('navigation', { name: '我的收藏' });
    await expect(
      favorites.getByText('Inline writing', { exact: true }),
    ).toHaveCount(2);
    await page.screenshot({
      path: testInfo.outputPath('favorites.png'),
      fullPage: true,
    });
    await page
      .locator('label')
      .filter({ has: page.getByText('最近访问', { exact: true }) })
      .filter({ visible: true })
      .click();
    const recent = page.getByRole('navigation', { name: '最近访问列表' });
    await expect(recent.getByRole('button')).toHaveCount(1);
    await recent.getByRole('button').click();
    if (mobile) await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    if (mobile)
      await page.getByRole('button', { name: '打开内容导航' }).click();
    await expect(
      page.getByRole('button', {
        name: '取消收藏 Inline writing',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('tab', { name: '我的', exact: true }).click();
    await expect(
      favorites.getByRole('button', { name: '取消收藏 Inline writing' }),
    ).toBeVisible();
    await page.request.delete(`/api/items/${id}`, { headers });
    await expect(favorites.getByRole('button')).toHaveCount(0);
    const [batch] = await (
      await page.request.get(`/api/workspaces/${workspace}/trash`)
    ).json();
    await page.request.post(
      `/api/workspaces/${workspace}/trash/${batch.id}/restore`,
      { headers, data: {} },
    );
    await expect(
      favorites.getByRole('button', { name: '取消收藏 Inline writing' }),
    ).toBeVisible();
    await favorites
      .getByRole('button', { name: '取消收藏 Inline writing' })
      .click();
    await expect(favorites.getByRole('button')).toHaveCount(0);
    await page
      .locator('label')
      .filter({ has: page.getByText('最近访问', { exact: true }) })
      .filter({ visible: true })
      .click();
    await expect(recent.getByRole('button')).toHaveCount(1);
  });
}

test('failed favorite writes keep the prior state and can be retried', async ({
  page,
}) => {
  const id = await openDocument(page);
  const button = page.getByRole('button', {
    name: '收藏 Inline writing',
    exact: true,
  });
  await page.route(`**/items/${id}/favorite`, (route) =>
    route.fulfill({
      status: 500,
      json: { error: { code: 'TEST', message: 'failure' } },
    }),
  );
  await button.click();
  await expect(
    page.getByText('收藏未更新，请确认网络和访问权限后重试。'),
  ).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.unroute(`**/items/${id}/favorite`);
  await button.click();
  await expect(
    page.getByRole('button', { name: '取消收藏 Inline writing', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});
