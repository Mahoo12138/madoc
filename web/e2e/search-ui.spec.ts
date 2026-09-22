import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

for (const mobile of [false, true]) {
  test(`workspace search supports Chinese, keyboard opening and live deletion ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const first = await openDocument(page, '短词检索与正文片段');
    const workspace = new URL(page.url()).pathname.split('/')[2];
    const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
    const target = await (
      await page.request.post(`/api/workspaces/${workspace}/items`, {
        headers,
        data: { type: 'markdown', title: '目标文档' },
      })
    ).json();
    if (mobile)
      await page
        .getByRole('button', { name: '快速打开与搜索', exact: true })
        .click();
    else {
      await page.locator('.ProseMirror').click();
      await page.keyboard.press('Control+k');
    }
    const dialog = page.getByRole('dialog', { name: '快速打开与搜索' });
    const input = dialog.getByRole('combobox');
    await expect(input).toBeFocused();
    await input.fill('短词');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByRole('option')).toContainText(
      '短词检索与正文片段',
    );
    await page.screenshot({
      path: testInfo.outputPath('search.png'),
      fullPage: true,
    });
    await input.fill('目标');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByRole('option')).toContainText('目标文档');
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(target.id));
    await expect(page.locator('.ProseMirror')).toBeVisible();
    expect(errors).toEqual([]);
    if (mobile)
      await page
        .getByRole('button', { name: '快速打开与搜索', exact: true })
        .click();
    else await page.keyboard.press('Meta+k');
    await input.fill('短词');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await page.request.delete(`/api/items/${first}`, { headers });
    await expect(dialog.getByText('没有匹配结果')).toBeVisible();
    await input.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

test('search shows lag warnings and retries failure without treating HTML as markup', async ({
  page,
}) => {
  const id = await openDocument(page);
  const workspace = new URL(page.url()).pathname.split('/')[2];
  let fail = true;
  await page.route(`**/workspaces/${workspace}/search?*`, (route) =>
    fail
      ? route.fulfill({
          status: 500,
          json: { error: { code: 'TEST', message: 'failure' } },
        })
      : route.fulfill({
          json: {
            items: [
              {
                id,
                type: 'markdown',
                title: 'Result',
                path: 'Folder / Result',
                snippet: '<img src=x onerror=alert(1)>',
                cacheSeq: 1,
                headSeq: 2,
                generation: 0,
              },
            ],
            hasMore: true,
            staleDocuments: 1,
          },
        }),
  );
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: '快速打开与搜索' });
  await dialog.getByRole('combobox').fill('query');
  await expect(dialog.getByRole('alert')).toContainText('搜索未完成');
  fail = false;
  await dialog.getByRole('button', { name: '重试', exact: true }).click();
  await expect(
    dialog.getByText('1 篇文档的最新修改尚未纳入正文检索。可稍后刷新结果。'),
  ).toBeVisible();
  await expect(dialog.getByRole('option')).toContainText(
    '<img src=x onerror=alert(1)>',
  );
  await expect(dialog.locator('img')).toHaveCount(0);
  await expect(
    dialog.getByText('仅显示前 30 项，请输入更具体的关键词。'),
  ).toBeVisible();
});

test('composition does not open the selected result and late queries cannot replace current results', async ({
  page,
}) => {
  const id = await openDocument(page);
  const workspace = new URL(page.url()).pathname.split('/')[2];
  let arrived = false;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/workspaces/${workspace}/search?*`, async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'old') {
      arrived = true;
      await pending;
    }
    await route.fulfill({
      json: {
        items: [
          {
            id,
            type: 'markdown',
            title: q,
            path: q,
            snippet: '',
            headSeq: 0,
            cacheSeq: 0,
          },
        ],
        hasMore: false,
        staleDocuments: 0,
      },
    });
  });
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: '快速打开与搜索' });
  const input = dialog.getByRole('combobox');
  await input.fill('old');
  await expect.poll(() => arrived).toBe(true);
  await input.fill('新');
  await expect(dialog.getByRole('option')).toContainText('新');
  release();
  await input.press('ArrowDown');
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
    bubbles: true,
  });
  await expect(dialog).toBeVisible();
  await input.dispatchEvent('compositionend');
  await expect(dialog.getByRole('option')).toContainText('新');
  await expect(dialog.getByRole('option')).not.toContainText('old');
});

test('quick open reveals a collapsed folder without navigating to an empty editor', async ({
  page,
}) => {
  await openDocument(page);
  const original = page.url();
  const workspace = new URL(original).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const folder = await (
    await page.request.post(`/api/workspaces/${workspace}/items`, {
      headers,
      data: { type: 'folder', title: 'Folder target' },
    })
  ).json();
  await page.request.post(`/api/workspaces/${workspace}/items`, {
    headers,
    data: { type: 'markdown', title: 'Inside target', parentId: folder.id },
  });
  await expect(page.getByText('Inside target', { exact: true })).toBeVisible();
  await page.getByText('Folder target', { exact: true }).click();
  await expect(page.getByText('Inside target', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: '快速打开与搜索' });
  await dialog.getByRole('option', { name: /^Folder target 文件夹/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Inside target', { exact: true })).toBeVisible();
  expect(page.url()).toBe(original);
});
