import { expect, test } from '@playwright/test';
import { openDocument } from '../e2e/helpers/writing';
import { RestartServer } from './server';

for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
  for (const lost of ['send', 'ack'] as const) {
    test(`${signal}: confirmed content and ${lost === 'send' ? 'unsent edits' : 'lost ACKs'} survive a real process restart`, async ({ page }) => {
      const server = await RestartServer.create();
      try {
        await server.start();
        let block = false;
        const sent: string[] = [];
        const acked = new Map<string, number>();
        const replayed = new Map<string, number>();
        let restarted = false;
        await page.routeWebSocket('**/ws', socket => {
          const remote = socket.connectToServer();
          socket.onMessage(message => {
            const frame = JSON.parse(String(message));
            if (block && frame.type === 'markdown.update') {
              sent.push(frame.payload.clientUpdateId);
              if (lost === 'send') return;
            }
            remote.send(message);
          });
          remote.onMessage(message => {
            const frame = JSON.parse(String(message));
            if (frame.type === 'markdown.update.ack') {
              if (restarted) replayed.set(frame.payload.clientUpdateId, frame.payload.seq);
              if (block) {
                acked.set(frame.payload.clientUpdateId, frame.payload.seq);
                if (lost === 'ack') return;
              }
            }
            socket.send(message);
          });
        });
        const itemId = await openDocument(page, 'Confirmed baseline');
        block = true;
        await page.locator('.ProseMirror').click();
        await page.keyboard.press('End');
        await page.keyboard.insertText(' pending before restart');
        await expect.poll(() => sent.length).toBeGreaterThan(0);
        if (lost === 'ack') await expect.poll(() => acked.size).toBeGreaterThan(0);
        await expect(page.getByText('保存中', { exact: true })).toBeVisible();
        const ids = [...new Set(sent)];
        await server.stop(signal);
        await expect(page.getByText('已保存到此设备，待同步', { exact: true })).toBeVisible();
        // The editor remains usable while the actual server is stopped.
        await page.locator('.ProseMirror').click();
        await page.keyboard.press('End');
        await page.keyboard.insertText(' edited while stopped');
        await expect(page.getByText('已保存到此设备，待同步', { exact: true })).toBeVisible();
        block = false;
        restarted = true;
        await server.start();
        await expect(page.getByText('已保存', { exact: true })).toBeVisible();
        for (const id of ids) {
          expect(replayed.has(id)).toBeTruthy();
          if (lost === 'ack') expect(replayed.get(id)).toBe(acked.get(id));
        }
        const expected = 'Confirmed baseline pending before restart edited while stopped';
        await expect.poll(async () => (await (await page.request.get(`/api/items/${itemId}/export.md`)).text()).trim()).toBe(expected);
        expect((await page.request.get('/api/auth/session')).ok()).toBeTruthy();
        await page.reload();
        await expect(page.locator('.ProseMirror')).toHaveText(expected);
        await expect(page.getByText('已保存', { exact: true })).toBeVisible();
      } finally {
        await page.close();
        await server.dispose();
      }
    });
  }
}
