import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { openBoard, rectangle } from './helpers/whiteboard';

for (const mobile of [false, true]) {
  test(`copy waits for Markdown ACK and opens independent content ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    let hold = false;
    const acks: string[] = [];
    let deliver = (_message: string) => {};
    await page.routeWebSocket('**/ws', (socket) => {
      const server = socket.connectToServer();
      deliver = (message) => socket.send(message);
      server.onMessage((message) => {
        if (
          hold &&
          JSON.parse(String(message)).type === 'markdown.update.ack'
        ) {
          acks.push(String(message));
          return;
        }
        socket.send(message);
      });
    });
    const original = await openDocument(page, 'Original');
    hold = true;
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' latest text');
    await expect.poll(() => acks.length).toBeGreaterThan(0);
    if (mobile)
      await page.getByRole('button', { name: '打开内容导航' }).click();
    await page.getByRole('button', { name: 'Inline writing 的操作' }).click();
    await page.getByRole('menuitem', { name: '复制内容', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '复制内容', exact: true });
    await expect(dialog.getByLabel('副本名称')).toHaveValue(
      'Inline writing 副本',
    );
    await dialog.getByLabel('副本名称').fill('Confirmed copy');
    await page.screenshot({
      path: testInfo.outputPath('copy-dialog.png'),
      fullPage: true,
    });
    let copies = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/duplicate')) copies++;
    });
    await dialog.getByRole('button', { name: '创建副本' }).click();
    await expect(dialog.getByRole('status')).toContainText('正在确认保存');
    expect(copies).toBe(0);
    hold = false;
    for (const ack of acks) deliver(ack);
    await expect(dialog.getByText('副本已创建。')).toBeVisible();
    expect(copies).toBe(1);
    await dialog.getByRole('button', { name: '打开副本' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.ProseMirror')).toHaveText(
      'Original latest text',
    );
    expect(page.url().split('/').pop()).not.toBe(original);
    await expect(page.locator('header')).toContainText('Confirmed copy');
  });
}

test('failed copy keeps its name and allows an explicit retry', async ({
  page,
}) => {
  await openDocument(page, 'Safe source');
  await page.getByRole('button', { name: 'Inline writing 的操作' }).click();
  await page.getByRole('menuitem', { name: '复制内容', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '复制内容' });
  await dialog.getByLabel('副本名称').fill('Retained name');
  await page.route('**/duplicate', (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: { code: 'COPY_NOT_READY', message: '正文尚未就绪，请稍后重试' },
      },
    }),
  );
  await dialog.getByRole('button', { name: '创建副本' }).click();
  await expect(dialog.getByRole('alert')).toContainText('正文尚未就绪');
  await expect(dialog.getByLabel('副本名称')).toHaveValue('Retained name');
  await expect(page.locator('.ProseMirror')).toHaveText('Safe source');
  await page.unroute('**/duplicate');
  await dialog.getByRole('button', { name: '创建副本' }).click();
  await expect(dialog.getByText('副本已创建。')).toBeVisible();
});

test('board copying drains pending scene ACK before capturing', async ({
  page,
}) => {
  let hold = false;
  const acks: string[] = [];
  let deliver = (_message: string) => {};
  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    deliver = (message) => socket.send(message);
    server.onMessage((message) => {
      if (hold && JSON.parse(String(message)).type === 'whiteboard.scene.ack') {
        acks.push(String(message));
        return;
      }
      socket.send(message);
    });
  });
  await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  hold = true;
  await rectangle(page);
  await expect.poll(() => acks.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Save state board 的操作' }).click();
  await page.getByRole('menuitem', { name: '复制内容', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '复制内容' });
  let copies = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/duplicate')) copies++;
  });
  await dialog.getByRole('button', { name: '创建副本' }).click();
  await expect(dialog.getByRole('status')).toBeVisible();
  expect(copies).toBe(0);
  hold = false;
  for (const ack of acks) deliver(ack);
  await expect(dialog.getByText('副本已创建。')).toBeVisible();
  await dialog.getByRole('button', { name: '打开副本' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const copy = page.url().split('/').pop();
  expect(
    (await (await page.request.get(`/api/items/${copy}/whiteboard`)).json())
      .scene.elements,
  ).toHaveLength(1);
});

test('save timeout creates no copy and retains the source for retry', async ({
  page,
}) => {
  let hold = false;
  const acks: string[] = [];
  let deliver = (_message: string) => {};
  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    deliver = (message) => socket.send(message);
    server.onMessage((message) => {
      if (hold && JSON.parse(String(message)).type === 'markdown.update.ack') {
        acks.push(String(message));
        return;
      }
      socket.send(message);
    });
  });
  await openDocument(page, 'Retained');
  hold = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' pending text');
  await expect.poll(() => acks.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Inline writing 的操作' }).click();
  await page.getByRole('menuitem', { name: '复制内容', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '复制内容' });
  let copies = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/duplicate')) copies++;
  });
  await dialog.getByRole('button', { name: '创建副本' }).click();
  await expect(dialog.getByRole('alert')).toContainText('等待保存超时');
  expect(copies).toBe(0);
  await expect(page.locator('.ProseMirror')).toHaveText(
    'Retained pending text',
  );
  await expect(dialog.getByLabel('副本名称')).toHaveValue(
    'Inline writing 副本',
  );
  hold = false;
  for (const ack of acks) deliver(ack);
  await dialog.getByRole('button', { name: '创建副本' }).click();
  await expect(dialog.getByText('副本已创建。')).toBeVisible();
});
