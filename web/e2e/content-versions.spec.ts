import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { openBoard, rectangle } from './helpers/whiteboard';

async function saveManualVersion(page: Page, history: Locator, label: string) {
  await history.getByRole('button', { name: '保存手动版本', exact: true }).click();
  const form = page.getByRole('dialog', { name: '保存手动版本', exact: true });
  await form.getByLabel('版本名称').fill(label);
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(history.getByText('手动版本已保存。')).toBeVisible();
}

async function restoreCopy(page: Page, history: Locator, title: string) {
  await history.getByRole('button', { name: '恢复为新副本', exact: true }).click();
  const form = page.getByRole('dialog', { name: '恢复为新副本', exact: true });
  await form.getByLabel('恢复副本名称').fill(title);
  await form.getByRole('button', { name: '恢复副本', exact: true }).click();
}

test('Markdown history creates named checkpoints, previews old text, and restores a copy', async ({ page }) => {
  const sourceId = await openDocument(page, 'Before edit');
  await page.getByRole('button', { name: '版本历史' }).click();
  let dialog = page.getByRole('dialog', { name: '版本历史' });
  await expect(dialog.getByText(/工作区历史占用/)).toBeVisible();
  await saveManualVersion(page, dialog, 'Before release');
  await page.keyboard.press('Escape');

  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText('After edit');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const sourceBeforeRestore = await (await page.request.get(`/api/items/${sourceId}/markdown`)).json();
  const workspaceId = new URL(page.url()).pathname.split('/')[2]!;
  const peer = await page.context().newPage();
  await peer.goto(`/workspace/${workspaceId}/${sourceId}`);
  await expect(peer.locator('aside').getByRole('button', { name: 'Inline writing', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '版本历史' }).click();
  dialog = page.getByRole('dialog', { name: '版本历史' });
  const checkpoint = dialog.getByRole('button').filter({ hasText: 'Before release' });
  await checkpoint.click();
  await expect(dialog.getByText('Before edit', { exact: true })).toBeVisible();
  await restoreCopy(page, dialog, 'Recovered draft');

  await expect(page.getByRole('dialog', { name: '版本历史' })).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toHaveText('Before edit');
  await expect(peer.locator('aside').getByRole('button', { name: 'Recovered draft', exact: true })).toBeVisible();
  await peer.close();
  const copyId = new URL(page.url()).pathname.split('/').pop();
  expect(copyId).not.toBe(sourceId);
  const current = await (await page.request.get(`/api/items/${sourceId}/markdown`)).json();
  expect(current.markdown).toBe(sourceBeforeRestore.markdown);
});

test('whiteboard history renders a preview and restores the selected scene', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: '版本历史' }).click();
  let dialog = page.getByRole('dialog', { name: '版本历史' });
  await saveManualVersion(page, dialog, 'Empty board');
  await page.keyboard.press('Escape');

  await rectangle(page);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '版本历史' }).click();
  dialog = page.getByRole('dialog', { name: '版本历史' });
  await dialog.getByRole('button').filter({ hasText: 'Empty board' }).click();
  await expect(dialog.getByRole('img', { name: '白板版本预览' })).toBeVisible();
  await restoreCopy(page, dialog, 'Recovered board');
  await expect(page.locator('.excalidraw')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '版本历史' })).toHaveCount(0);
});
