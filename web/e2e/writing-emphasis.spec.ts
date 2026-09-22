import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

test('sequential typing recognizes emphasis after an unmatched opening star', async ({ page }) => {
  const id = await openDocument(page);
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('**测试文字* 测试文字');
  await page.getByLabel('文档标题').click();
  await expect(editor.locator('em')).toHaveText('测试文字');
  await expect(editor.locator('p')).toHaveText('*测试文字 测试文字');
  await expect(editor.locator('strong')).toHaveCount(0);
  await expect.poll(async () => (await page.request.get(`/api/items/${id}/export.md`)).text()).toContain('测试文字');
  await page.reload();
  await expect(editor.locator('em')).toHaveText('测试文字');
  await expect(editor.locator('p')).toHaveText('*测试文字 测试文字');
});

for (const [raw, italic, bold, visible] of [
  ['**测试文字** 后文', '', '测试文字', '测试文字 后文'],
  ['*测试文字* 后文', '测试文字', '', '测试文字 后文'],
  ['前文 **测试文字* 后文', '测试文字', '', '前文 *测试文字 后文'],
  ['***测试文字* 后文', '测试文字', '', '**测试文字 后文'],
  ['**测试文字*后文', '', '', '**测试文字*后文'],
  [String.raw`\*\*测试文字\* 后文`, '', '', '**测试文字* 后文'],
  ['** 测试文字* 后文', '', '', '** 测试文字* 后文'],
] as const) {
  test(`star input retains intended formatting: ${raw}`, async ({ page }) => {
    await openDocument(page);
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await page.keyboard.type(raw);
    await page.getByLabel('文档标题').click();
    await expect(editor.locator('p')).toHaveText(visible);
    if (italic) await expect(editor.locator('em')).toHaveText(italic);
    else await expect(editor.locator('em')).toHaveCount(0);
    if (bold) await expect(editor.locator('strong')).toHaveText(bold);
    else await expect(editor.locator('strong')).toHaveCount(0);
    // Input must agree with the canonical Markdown import parser.
    await openDocument(page, raw);
    await expect(editor.locator('p')).toHaveText(visible);
    if (italic) await expect(editor.locator('em')).toHaveText(italic);
    else await expect(editor.locator('em')).toHaveCount(0);
  });
}

test('asymmetric emphasis syncs and survives export/import', async ({ page }) => {
  const id = await openDocument(page);
  const peer = await page.context().newPage();
  await peer.goto(page.url());
  await expect(peer.locator('.ProseMirror')).toBeVisible();
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('**测试文字* 测试文字');
  await page.getByLabel('文档标题').click();
  await expect(peer.locator('.ProseMirror em')).toHaveText('测试文字');
  await expect.poll(async () => (await page.request.get(`/api/items/${id}/export.md`)).text()).toMatch(/\*测试文字\*/);
  const exported = await (await page.request.get(`/api/items/${id}/export.md`)).text();
  await peer.close();
  await openDocument(page, exported);
  await expect(page.locator('.ProseMirror em')).toHaveText('测试文字');
  await expect(page.locator('.ProseMirror p')).toHaveText('*测试文字 测试文字');
});

test('asymmetric emphasis participates in collaborative undo and redo', async ({ page }) => {
  await openDocument(page);
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('**测试文字* 后文');
  await expect(editor.locator('em')).toHaveText('测试文字');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.locator('em')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor.locator('em')).toHaveText('测试文字');
  await expect(editor.locator('p')).toHaveText('*测试文字 后文');
});
