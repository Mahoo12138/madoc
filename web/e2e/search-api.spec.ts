import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

test('search HTTP returns literal Chinese matches, scoped paths and cache watermarks', async ({
  page,
  browser,
}) => {
  const id = await openDocument(
    page,
    '中文正文 含短词，还有 100% 与 snake_case',
  );
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const endpoint = `/api/workspaces/${workspace}/search`;
  for (const query of ['中', '短词', '%', '_', 'SNAKE_case']) {
    const response = await page.request.get(endpoint, { params: { q: query } });
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id,
      type: 'markdown',
      path: 'Inline writing',
      match: 'body',
    });
    expect(result.items[0].headSeq).toBeGreaterThanOrEqual(
      result.items[0].cacheSeq,
    );
  }
  expect(
    (await page.request.get(endpoint, { params: { q: '' } })).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get(endpoint, { params: { q: '中', limit: '101' } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get(endpoint, { params: { q: '中', limit: 'bad' } })
    ).status(),
  ).toBe(400);
  const anonymous = await browser.newContext();
  try {
    expect(
      (
        await anonymous.request.get(`http://127.0.0.1:3100${endpoint}?q=中`)
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
  expect(
    (await page.request.delete(`/api/items/${id}`, { headers })).status(),
  ).toBe(204);
  expect(
    (await (await page.request.get(endpoint, { params: { q: '中' } })).json())
      .items,
  ).toEqual([]);
  const [batch] = await (
    await page.request.get(`/api/workspaces/${workspace}/trash`)
  ).json();
  expect(
    (
      await page.request.post(
        `/api/workspaces/${workspace}/trash/${batch.id}/restore`,
        { headers, data: {} },
      )
    ).status(),
  ).toBe(204);
  expect(
    (await (await page.request.get(endpoint, { params: { q: '中' } })).json())
      .items[0].id,
  ).toBe(id);
});
