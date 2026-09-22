import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

const markdown = `正文引用长脚注[^long-note]，再引用普通脚注[^note]，重复引用[^LONG-NOTE]。

[^note]: 这是普通脚注的内容。

[^long-note]: 这是长脚注的第一段。

    这是同一个脚注中的第二段，用于测试脚注内部的段落处理。

    这里还包含 **粗体** 和 \`行内代码\`。`;
const refSelector = 'sup[data-type="footnote_reference"]';
const defSelector = '.madoc-footnote-definition';

for (const width of [1280, 390]) {
  test(`footnotes number references by first use and retain multi-paragraph definitions at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width, height: 900 });
    const id = await openDocument(page, markdown);
    const refs = page.locator(refSelector);
    const defs = page.locator(defSelector);
    await expect(refs).toHaveCount(3);
    await expect(defs).toHaveCount(2);
    await expect(refs.nth(0)).toHaveAttribute('data-footnote-number', '1');
    await expect(refs.nth(1)).toHaveAttribute('data-footnote-number', '2');
    await expect(refs.nth(2)).toHaveAttribute('data-footnote-number', '1');
    await expect(defs.nth(0)).toHaveAttribute('data-footnote-number', '2');
    await expect(defs.nth(1)).toHaveAttribute('data-footnote-number', '1');
    await expect(defs.nth(1).locator('dd > p')).toHaveCount(3);
    await expect(defs.nth(1).locator('strong')).toHaveText('粗体');
    await expect(defs.nth(1).locator('code')).toHaveText('行内代码');
    await expect(defs.nth(1).getByLabel('脚注标识')).toHaveValue('long-note');
    await expect(defs.nth(0)).toHaveCSS('border-top-style', 'solid');
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
    await page.locator('.ProseMirror').screenshot({ path: testInfo.outputPath(`footnotes-${width}.png`) });
    await defs.nth(1).locator('dd > p').nth(1).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('追加内容');
    await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('追加内容');
    const exported = await (await page.request.get(`/api/items/${id}/export.md`)).text();
    expect(exported).toContain('[^note]:');
    expect(exported).toContain('[^long-note]:');
    expect(exported).toMatch(/\n {4}这是同一个脚注/);
    expect(exported).toContain('**粗体**');
    expect(exported).toContain('`行内代码`');
    await page.reload();
    await expect(defs.nth(1).locator('dd > p')).toHaveCount(3);
    await expect(defs.nth(1)).toContainText('追加内容');
    await openDocument(page, exported);
    await expect(refs).toHaveCount(3);
    await expect(defs.nth(1).locator('dd > p')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
}

test('definition-only notes show their Markdown label and retain rich content', async ({ page }) => {
  await openDocument(page, markdown.slice(markdown.indexOf('[^note]:')));
  await expect(page.locator(defSelector)).toHaveCount(2);
  await expect(page.locator(defSelector).first().getByLabel('脚注标识')).toHaveValue('note');
  await expect(page.getByRole('button', { name: '返回脚注引用' })).toHaveCount(0);
  await expect(page.locator(`${defSelector} strong`)).toHaveText('粗体');
});

test('editing a definition identifier updates all references, syncs and undoes atomically', async ({ page }) => {
  const id = await openDocument(page, markdown);
  const peer = await page.context().newPage();
  await peer.goto(page.url());
  const label = page.locator(defSelector).nth(1).getByLabel('脚注标识');
  await label.fill('renamed');
  await expect(page.locator(refSelector).nth(0)).toHaveAttribute('data-label', 'renamed');
  await expect(page.locator(refSelector).nth(2)).toHaveAttribute('data-label', 'renamed');
  await expect(peer.locator(defSelector).nth(1).getByLabel('脚注标识')).toHaveValue('renamed');
  await expect(peer.locator(refSelector).nth(2)).toHaveAttribute('data-label', 'renamed');
  await label.press('ControlOrMeta+z');
  await expect(label).toHaveValue('long-note');
  await expect(page.locator(refSelector).nth(2)).toHaveAttribute('data-label', 'LONG-NOTE');
  await label.fill('note');
  await expect(label).toHaveAttribute('aria-invalid', 'true');
  await label.press('Escape');
  await expect(label).toHaveValue('long-note');
  await label.fill('final-note');
  await label.press('Enter');
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('[^final-note]:');
  await peer.close();
});

test('reference source edits in place and unresolved targets remain explicit', async ({ page }) => {
  await openDocument(page, markdown);
  await page.locator(refSelector).first().click();
  const source = page.getByLabel('编辑脚注引用源码');
  await expect(source).toHaveValue('[^long-note]');
  await source.fill('[^note]');
  await page.getByLabel('文档标题').click();
  await expect(page.locator(refSelector).first()).toHaveAttribute('data-label', 'note');
  await page.locator(refSelector).first().click();
  await source.fill('[^missing]');
  await page.getByLabel('文档标题').click();
  await expect(page.locator(refSelector).first()).toHaveAttribute('data-missing', 'true');
});

test('modifier click jumps to a definition and its backlink returns to the clicked occurrence', async ({ page }) => {
  await openDocument(page, markdown);
  const refs = page.locator(refSelector);
  await refs.nth(2).click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByLabel('编辑脚注引用源码')).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.locator(defSelector).nth(1).getByRole('button', { name: '返回脚注引用' }).click();
  await expect(refs.nth(2)).toBeFocused();
});

test('typing creates a footnote reference and definition without losing body text', async ({ page }) => {
  const id = await openDocument(page, '正文');
  const editor = page.locator('.ProseMirror');
  await editor.locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('[^new]');
  await expect(page.locator(refSelector)).toHaveCount(1);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[^new]: ');
  await page.keyboard.insertText('脚注第一段');
  await expect(page.locator(defSelector)).toHaveCount(1);
  await expect(page.locator(`${defSelector} dd`)).toHaveText('脚注第一段');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('脚注第二段');
  await expect(page.locator(`${defSelector} dd > p`)).toHaveCount(2);
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('[^new]:');
  await page.reload();
  await expect(page.locator(refSelector)).toHaveCount(1);
  await expect(page.locator(`${defSelector} dd > p`)).toHaveCount(2);
});

test('unresolved references survive refresh and resolve when their definition is added later', async ({ page }) => {
  const id = await openDocument(page, '未完成引用[^later]\n\n后续正文');
  const reference = page.locator(refSelector);
  await expect(reference).toHaveAttribute('data-missing', 'true');
  await page.reload();
  await expect(reference).toHaveAttribute('data-label', 'later');
  await page.locator('.ProseMirror > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[^later]: ');
  await page.keyboard.insertText('稍后补充的内容');
  await expect(reference).toHaveAttribute('data-missing', 'false');
  await expect(page.locator(defSelector)).toContainText('稍后补充的内容');
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('[^later]:');
  await page.reload();
  await expect(reference).toHaveAttribute('data-missing', 'false');
});

test('removing a reference renumbers the remaining notes without deleting definitions', async ({ page }) => {
  await openDocument(page, markdown);
  await page.locator(refSelector).first().click();
  await page.getByLabel('编辑脚注引用源码').fill('普通文字');
  await page.getByLabel('文档标题').click();
  await expect(page.locator(refSelector)).toHaveCount(2);
  await expect(page.locator(refSelector).nth(0)).toHaveAttribute('data-footnote-number', '1');
  await expect(page.locator(refSelector).nth(1)).toHaveAttribute('data-footnote-number', '2');
  await expect(page.locator(defSelector).nth(0)).toHaveAttribute('data-footnote-number', '1');
  await expect(page.locator(defSelector).nth(1)).toHaveAttribute('data-footnote-number', '2');
  await expect(page.locator(defSelector)).toHaveCount(2);
});

test('escaped footnote syntax and code examples stay literal during import and editing', async ({ page }) => {
  await openDocument(page, '\\[^literal] and &#91;^entity] and `[^code]`\n\n```md\n[^block]: example\n```\n\n正文');
  await expect(page.locator(refSelector)).toHaveCount(0);
  await expect(page.locator(defSelector)).toHaveCount(0);
  await page.locator('.ProseMirror > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type('\\[^typed]');
  await expect(page.locator(refSelector)).toHaveCount(0);
  await openDocument(page, '&#91;^entity]');
  await page.locator('.ProseMirror > p').click();
  await page.keyboard.press('End');
  await expect(page.locator(refSelector)).toHaveCount(0);
});

test('viewer can navigate footnotes but cannot edit their identifiers or body', async ({ page, browser }) => {
  const id = await openDocument(page, markdown);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const session = await (await page.request.get('/api/auth/session')).json();
  const invitation = await (await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
    headers: { 'x-madoc-csrf-token': session.csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { email: 'footnote-reader@example.test', role: 'viewer' },
  })).json();
  const context = await browser.newContext();
  expect((await context.request.post(`/api/invites/${invitation.token}/accept`, {
    data: { name: 'Footnote reader', password: 'password123' },
  })).ok()).toBeTruthy();
  const reader = await context.newPage();
  await reader.goto(page.url());
  await expect(reader.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  const label = reader.locator(defSelector).nth(1).getByLabel('脚注标识');
  await expect(label).toHaveAttribute('readonly', '');
  await reader.locator(refSelector).last().click();
  await expect(reader.locator(defSelector).nth(1)).toBeFocused();
  await reader.locator(defSelector).nth(1).getByRole('button', { name: '返回脚注引用' }).click();
  await expect(reader.locator(refSelector).last()).toBeFocused();
  await expect(reader.getByLabel('编辑脚注引用源码')).toHaveCount(0);
  expect(await (await page.request.get(`/api/items/${id}/export.md`)).text()).toContain('[^long-note]:');
  await context.close();
});

test('reference source offers a jump control on narrow screens without a modifier key', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDocument(page, markdown);
  await page.locator(refSelector).last().click();
  await expect(page.getByLabel('编辑脚注引用源码')).toBeVisible();
  await page.getByRole('button', { name: '转到脚注' }).click();
  await expect(page.getByLabel('编辑脚注引用源码')).toHaveCount(0);
  await page.locator(defSelector).nth(1).getByRole('button', { name: '返回脚注引用' }).click();
  await expect(page.locator(refSelector).last()).toBeFocused();
});
