import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openDocument } from './helpers/writing';

for (const width of [1280, 390]) {
test(`reset during disconnect preserves local rescue at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  let disconnect = () => {};
  let blockUpdates = false;
  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    disconnect = () => {
      server.close({ code: 1000 });
      socket.close({ code: 1000 });
    };
    socket.onMessage((message) => {
      const envelope = JSON.parse(String(message));
      if (blockUpdates && envelope.type === 'markdown.update') return;
      server.send(message);
    });
  });
  const id = await openDocument(page, 'Original text');
  blockUpdates = true;
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' local rescue');
  await expect(page.getByText('保存中', { exact: true })).toBeVisible();
  disconnect();
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  await expect.poll(async () => (await page.request.put(`/api/items/${id}/markdown`, {
    headers: { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { snapshot: '', markdown: 'Replacement content' },
  })).status()).toBe(204);
  await expect(page.getByRole('alert')).toContainText('文档内容已被替换');
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('.ProseMirror')).toContainText('local rescue');
  await expect(page.locator('.ProseMirror')).not.toContainText('Replacement content');
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载本地副本' }).click();
  const download = await downloadReady;
  expect(await readFile((await download.path())!, 'utf8')).toContain('local rescue');
  expect(await (await page.request.get(`/api/items/${id}/export.md`)).text()).toBe('Replacement content');
  await page.screenshot({ path: testInfo.outputPath('generation-conflict.png') });
});

}

test('server rejects missing and stale generation on all durable Markdown messages', async ({ page }) => {
  const id = await openDocument(page, 'Current document');
  const errors = await page.evaluate(async (itemId) => {
    const socket = new WebSocket(`ws://${location.host}/ws`);
    const errors: string[] = [];
    const operations = [
      { type: 'markdown.update', payload: { clientUpdateId: 'stale', update: 'AQ==' } },
      { type: 'markdown.cache.update', payload: { markdown: 'stale', seenSeq: 0 } },
      { type: 'markdown.snapshot.commit', payload: { snapshot: 'AQ==', markdown: 'stale', baseSeq: 0 } },
    ];
    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('No rejection received')); }, 5000);
      socket.onopen = () => {
        for (const operation of operations) {
          socket.send(JSON.stringify({ ...operation, itemId }));
          socket.send(JSON.stringify({ ...operation, itemId, payload: { ...operation.payload, generation: 0 } }));
        }
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type !== 'error') return;
        errors.push(message.payload.code);
        if (errors.length === 6) { clearTimeout(timer); socket.close(); resolve(errors); }
      };
    });
  }, id);
  expect(errors).toEqual([
    'GENERATION_REQUIRED', 'GENERATION_CHANGED',
    'GENERATION_REQUIRED', 'GENERATION_CHANGED',
    'GENERATION_REQUIRED', 'GENERATION_CHANGED',
  ]);
  expect(await (await page.request.get(`/api/items/${id}/export.md`)).text()).not.toContain('stale');
});
