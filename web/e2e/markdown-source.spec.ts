import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

for (const mobile of [false, true]) {
  test(`source view is readonly and copies/downloads its exact snapshot ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
    context,
  }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const id = await openDocument(
      page,
      '# Source\n\n**bold** and \\*literal\\*.\n\n```ts\nconst x = 1;\n```',
    );
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: '查看 Markdown 源码' }).click();
    const dialog = page.getByRole('dialog', { name: 'Markdown 源码' });
    const field = dialog.getByLabel('只读源码');
    await expect(field).toHaveAttribute('readonly', '');
    const source = await field.inputValue();
    expect(source).toContain('# Source');
    expect(source).toContain('**bold**');
    expect(source).toContain('\\*literal\\*');
    expect(source).toContain('```ts');
    await field.click();
    await page.keyboard.type('MUST NOT EDIT');
    await expect(field).toHaveValue(source);
    await dialog.getByRole('button', { name: '复制源码', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(source);
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '下载所示源码' }).click();
    expect(await readFile((await (await download).path())!, 'utf8')).toBe(
      source,
    );
    await page.screenshot({
      path: testInfo.outputPath('source.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(
      (await (await page.request.get(`/api/items/${id}/markdown`)).json())
        .markdown,
    ).not.toContain('MUST NOT EDIT');
  });
}

test('source remains stable until refreshed and clipboard failure selects it manually', async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    }),
  );
  await openDocument(page, 'Original');
  const peer = await context.newPage();
  await peer.goto(page.url());
  await expect(peer.locator('.ProseMirror')).toHaveText('Original');
  await page.getByRole('button', { name: '查看 Markdown 源码' }).click();
  const field = page.getByLabel('只读源码');
  const before = await field.inputValue();
  await peer.locator('.ProseMirror').click();
  await peer.keyboard.press('End');
  await peer.keyboard.insertText(' remote addition');
  await expect(page.locator('.ProseMirror')).toContainText('remote addition');
  await expect(field).toHaveValue(before);
  await page.getByRole('button', { name: '刷新源码' }).click();
  await expect(field).toHaveValue(/remote addition/);
  await page.getByRole('button', { name: '复制源码', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('请手动复制');
  expect(
    await field.evaluate(
      (node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart,
    ),
  ).toBe((await field.inputValue()).length);
  await peer.close();
});

test('source warns about pending local edits and viewer inspection sends no content updates', async ({
  page,
  browser,
}) => {
  let hold = false;
  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (hold && JSON.parse(String(message)).type === 'markdown.update')
        return;
      server.send(message);
    });
  });
  await openDocument(page, 'Saved');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  hold = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' local pending');
  await page.getByRole('button', { name: '查看 Markdown 源码' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    '尚未同步',
  );
  await expect(page.getByLabel('只读源码')).toHaveValue(/local pending/);
  const invite = await (
    await page.request.post(`/api/workspaces/${workspace}/invites`, {
      headers,
      data: { email: 'source-viewer@example.test', role: 'viewer' },
    })
  ).json();
  const context = await browser.newContext();
  try {
    await context.request.post(
      `http://127.0.0.1:3100/api/invites/${invite.token}/accept`,
      { data: { name: 'Viewer', password: 'password123' } },
    );
    const viewer = await context.newPage();
    let updates = 0;
    await viewer.routeWebSocket('**/ws', (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) => {
        if (JSON.parse(String(message)).type === 'markdown.update') updates++;
        server.send(message);
      });
    });
    await viewer.goto(page.url());
    await expect(viewer.locator('.ProseMirror')).toHaveText('Saved');
    await viewer.getByRole('button', { name: '查看 Markdown 源码' }).click();
    await expect(viewer.getByLabel('只读源码')).toHaveValue('Saved\n');
    await viewer.getByRole('button', { name: '刷新源码' }).click();
    expect(updates).toBe(0);
  } finally {
    await context.close();
  }
});
