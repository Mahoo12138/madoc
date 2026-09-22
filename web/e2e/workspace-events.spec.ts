import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

test('workspace subscriptions invalidate committed metadata and recover missed changes on watch', async ({
  page,
}) => {
  const doc = await openDocument(page);
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  await page.evaluate(async (workspaceId) => {
    const socket = new WebSocket(`ws://${location.host}/ws`);
    const state = {
      socket,
      messages: [] as { type: string; payload?: { workspaceId?: string } }[],
    };
    Object.assign(window, { workspaceEvents: state });
    socket.onmessage = (event) => state.messages.push(JSON.parse(event.data));
    await new Promise<void>((resolve) => {
      socket.onopen = () => resolve();
    });
    socket.send(
      JSON.stringify({ type: 'workspace.watch', payload: { workspaceId } }),
    );
  }, workspace);
  const events = () =>
    page.evaluate(() => {
      const state = (
        window as unknown as {
          workspaceEvents: {
            messages: { type: string; payload?: { workspaceId?: string } }[];
          };
        }
      ).workspaceEvents;
      return state.messages.filter(
        (message) => message.type === 'workspace.changed',
      );
    });
  let count = 1;
  await expect.poll(async () => (await events()).length).toBe(count);
  const changed = async () => {
    count++;
    await expect.poll(async () => (await events()).length).toBe(count);
    expect((await events()).at(-1)?.payload).toEqual({
      workspaceId: workspace,
    });
  };
  const folderResponse = await page.request.post(
    `/api/workspaces/${workspace}/items`,
    { headers, data: { type: 'folder', title: 'Event folder' } },
  );
  expect(folderResponse.status()).toBe(201);
  const folder = await folderResponse.json();
  await changed();
  expect(
    (
      await page.request.patch(`/api/items/${doc}`, {
        headers,
        data: { title: 'Renamed remotely' },
      })
    ).status(),
  ).toBe(204);
  await changed();
  expect(
    (
      await page.request.post(`/api/items/${doc}/move`, {
        headers,
        data: { parentId: folder.id, index: 0 },
      })
    ).status(),
  ).toBe(204);
  await changed();
  expect(
    (
      await page.request.delete(`/api/items/${folder.id}`, { headers })
    ).status(),
  ).toBe(204);
  await changed();
  const list = `/api/workspaces/${workspace}/trash`;
  let [batch] = await (await page.request.get(list)).json();
  expect(
    (
      await page.request.post(`${list}/${batch.id}/restore`, {
        headers,
        data: {},
      })
    ).status(),
  ).toBe(204);
  await changed();
  expect(
    (
      await page.request.delete(`/api/items/${folder.id}`, { headers })
    ).status(),
  ).toBe(204);
  await changed();
  [batch] = await (await page.request.get(list)).json();
  expect(
    (
      await page.request.delete(`${list}/${batch.id}`, {
        headers,
        data: { confirmation: 'incorrect' },
      })
    ).status(),
  ).toBe(400);
  // A ping on the same socket acts as a barrier after the failed HTTP response.
  await page.evaluate(() => {
    (
      window as unknown as { workspaceEvents: { socket: WebSocket } }
    ).workspaceEvents.socket.send(JSON.stringify({ type: 'ping' }));
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            workspaceEvents: { messages: { type: string }[] };
          }
        ).workspaceEvents.messages.some((message) => message.type === 'pong'),
      ),
    )
    .toBe(true);
  expect((await events()).length).toBe(count);
  expect(
    (
      await page.request.delete(`${list}/${batch.id}`, {
        headers,
        data: { confirmation: folder.title },
      })
    ).status(),
  ).toBe(204);
  await changed();
  await page.evaluate(() =>
    (
      window as unknown as { workspaceEvents: { socket: WebSocket } }
    ).workspaceEvents.socket.send(
      JSON.stringify({ type: 'workspace.unwatch' }),
    ),
  );
  // Rewatch always produces an invalidation, even with no content room open.
  await page.evaluate(
    (workspaceId) =>
      (
        window as unknown as { workspaceEvents: { socket: WebSocket } }
      ).workspaceEvents.socket.send(
        JSON.stringify({ type: 'workspace.watch', payload: { workspaceId } }),
      ),
    workspace,
  );
  await changed();
  expect(
    (
      await page.request.delete(`/api/workspaces/${workspace}`, { headers })
    ).status(),
  ).toBe(204);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            workspaceEvents: { messages: { type: string }[] };
          }
        ).workspaceEvents.messages.some(
          (message) => message.type === 'workspace.unavailable',
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as { workspaceEvents: { socket: WebSocket } }
    ).workspaceEvents.socket.close(),
  );
});
