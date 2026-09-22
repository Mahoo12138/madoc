import { expect, type Page } from '@playwright/test';
import { openDocument } from './writing';

export async function openBoard(page: Page) {
  await openDocument(page, 'Board fixture');
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const response = await page.request.post(`/api/workspaces/${workspaceId}/items`, {
    headers: { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { type: 'whiteboard', title: 'Save state board' },
  });
  expect(response.ok()).toBeTruthy();
  const board = await response.json();
  await page.goto(`/workspace/${workspaceId}/${board.id}`);
  await expect(page.locator('.excalidraw')).toBeVisible();
  return board.id as string;
}

export async function rectangle(page: Page, offset = 0) {
  await page.locator('label').filter({ has: page.getByRole('radio', { name: 'Rectangle', exact: true }) }).click();
  await page.mouse.move(650 + offset, 300);
  await page.mouse.down();
  await page.mouse.move(850 + offset, 450, { steps: 10 });
  await page.mouse.up();
}
