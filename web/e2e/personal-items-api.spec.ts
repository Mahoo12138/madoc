import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

test('personal navigation is private, viewer writable and hidden while trashed', async ({
  page,
  browser,
}) => {
  const item = await openDocument(page, 'Keep body');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const list = `/api/workspaces/${workspace}/personal-items`;
  await expect
    .poll(
      async () => (await (await page.request.get(list)).json()).recent.length,
    )
    .toBe(1);
  const ownerBefore = await (await page.request.get(list)).json();
  expect(ownerBefore.favorites).toEqual([]);
  expect((await page.request.put(`/api/items/${item}/favorite`)).status()).toBe(
    403,
  );
  const invite = await (
    await page.request.post(`/api/workspaces/${workspace}/invites`, {
      headers,
      data: { email: 'personal-viewer@example.test', role: 'viewer' },
    })
  ).json();
  const context = await browser.newContext();
  try {
    const accepted = await context.request.post(
      `http://127.0.0.1:3100/api/invites/${invite.token}/accept`,
      { data: { name: 'Viewer', password: 'password123' } },
    );
    const { user, csrfToken } = await accepted.json();
    const privateHeaders = {
      Origin: 'http://127.0.0.1:3100',
      'x-madoc-csrf-token': csrfToken,
    };
    for (let n = 0; n < 2; n++) {
      expect(
        (
          await context.request.put(
            `http://127.0.0.1:3100/api/items/${item}/favorite`,
            { headers: privateHeaders },
          )
        ).status(),
      ).toBe(204);
      expect(
        (
          await context.request.post(
            `http://127.0.0.1:3100/api/items/${item}/visit`,
            { headers: privateHeaders },
          )
        ).status(),
      ).toBe(204);
    }
    const personal = async () =>
      (await context.request.get(`http://127.0.0.1:3100${list}`)).json();
    const state = await personal();
    expect(state.favorites).toHaveLength(1);
    expect(state.recent).toHaveLength(1);
    expect(state.favorites[0].id).toBe(item);
    expect(state.recent[0].item.id).toBe(item);
    expect(Date.parse(state.recent[0].visitedAt)).not.toBeNaN();
    expect(await (await page.request.get(list)).json()).toEqual(ownerBefore);
    expect(
      (
        await context.request.patch(`http://127.0.0.1:3100/api/items/${item}`, {
          headers: privateHeaders,
          data: { title: 'Denied' },
        })
      ).status(),
    ).toBe(403);
    await page.request.delete(`/api/items/${item}`, { headers });
    expect(await personal()).toEqual({ favorites: [], recent: [] });
    expect(
      (
        await context.request.post(
          `http://127.0.0.1:3100/api/items/${item}/visit`,
          { headers: privateHeaders },
        )
      ).status(),
    ).toBe(404);
    const [batch] = await (
      await page.request.get(`/api/workspaces/${workspace}/trash`)
    ).json();
    await page.request.post(
      `/api/workspaces/${workspace}/trash/${batch.id}/restore`,
      { headers, data: {} },
    );
    expect((await personal()).favorites[0].id).toBe(item);
    await context.request.delete(
      `http://127.0.0.1:3100/api/items/${item}/favorite`,
      { headers: privateHeaders },
    );
    const unfavorite = await personal();
    expect(unfavorite.favorites).toEqual([]);
    expect(unfavorite.recent).toHaveLength(1);
    await page.request.delete(
      `/api/workspaces/${workspace}/members/${user.id}`,
      { headers },
    );
    expect(
      (await context.request.get(`http://127.0.0.1:3100${list}`)).status(),
    ).toBe(403);
    expect(
      (
        await context.request.put(
          `http://127.0.0.1:3100/api/items/${item}/favorite`,
          { headers: privateHeaders },
        )
      ).status(),
    ).toBe(403);
  } finally {
    await context.close();
  }
});
