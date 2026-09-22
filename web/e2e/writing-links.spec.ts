import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

for (const [label, markdown] of [
  ['普通链接', '[普通链接](https://example.com)'],
  ['带标题', '[带标题](https://example.com "说明")'],
  ['加粗链接', '[**加粗链接**](https://example.com)'],
  ['包含 code', '[包含 `code`](https://example.com)'],
  ['查询参数', '[查询参数](https://example.com?q=one&sort=two)'],
  ['相对路径', '[相对路径](../guide.md)'],
]) {
  test(`link source edits in place: ${label}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openDocument(page, `前文 ${markdown} 后文`);
    await page.locator('.ProseMirror a').last().click();
    const source = page.getByLabel('编辑链接源码');
    await expect(source).toBeFocused();
    const expected = label === '加粗链接' ? '**[加粗链接](https://example.com)**' : markdown.replace('&', '\\&');
    await expect(source).toHaveValue(expected);
    await expect(page.locator('.milkdown-link-preview')).toHaveCount(0);
    await source.fill('[**修改文字**](../changed.md?q=1&x=2 "新标题")');
    await page.getByLabel('文档标题').click();
    const link = page.locator('.ProseMirror a');
    await expect(link).toHaveAttribute('href', '../changed.md?q=1&x=2');
    await expect(link).toHaveAttribute('title', '新标题');
    await expect(page.locator('.ProseMirror strong')).toHaveText('修改文字');
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.reload();
    await expect(link).toHaveAttribute('href', '../changed.md?q=1&x=2');
    await expect(link).toHaveAttribute('title', '新标题');
    expect(errors).toEqual([]);
  });
}

test('link source supports keyboard entry, delimiter navigation and undo', async ({ page }) => {
  await openDocument(page, '前文 [链接](https://example.com) 后文');
  const link = page.locator('.ProseMirror a');
  await link.click();
  const source = page.getByLabel('编辑链接源码');
  await source.evaluate((element: HTMLInputElement) => element.setSelectionRange(0, 0));
  await source.press('ArrowLeft');
  await expect(source).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(source).toBeFocused();
  await source.fill('[链接](../edited.md)');
  await source.press('ControlOrMeta+z');
  await expect(source).toHaveValue('[链接](https://example.com)');
  await source.fill('普通文字');
  await source.press('Escape');
  await expect(link).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toContainText('前文 普通文字 后文');
});


test('link editing renders on desktop and narrow screens without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDocument(page, '普通链接：[示例](https://example.com "说明")\n\n[**加粗的链接文字**](../guide.md)');
  await expect(page).toHaveTitle(/madoc/);
  await expect(page).toHaveURL(/\/workspace\//);
  await page.locator('.ProseMirror a').first().click();
  await expect(page.getByLabel('编辑链接源码')).toBeFocused();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/madoc-link-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('编辑链接源码')).toBeVisible();
  await page.screenshot({ path: '/tmp/madoc-link-mobile.png' });
  expect(errors).toEqual([]);
});


test('link edits synchronize to a peer before leaving source', async ({ page }) => {
  const id = await openDocument(page, '[链接](https://example.com)');
  const peer = await page.context().newPage();
  await peer.goto(page.url());
  await expect(peer.locator('.ProseMirror a')).toBeVisible();
  await page.locator('.ProseMirror a').click();
  const source = page.getByLabel('编辑链接源码');
  await source.fill('[已修改](../live.md "实时标题")');
  await expect(peer.locator('.ProseMirror a')).toHaveAttribute('href', '../live.md');
  await expect(peer.locator('.ProseMirror a')).toHaveAttribute('title', '实时标题');
  await expect(source).toBeFocused();
  await expect.poll(async () => (await page.request.get(`/api/items/${id}/export.md`)).text()).toContain('../live.md');
  await peer.close();
});
