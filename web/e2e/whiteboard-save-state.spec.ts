import { expect, test, type Page } from '@playwright/test';
import { openBoard, rectangle } from './helpers/whiteboard';

test('idle board and transient tool selection do not continually persist scenes', async ({ page }) => {
  const id = await openBoard(page);
  const state = async () => (await (await page.request.get(`/api/items/${id}/whiteboard`)).json());
  await page.waitForTimeout(800);
  const baseline = await state();
  await page.waitForTimeout(1500);
  expect((await state()).revision).toBe(baseline.revision);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.locator('label').filter({ has: page.getByRole('radio', { name: 'Rectangle', exact: true }) }).click();
  await page.mouse.move(700, 350);
  await page.keyboard.press('Escape');
  // Cross several debounce windows; any accidental onChange/write loop will
  // increment the server revision even though no content changed.
  await page.waitForTimeout(1500);
  expect((await state()).revision).toBe(baseline.revision);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await rectangle(page);
  await expect.poll(async () => (await state()).scene.elements.length).toBe(1);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const saved = await state();
  await page.waitForTimeout(1000);
  expect((await state()).revision).toBe(saved.revision);
  await page.reload();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect((await state()).scene.elements).toEqual(saved.scene.elements);
});

test('partial ACK and remote scenes cannot confirm pending local changes or create an echo loop', async ({ page }) => {
  let hold = false;
  const held: string[] = [];
  let release = () => {};
  let releaseOne = () => {};
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    releaseOne = () => { const message = held.shift(); if (message) socket.send(message); };
    release = () => { hold = false; for (const message of held.splice(0)) socket.send(message); };
    server.onMessage(message => {
      if (hold && JSON.parse(String(message)).type === 'whiteboard.scene.ack') { held.push(String(message)); return; }
      socket.send(message);
    });
  });
  const id = await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const peer = await page.context().newPage();
  try {
    await peer.goto(page.url());
    await expect(peer.getByText('Saved', { exact: true })).toBeVisible();
    hold = true;
    await rectangle(page);
    await expect.poll(() => held.length).toBeGreaterThan(0);
    await expect(page.getByText('Saving', { exact: true })).toBeVisible();
    await rectangle(page, 60);
    await expect.poll(() => held.length).toBeGreaterThanOrEqual(2);
    releaseOne();
    await page.waitForTimeout(800);
    await expect(page.getByText('Saving', { exact: true })).toBeVisible();
    release();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(peer.getByText('Saved', { exact: true })).toBeVisible();
    const state = async () => (await (await page.request.get(`/api/items/${id}/whiteboard`)).json());
    const saved = await state();
    expect(saved.scene.elements).toHaveLength(2);
    await peer.mouse.move(800, 500);
    await page.waitForTimeout(1200);
    expect((await state()).revision).toBe(saved.revision);
    await peer.reload();
    await expect(peer.getByText('Saved', { exact: true })).toBeVisible();
    const downloadReady = peer.waitForEvent('download');
    await peer.getByRole('button', { name: '导出', exact: true }).click();
    await peer.getByRole('menuitem', { name: 'Excalidraw JSON' }).click();
    const { readFile } = await import('node:fs/promises');
    const exported = JSON.parse(await readFile((await (await downloadReady).path())!, 'utf8'));
    expect(exported.elements).toEqual(saved.scene.elements);
  } finally { await peer.close(); }
});

test('switching boards keeps editor contents isolated', async ({ page }) => {
  const first = await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await rectangle(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(`/api/items/${first}/whiteboard`)).json()).scene.elements.length).toBe(1);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const response = await page.request.post(`/api/workspaces/${workspaceId}/items`, {
    headers: { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { type: 'whiteboard', title: 'Other empty board' },
  });
  expect(response.ok()).toBeTruthy();
  const second = await response.json();
  await page.reload();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByText('Other empty board', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(second.id));
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Excalidraw JSON' }).click();
  const { readFile } = await import('node:fs/promises');
  expect(JSON.parse(await readFile((await (await ready).path())!, 'utf8')).elements).toEqual([]);
  await page.getByText('Save state board', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(first));
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/items/${first}/whiteboard`)).json()).scene.elements).toHaveLength(1);
  expect((await (await page.request.get(`/api/items/${second.id}/whiteboard`)).json()).scene.elements).toEqual([]);
});

for (const editOffline of [false, true]) {
  test(`lost ACK is retried after reconnect with offline editing=${editOffline}`, async ({ page }) => {
    let holdACK = false;
    let offline = false;
    let disconnect = () => {};
    const frames: string[] = [];
    const ids: string[] = [];
    await page.routeWebSocket('**/ws', socket => {
      if (offline) { socket.close({ code: 1000 }); return; }
      const server = socket.connectToServer();
      disconnect = () => { server.close({ code: 1000 }); socket.close({ code: 1000 }); };
      socket.onMessage(message => { const frame = JSON.parse(String(message)); frames.push(frame.type); if (frame.type === 'whiteboard.scene.update') ids.push(frame.requestId); server.send(message); });
      server.onMessage(message => {
        if (holdACK && JSON.parse(String(message)).type === 'whiteboard.scene.ack') return;
        socket.send(message);
      });
    });
    const id = await openBoard(page);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    holdACK = true;
    await rectangle(page);
    await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/whiteboard`)).json()).scene.elements.length).toBe(1);
    await expect(page.getByText('Saving', { exact: true })).toBeVisible();
    const pendingId = ids.at(-1);
    offline = true;
    disconnect();
    await expect(page.getByText('已保存到此设备，待同步', { exact: true })).toBeVisible();
    if (editOffline) await rectangle(page, 60);
    await page.waitForTimeout(500);
    frames.length = 0;
    holdACK = false;
    offline = false;
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const durableFrames = frames.filter(type => type === 'whiteboard.join' || type === 'whiteboard.scene.update');
    expect(durableFrames[0]).toBe('whiteboard.join');
    if (!editOffline) expect(ids.at(-1)).toBe(pendingId);
    await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/whiteboard`)).json()).scene.elements.length).toBe(editOffline ? 2 : 1);
    await page.reload();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect((await (await page.request.get(`/api/items/${id}/whiteboard`)).json()).scene.elements).toHaveLength(editOffline ? 2 : 1);
  });
}

test('server rejection stops writes and preserves an explicit local board copy', async ({ page }, testInfo) => {
  let rejectWrites = false;
  let attempted = 0;
  await page.routeWebSocket('**/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      const frame = JSON.parse(String(message));
      if (rejectWrites && frame.type === 'whiteboard.scene.update') {
        attempted += 1;
        socket.send(JSON.stringify({ type: 'error', requestId: frame.requestId, payload: { code: 'FORBIDDEN', message: 'operation is not allowed' } }));
        return;
      }
      server.send(message);
    });
  });
  await openBoard(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  rejectWrites = true;
  await rectangle(page);
  await expect(page.getByRole('alert')).toContainText('白板保存已停止');
  await expect(page.getByRole('radio', { name: 'Rectangle', exact: true })).toHaveCount(0);
  const before = attempted;
  await page.waitForTimeout(3200);
  expect(attempted).toBe(before);
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载本地白板副本', exact: true }).click();
  const download = await ready;
  expect(download.suggestedFilename()).toContain('本地副本');
  const { readFile } = await import('node:fs/promises');
  expect(JSON.parse(await readFile((await download.path())!, 'utf8')).elements).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '下载本地白板副本', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('whiteboard-save-rejected-mobile.png') });
});
