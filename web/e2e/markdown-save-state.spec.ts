import { expect, test } from '@playwright/test';
import { MarkdownSaveState } from '../src/features/markdown/markdown-save-state';

test('partial, duplicate and unknown ACKs cannot confirm other edits', () => {
  const state = new MarkdownSaveState();
  state.connectionChanged('online');
  state.initialized();
  state.add('first');
  state.add('second');
  expect(state.status).toBe('Saving');
  expect(state.acknowledge('second')).toBe(true);
  expect(state.status).toBe('Saving');
  expect(state.acknowledge('second')).toBe(false);
  expect(state.acknowledge('unknown')).toBe(false);
  expect(state.hasPendingUpdates).toBe(true);
  expect(state.status).toBe('Saving');
  state.acknowledge('first');
  expect(state.status).toBe('Saved');
  expect(state.hasPendingUpdates).toBe(false);
});

test('rejoining retains pending edits and does not claim they are saved', () => {
  const state = new MarkdownSaveState();
  expect(state.status).toBe('Reconnecting');
  state.connectionChanged('online');
  expect(state.status).toBe('Reconnecting');
  state.initialized();
  state.add('offline-edit');
  state.connectionChanged('offline');
  expect(state.status).toBe('Offline');
  state.connectionChanged('online');
  expect(state.status).toBe('Reconnecting');
  state.initialized();
  expect(state.status).toBe('Saving');
  state.acknowledge('offline-edit');
  expect(state.status).toBe('Saved');
  state.connectionChanged('offline');
  expect(state.status).toBe('Offline');
});

test('editor stays saving after partial, duplicate and cache acknowledgements', async ({ page }) => {
  const { openDocument } = await import('./helpers/writing');
  const held: string[] = [];
  let deliver: (message: string) => void = () => {};
  let hold = false;

  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    deliver = (message) => socket.send(message);
    server.onMessage((message) => {
      const envelope = JSON.parse(String(message));
      if (hold && envelope.type === 'markdown.update.ack') {
        held.push(String(message));
        return;
      }

      socket.send(message);
    });
  });
  const id = await openDocument(page, 'Initial content');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  hold = true;
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' first');
  await expect.poll(() => held.length).toBeGreaterThanOrEqual(1);
  await page.keyboard.insertText(' second');
  await expect.poll(() => held.length).toBeGreaterThanOrEqual(2);
  deliver(held[0]);
  deliver(held[0]);
  await expect(page.getByText('已保存', { exact: true })).toHaveCount(0);
  deliver(JSON.stringify({ type: 'markdown.cache.ack', itemId: id, payload: { seenSeq: 0, generation: 1 } }));
  await expect(page.getByText('已保存', { exact: true })).toHaveCount(0);
  hold = false;
  for (const message of held.slice(1)) deliver(message);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText('first second');
});

test('local saved status requires every pending edit to finish its storage transaction', () => {
  const state = new MarkdownSaveState();
  state.connectionChanged('online');
  state.initialized();
  state.connectionChanged('offline');
  state.add('first');
  state.add('second');
  state.persisted('first');
  expect(state.status).toBe('Offline');
  expect(state.hasUnpersistedUpdates).toBe(true);
  state.persisted('second');
  expect(state.status).toBe('Local');
  expect(state.hasUnpersistedUpdates).toBe(false);
  state.fail();
  expect(state.status).toBe('Error');
  state.resume();
  expect(state.status).toBe('Local');
  state.connectionChanged('online');
  state.initialized();
  expect(state.status).toBe('Saving');
  state.acknowledge('first');
  expect(state.status).toBe('Saving');
  state.acknowledge('second');
  expect(state.status).toBe('Saved');
});
