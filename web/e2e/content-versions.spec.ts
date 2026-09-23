import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { openBoard, rectangle } from './helpers/whiteboard';

test('Markdown history creates named checkpoints, previews old text, and restores a copy', async ({ page }) => {
  const sourceId = await openDocument(page, 'Before edit');
  await page.getByRole('button', { name: '版本历史' }).click();
  let dialog = page.getByRole('dialog', { name: '版本历史' });
  await dialog.getByLabel('版本名称').fill('Before release');
  await dialog.getByRole('button', { name: '保存手动版本' }).click();
  await expect(dialog.getByText('手动版本已保存。')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText('After edit');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const sourceBeforeRestore = await (await page.request.get(`/api/items/${sourceId}/markdown`)).json();

  await page.getByRole('button', { name: '版本历史' }).click();
  dialog = page.getByRole('dialog', { name: '版本历史' });
  const checkpoint = dialog.getByRole('button').filter({ hasText: 'Before release' });
  await checkpoint.click();
  await expect(dialog.getByText('Before edit', { exact: true })).toBeVisible();
  await dialog.getByLabel('恢复副本名称').fill('Recovered draft');
  await dialog.getByRole('button', { name: '恢复为新副本' }).click();

  await expect(page.getByRole('dialog', { name: '版本历史' })).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toHaveText('Before edit');
  const copyId = new URL(page.url()).pathname.split('/').pop();
  expect(copyId).not.toBe(sourceId);
  const current = await (await page.request.get(`/api/items/${sourceId}/markdown`)).json();
  expect(current.markdown).toBe(sourceBeforeRestore.markdown);
});

test('whiteboard history renders a preview and restores the selected scene', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: '版本历史' }).click();
  let dialog = page.getByRole('dialog', { name: '版本历史' });
  await dialog.getByLabel('版本名称').fill('Empty board');
  await dialog.getByRole('button', { name: '保存手动版本' }).click();
  await expect(dialog.getByText('手动版本已保存。')).toBeVisible();
  await page.keyboard.press('Escape');

  await rectangle(page);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '版本历史' }).click();
  dialog = page.getByRole('dialog', { name: '版本历史' });
  await dialog.getByRole('button').filter({ hasText: 'Empty board' }).click();
  await expect(dialog.getByRole('img', { name: '白板版本预览' })).toBeVisible();
  await dialog.getByLabel('恢复副本名称').fill('Recovered board');
  await dialog.getByRole('button', { name: '恢复为新副本' }).click();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '版本历史' })).toHaveCount(0);
});
