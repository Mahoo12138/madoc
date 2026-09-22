import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

const matrix = String.raw`A =
\begin{bmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{bmatrix}
\tag{3}`;

for (const width of [1280, 390]) {
  test(`block math uses source above preview and collapses on blur at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width, height: 900 });
    const id = await openDocument(page, `矩阵：\n\n$$\n${matrix}\n$$\n\n后续正文`);
    await expect(page).toHaveURL(/\/workspace\//);
    await expect(page).toHaveTitle(/madoc/);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    const block = page.getByRole('group', { name: '块级公式' });
    const source = block.locator('.cm-content');
    await expect(block.locator('.katex')).toBeVisible();
    await expect(source).toBeHidden();
    await block.locator('.preview').click();
    await expect(source).toBeVisible();
    await expect(source).toBeFocused();
    await expect(source).toContainText('bmatrix');
    await expect(block.locator('.cm-gutters')).toBeHidden();
    await expect(block.locator('.language-button')).toBeHidden();
    await expect(block.locator('.preview-label')).toBeHidden();
    await expect(block.locator('.preview-toggle-button')).toHaveText('Math ✓');
    expect(await block.locator('.cm-editor').evaluate((element) => getComputedStyle(element, '::before').content)).toBe('"$$"');
    expect(await block.locator('.cm-editor').evaluate((element) => getComputedStyle(element, '::after').content)).toBe('"$$"');
    const editorBox = (await block.locator('.cm-editor').boundingBox())!;
    const previewBox = (await block.locator('.preview-panel').boundingBox())!;
    expect(previewBox.y).toBeGreaterThanOrEqual(editorBox.y + editorBox.height);
    await expect(block.locator('.preview-panel')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(block.locator('.katex-html')).toContainText('(3)');
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
    await block.screenshot({ path: testInfo.outputPath(`math-edit-${width}.png`) });
    await block.locator('.preview-toggle-button').click();
    await expect(source).toBeHidden();
    await block.press('Enter');
    await expect(source).toBeFocused();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.insertText('B + ');
    await expect(source).toContainText('B + A');
    await expect(block.locator('.katex-html')).toContainText('B');
    await page.getByLabel('文档标题').click();
    await expect(source).toBeHidden();
    await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('B + A');
    const exported = await (await page.request.get(`/api/items/${id}/export.md`)).text();
    expect(exported).toContain('$$');
    expect(exported).not.toContain('```');
    await page.reload();
    await expect(block.locator('.katex-html')).toContainText('B');
    await expect(source).toBeHidden();
    await block.screenshot({ path: testInfo.outputPath(`math-preview-${width}.png`) });
    expect(errors).toEqual([]);
  });
}

test('math editing syncs to a peer without opening its source and supports undo', async ({ page }) => {
  await openDocument(page, '$$\nx+1\n$$\n\n正文');
  const peer = await page.context().newPage();
  await peer.goto(page.url());
  const block = page.locator('.madoc-block-math');
  const remote = peer.locator('.madoc-block-math');
  await expect(remote.locator('.katex')).toBeVisible();
  await block.locator('.preview').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('+2');
  await expect(remote.locator('.katex-html')).toContainText('2');
  await expect(remote.locator('.cm-content')).toBeHidden();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(block.locator('.cm-content')).toHaveText('x+1');
  await expect(remote.locator('.katex-html')).not.toContainText('2');
  await peer.close();
});

test('empty and invalid formulas remain editable and recover their preview', async ({ page }) => {
  const id = await openDocument(page, '$$\n\\badcommand{\n$$\n\n正文');
  const block = page.locator('.madoc-block-math');
  await expect(block.locator('.katex-error')).toBeVisible();
  await block.locator('.preview').click();
  const source = block.locator('.cm-content');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await expect(source).toBeEmpty();
  await page.getByLabel('文档标题').click();
  await expect(source).toBeVisible();
  await source.click();
  await page.keyboard.insertText('x^2');
  await expect(block.locator('.katex-error')).toHaveCount(0);
  await expect(block.locator('.katex')).toBeVisible();
  await page.getByLabel('文档标题').click();
  await expect(source).toBeHidden();
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('x^2');
});

test('viewer sees the formula without source controls or an editable entry point', async ({ page, browser }) => {
  await openDocument(page, '$$\nx^2\n$$');
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const session = await (await page.request.get('/api/auth/session')).json();
  const invitation = await (await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
    headers: { 'x-madoc-csrf-token': session.csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { email: 'math-reader@example.test', role: 'viewer' },
  })).json();
  const context = await browser.newContext();
  const accepted = await context.request.post(`/api/invites/${invitation.token}/accept`, {
    data: { name: 'Math reader', password: 'password123' },
  });
  expect(accepted.ok()).toBeTruthy();
  const reader = await context.newPage();
  await reader.goto(page.url());
  const block = reader.locator('.madoc-block-math');
  await expect(block.locator('.katex')).toBeVisible();
  await block.locator('.preview').click();
  await expect(block.locator('.cm-content')).toBeHidden();
  await expect(block.locator('.tools')).toBeHidden();
  await block.press('Enter');
  await expect(block.locator('.cm-content')).toBeHidden();
  await context.close();
});

test('keyboard navigation opens math source and leaving it collapses the panel', async ({ page }) => {
  await openDocument(page, '前文\n\n$$\nx+1\n$$\n\n后文');
  const editor = page.locator('.ProseMirror');
  const block = page.locator('.madoc-block-math');
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expect(block.locator('.cm-content')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowRight');
  await expect(block.locator('.cm-content')).toBeHidden();
  await page.keyboard.insertText('新增');
  await expect(editor.locator('p').last()).toContainText('新增');
});

test('changing a code block to LaTeX adopts the math presentation', async ({ page }) => {
  await openDocument(page, '```text\nx^2\n```\n\n后文');
  const block = page.locator('.milkdown-code-block');
  await block.hover();
  await block.locator('.language-button').click();
  await block.getByPlaceholder('搜索语言').fill('latex');
  await block.locator('[data-language="LaTeX"]').click();
  await expect(block).toHaveClass(/madoc-block-math/);
  await expect(block.locator('.katex')).toBeVisible();
  await block.locator('.preview').click();
  await expect(block.locator('.cm-content')).toBeFocused();
});
