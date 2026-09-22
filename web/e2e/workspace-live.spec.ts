import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { openBoard, rectangle } from './helpers/whiteboard';
import { accountHeaders } from './helpers/account';

test('one socket refreshes metadata and retains a deleted editor for rescue', async ({
  page,
  context,
}) => {
  let connections = 0;
  page.on('websocket', () => connections++);
  const doc = await openDocument(page, 'Keep this local text');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  expect(connections).toBe(1);
  const observer = await context.newPage();
  await observer.goto(`/workspace/${workspace}`);
  await expect(
    observer.getByRole('button', { name: 'Workspace 菜单' }),
  ).toBeVisible();
  expect(
    (
      await page.request.patch(`/api/items/${doc}`, {
        headers,
        data: { title: 'Remote title' },
      })
    ).status(),
  ).toBe(204);
  await expect(page.getByLabel('文档标题')).toHaveValue('Remote title');
  await expect(
    observer.getByText('Remote title', { exact: true }),
  ).toBeVisible();
  const folder = await (
    await page.request.post(`/api/workspaces/${workspace}/items`, {
      headers,
      data: { type: 'folder', title: 'Live folder' },
    })
  ).json();
  await expect(
    observer.getByText('Live folder', { exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.post(`/api/items/${doc}/move`, {
        headers,
        data: { parentId: folder.id, index: 0 },
      })
    ).status(),
  ).toBe(204);
  await expect(page.locator('.ProseMirror')).toContainText(
    'Keep this local text',
  );
  expect(connections).toBe(1);
  expect(
    (
      await page.request.delete(`/api/items/${folder.id}`, { headers })
    ).status(),
  ).toBe(204);
  await expect(observer.getByText('Live folder', { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('alert').filter({ hasText: '此内容已删除' }),
  ).toBeVisible();
  await expect(page.locator('.ProseMirror')).toHaveAttribute(
    'contenteditable',
    'false',
  );
  await expect(page.locator('.ProseMirror')).toContainText(
    'Keep this local text',
  );
  await expect(
    page.getByRole('button', { name: '下载本地副本', exact: true }),
  ).toBeVisible();
  const [batch] = await (
    await page.request.get(`/api/workspaces/${workspace}/trash`)
  ).json();
  await page.request.post(
    `/api/workspaces/${workspace}/trash/${batch.id}/restore`,
    { headers, data: {} },
  );
  await expect(
    observer.getByText('Live folder', { exact: true }),
  ).toBeVisible();
  await observer.close();
});

test('reconnect refetches changes missed while the workspace is offline', async ({
  page,
}) => {
  let offline = false;
  let disconnect = () => {};
  await page.routeWebSocket('**/ws', (socket) => {
    if (offline) {
      socket.close({ code: 1000 });
      return;
    }
    const server = socket.connectToServer();
    disconnect = () => {
      server.close({ code: 1000 });
      socket.close({ code: 1000 });
    };
  });
  const doc = await openDocument(page, 'Offline content');
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  offline = true;
  disconnect();
  await expect(page.getByText('离线', { exact: true })).toBeVisible();
  await page.request.patch(`/api/items/${doc}`, {
    headers,
    data: { title: 'Changed while disconnected' },
  });
  await expect(page.getByLabel('文档标题')).toHaveValue('Inline writing');
  offline = false;
  await expect(page.getByLabel('文档标题')).toHaveValue(
    'Changed while disconnected',
  );
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});

test('downgrade stops an open editor without discarding its unsent text', async ({
  page,
  browser,
}) => {
  await openDocument(page, 'Before downgrade');
  const url = page.url();
  const workspace = new URL(url).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const invite = await (
    await page.request.post(`/api/workspaces/${workspace}/invites`, {
      headers,
      data: { email: 'live-downgrade@example.test', role: 'editor' },
    })
  ).json();
  const context = await browser.newContext();
  try {
    const acceptance = await context.request.post(
      `http://127.0.0.1:3100/api/invites/${invite.token}/accept`,
      { data: { name: 'Editor', password: 'password123' } },
    );
    const { user } = await acceptance.json();
    const member = await context.newPage();
    let hold = false;
    await member.routeWebSocket('**/ws', (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) => {
        if (hold && JSON.parse(String(message)).type === 'markdown.update')
          return;
        server.send(message);
      });
    });
    await member.goto(url);
    await expect(member.getByText('已保存', { exact: true })).toBeVisible();
    hold = true;
    await member.locator('.ProseMirror').click();
    await member.keyboard.press('End');
    await member.keyboard.insertText(' unsent survives');
    expect(
      (
        await page.request.patch(
          `/api/workspaces/${workspace}/members/${user.id}`,
          { headers, data: { role: 'viewer' } },
        )
      ).status(),
    ).toBe(204);
    await expect(member.locator('.ProseMirror')).toHaveAttribute(
      'contenteditable',
      'false',
    );
    await expect(member.locator('.ProseMirror')).toContainText(
      'unsent survives',
    );
    await expect(
      member.getByRole('button', { name: '下载本地副本', exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test('deleted whiteboard remains available as a local rescue', async ({
  page,
}) => {
  const board = await openBoard(page);
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await rectangle(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(
    (await page.request.delete(`/api/items/${board}`, { headers })).status(),
  ).toBe(204);
  await expect(
    page.getByRole('alert').filter({ hasText: '此内容已删除' }),
  ).toBeVisible();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '下载本地白板副本' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载本地白板副本' }).click();
  expect((await download).suggestedFilename()).toContain('本地副本');
});
