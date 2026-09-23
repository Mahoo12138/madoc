import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

test('reading view uses the same rendered document and preserves outline navigation', async ({ page }, testInfo) => {
  await openDocument(page, '# Reading title\n\nParagraph with **bold** text.\n\n## Details\n\nMore content.');
  await expect(page.getByRole('button', { name: '打印' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Outline' }).click();
  const outline = page.getByRole('navigation', { name: '文档大纲' });
  await expect(outline.getByRole('button', { name: 'Details，2 级标题' })).toBeVisible();

  await page.getByRole('button', { name: '进入阅读视图' }).click();
  await expect(page.getByRole('heading', { name: 'Reading title' })).toBeVisible();
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('.ProseMirror strong')).toHaveText('bold');
  await expect(outline.getByRole('button', { name: 'Details，2 级标题' })).toBeVisible();
  await expect(page.getByRole('button', { name: '切换专注模式' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '打印' })).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect.poll(() => page.locator('.ProseMirror').evaluate((node) => getComputedStyle(node).visibility)).toBe('visible');
  await expect.poll(() => page.locator('aside').evaluate((node) => getComputedStyle(node).visibility)).toBe('hidden');
  await expect.poll(() => page.locator('article').evaluate((node) => getComputedStyle(node).position)).toBe('absolute');
  await page.screenshot({ path: testInfo.outputPath('reading-print.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  await page.getByRole('button', { name: '返回编辑' }).click();
  await expect(page.getByLabel('文档标题')).toHaveValue('Inline writing');
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
});

test('viewer opens in the same read-only presentation', async ({ page, browser }) => {
  await openDocument(page, '# Viewer title\n\nVisible **content**.');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const invite = await (await page.request.post(`/api/workspaces/${workspace}/invites`, {
    headers,
    data: { email: 'reading-viewer@example.test', role: 'viewer' },
  })).json();
  const context = await browser.newContext();
  try {
    await context.request.post(`http://127.0.0.1:3100/api/invites/${invite.token}/accept`, {
      data: { name: 'Viewer', password: 'password123' },
    });
    const viewer = await context.newPage();
    await viewer.goto(page.url());
    await expect(viewer.getByRole('heading', { name: 'Viewer title' })).toBeVisible();
    await expect(viewer.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
    await expect(viewer.locator('.ProseMirror strong')).toHaveText('content');
    await expect(viewer.getByRole('button', { name: '返回编辑' })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
