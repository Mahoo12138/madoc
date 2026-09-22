import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function install(page: Page) {
  const source = await readFile(new URL('../src/features/whiteboard/whiteboard-outbox.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  await page.route('**/outbox-test.js', route => route.fulfill({ contentType: 'text/javascript', body: outputText }));
  await page.goto('/');
}

test('real IndexedDB survives reload, isolates tabs/accounts and ignores stale ACK cleanup', async ({ page }) => {
  await install(page);
  await page.evaluate(async () => {
    const { WhiteboardOutbox } = await import(/* @vite-ignore */ '/outbox-test.js');
    const scene = { elements: [{ id: 'a', version: 1 }], appState: {}, files: { image: { dataURL: 'data:image/png;base64,AQ==' } } };
    const first = new WhiteboardOutbox(location.origin, 'user', 'space', 'board', 'tab1', 'Board');
    const second = new WhiteboardOutbox(location.origin, 'user', 'space', 'board', 'tab2', 'Board');
    const old = await first.save('old', 3, scene);
    await second.save('other-tab', 3, scene);
    const saving = first.save('new', 4, scene);
    scene.elements[0].version = 99;
    await saving;
    await first.confirm([old]);
  });
  await page.reload();
  const result = await page.evaluate(async () => {
    const { WhiteboardOutbox, listWhiteboardDrafts } = await import(/* @vite-ignore */ '/outbox-test.js');
    const box = new WhiteboardOutbox(location.origin, 'user', 'space', 'board', 'tab3', 'Board');
    const records = await box.load();
    const other = new WhiteboardOutbox(location.origin, 'other-user', 'space', 'board', 'tab1', 'Board');
    await other.confirm(records);
    const preserved = await box.load();
    await box.confirm(records.filter((record: { id: string }) => record.id === 'new'));
    return { records, preserved: preserved.length, remaining: (await box.load()).map((record: { id: string }) => record.id), other: await other.load(), otherAccount: await listWhiteboardDrafts(location.origin, 'other-user'), account: (await listWhiteboardDrafts(location.origin, 'user')).length };
  });
  expect(result.records.map((record: { id: string }) => record.id).sort()).toEqual(['new', 'other-tab']);
  expect(result.records.every((record: { scene: { elements: { version: number }[] } }) => record.scene.elements[0].version === 1)).toBe(true);
  expect(result.preserved).toBe(2);
  expect(result.remaining).toEqual(['other-tab']);
  expect(result.other).toEqual([]);
  expect(result.otherAccount).toEqual([]);
  expect(result.account).toBe(1);
});

test('failed writes and aborted cleanup retain the previous recoverable scene', async ({ page }) => {
  await install(page);
  const result = await page.evaluate(async () => {
    const { WhiteboardOutbox } = await import(/* @vite-ignore */ '/outbox-test.js');
    const box = new WhiteboardOutbox(location.origin, 'user', 'space', 'board', 'tab', 'Board');
    const scene = { elements: [], appState: {}, files: {} };
    const old = await box.save('old', 0, scene);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const result = put.apply(this, args);
      this.transaction.abort();
      return result;
    };
    let failed = false;
    try { await box.save('failed', 0, scene); } catch { failed = true; }
    IDBObjectStore.prototype.put = put;
    const afterWrite = await box.load();
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...args) {
      const result = remove.apply(this, args);
      this.transaction.abort();
      return result;
    };
    let cleanupFailed = false;
    try { await box.confirm([old]); } catch { cleanupFailed = true; }
    IDBObjectStore.prototype.delete = remove;
    return { failed, cleanupFailed, afterWrite, afterCleanup: await box.load() };
  });
  expect(result.failed).toBe(true);
  expect(result.cleanupFailed).toBe(true);
  expect(result.afterWrite.map((record: { id: string }) => record.id)).toEqual(['old']);
  expect(result.afterCleanup.map((record: { id: string }) => record.id)).toEqual(['old']);
});
