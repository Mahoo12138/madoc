import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

const references = '完整[完整引用][example-site]。\n\n折叠[折叠引用][]。\n\n快捷[快捷引用]。\n\n[example-site]: https://example.com "示例网站"\n\n[折叠引用]: https://example.com/docs\n\n[快捷引用]: https://example.com/about';

test('hard breaks show arrows without adding them to Markdown; quotes have compact nesting', async ({ page }) => {
  const id = await openDocument(page, '第一行  \n第二行\n\n> 引用\n>\n> > 内层引用');
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('.madoc-hardbreak')).toHaveText('↵');
  await expect(editor.locator('blockquote')).toHaveCount(2);
  for (const quote of await editor.locator('blockquote').all()) await expect(quote).toHaveCSS('padding-left', '16px');
  await page.screenshot({ path: '/tmp/madoc-breaks-quotes.png' });
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('新行');
  await expect(editor.locator('.madoc-hardbreak')).toHaveCount(2);
  await expect.poll(async () => (await page.request.get(`/api/items/${id}/export.md`)).text()).toContain('新行');
  expect(await (await page.request.get(`/api/items/${id}/export.md`)).text()).not.toContain('↵');
});

test('full, collapsed and shortcut references retain editable definitions and round-trip', async ({ page }) => {
  const id = await openDocument(page, references);
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('a')).toHaveCount(3);
  await expect(editor.locator('[data-reference-definition]')).toHaveCount(3);
  await expect(editor.locator('a').nth(0)).toHaveAttribute('href', 'https://example.com');
  await expect(editor.locator('a').nth(1)).toHaveAttribute('href', 'https://example.com/docs');
  await expect(editor.locator('a').nth(2)).toHaveAttribute('href', 'https://example.com/about');
  await page.screenshot({ path: '/tmp/madoc-references.png' });
  await editor.locator('a').first().click();
  const source = page.getByLabel('编辑链接源码');
  await expect(source).toHaveValue('[完整引用][example-site]');
  await source.fill('[改过文字][example-site]');
  await page.getByLabel('文档标题').click();
  await expect(editor.locator('a').first()).toHaveAttribute('href', 'https://example.com');
  const definition = editor.locator('[data-reference-definition]').first();
  await definition.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    element.closest<HTMLElement>('.ProseMirror')!.focus();
  });
  await page.keyboard.insertText('[example-site]: https://example.com/updated "新标题"');
  await expect(editor.locator('a').first()).toHaveAttribute('href', 'https://example.com/updated');
  await expect(editor.locator('a').first()).toHaveAttribute('title', '新标题');
  await expect.poll(async () => (await page.request.get(`/api/items/${id}/export.md`)).text()).toContain('[example-site]: https://example.com/updated');
  const markdown = await (await page.request.get(`/api/items/${id}/export.md`)).text();
  expect(markdown).toContain('[改过文字][example-site]');
  expect(markdown).toContain('[折叠引用][]');
  expect(markdown).toContain('[快捷引用]');
  await page.reload();
  await expect(editor.locator('a').first()).toHaveAttribute('href', 'https://example.com/updated');
  await expect(editor.locator('[data-reference-definition]')).toHaveCount(3);
});

const imageSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160"><rect width="640" height="160" fill="#ddd"/><text x="100" y="85" font-size="28">Markdown image</text></svg>';

test('image source appears above preview, edits alt/title/src, and failed images expose source', async ({ page }) => {
  await page.route('**/test-image.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: imageSvg }));
  const id = await openDocument(page, '![替代文本](/test-image.svg "图片标题")\n\n![加载失败](./missing-test-image.png)');
  const images = page.locator('.madoc-image-source-view');
  await expect(images).toHaveCount(2);
  const loaded = images.first();
  const failed = images.last();
  await expect(loaded.locator('img')).toBeVisible();
  await expect(loaded.locator('img')).toHaveAttribute('alt', '替代文本');
  await expect(failed.getByLabel('编辑图片 Markdown 源码')).toBeVisible();
  await expect(failed.getByLabel('编辑图片 Markdown 源码')).toHaveValue('![加载失败](./missing-test-image.png)');
  await expect(failed.locator('img')).toBeHidden();
  await expect(failed.getByRole('img', { name: '无法渲染图片' })).toBeVisible();
  await expect(page.getByText('请输入完整的图片 Markdown', { exact: false })).toHaveCount(0);
  await loaded.locator('.image-wrapper').click();
  const source = loaded.getByLabel('编辑图片 Markdown 源码');
  await expect(source).toBeFocused();
  await expect(source).toHaveValue('![替代文本](/test-image.svg "图片标题")');
  await page.screenshot({ path: '/tmp/madoc-image-source-desktop.png' });
  await expect(loaded.locator('.operation')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(loaded.locator('img')).toHaveCSS('object-fit', 'contain');
  await page.screenshot({ path: '/tmp/madoc-image-source-mobile.png' });
  const sourceBox = (await source.boundingBox())!;
  const imageBox = (await loaded.locator('img').boundingBox())!;
  expect(sourceBox.y + sourceBox.height).toBeLessThanOrEqual(imageBox.y);
  expect(sourceBox.x + sourceBox.width).toBeLessThanOrEqual(390);
  await source.fill('![新的说明](/test-image.svg "新的标题")');
  await expect.poll(async () => (await page.request.get(`/api/items/${id}/export.md`)).text()).toContain('![新的说明](/test-image.svg "新的标题")');
  await failed.getByLabel('编辑图片 Markdown 源码').fill('![修好](/test-image.svg)');
  await expect(failed).not.toHaveClass(/is-failed/);
  await expect(failed.locator('img')).toBeVisible();
  await expect(failed.getByRole('img', { name: '无法渲染图片' })).toBeHidden();
  await page.getByLabel('文档标题').click();
  await page.screenshot({ path: '/tmp/madoc-images-edited.png' });
  await page.reload();
  await expect(images).toHaveCount(2);
  await images.first().locator('.image-wrapper').click();
  await expect(images.first().getByLabel('编辑图片 Markdown 源码')).toHaveValue('![新的说明](/test-image.svg "新的标题")');
});

test('inline image edits synchronize while focused; invalid syntax remains editable and undo works', async ({ page }) => {
  await page.route('**/test-image.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: imageSvg }));
  await openDocument(page, '前文 ![行内图片](/test-image.svg) 后文');
  const peer = await page.context().newPage();
  await peer.route('**/test-image.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: imageSvg }));
  await peer.goto(page.url());
  const peerImage = peer.locator('.madoc-image-source-view img');
  await expect(peerImage).toBeVisible();
  await page.locator('.madoc-image-source-view img').click();
  const source = page.getByLabel('编辑图片 Markdown 源码');
  await expect(source).toBeFocused();
  await source.fill('![同步图片](/test-image.svg "同步标题")');
  await expect(peerImage).toHaveAttribute('alt', '同步图片');
  await expect(peerImage).toHaveAttribute('title', '同步标题');
  await expect(source).toBeFocused();
  await source.press('ControlOrMeta+z');
  await expect(peerImage).toHaveAttribute('alt', '行内图片');
  await source.fill('![暂未完成](');
  await expect(source).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('img', { name: '无法渲染图片' })).toBeVisible();
  await expect(peerImage).toHaveAttribute('alt', '行内图片');
  await source.press('Escape');
  await expect(page.getByRole('img', { name: '无法渲染图片' })).toBeHidden();
  await expect(page.locator('.ProseMirror')).toContainText('后文');
  await peer.close();
});

test('reference edits synchronize and failed image source is read-only for viewers', async ({ page, browser }) => {
  await openDocument(page, references + '\n\n![失效图片](./missing-viewer-image.png)');
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const session = await (await page.request.get('/api/auth/session')).json();
  const invitation = await (await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
    headers: { 'x-madoc-csrf-token': session.csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { email: 'fidelity-reader@example.test', role: 'viewer' },
  })).json();
  const context = await browser.newContext();
  await context.request.post(`/api/invites/${invitation.token}/accept`, { data: { name: 'Reader', password: 'password123' } });
  const reader = await context.newPage();
  await reader.goto(page.url());
  await expect(reader.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  const source = reader.getByLabel('编辑图片 Markdown 源码');
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('readonly', '');
  await expect(reader.locator('.madoc-image-source-view img')).toBeHidden();
  const definition = page.locator('[data-reference-definition]').first();
  await definition.evaluate((element) => {
    element.closest<HTMLElement>('.ProseMirror')!.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.insertText('[example-site]: https://example.com/shared');
  await expect(reader.locator('.ProseMirror a').first()).toHaveAttribute('href', 'https://example.com/shared');
  await context.close();
});
