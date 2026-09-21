import { expect, test, type Locator, type Page } from '@playwright/test';

const sourceCaret = (source: Locator, position: 'start' | 'end') => source.evaluate((element: HTMLInputElement, side) => {
  const cursor = side === 'start' ? 0 : element.value.length;
  element.setSelectionRange(cursor, cursor);
}, position);

async function openDocument(page: Page, markdown = '') {
  const status = await (await page.request.get('/api/setup/status')).json();
  const auth = await page.request.post(status.initialized ? '/api/auth/sign-in' : '/api/setup/admin', {
    data: { ...(!status.initialized ? { name: 'Owner' } : {}), email: 'owner@example.test', password: 'password123' },
  });
  expect(auth.ok()).toBeTruthy();
  const { csrfToken } = await auth.json();
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  const workspace = await (await page.request.post('/api/workspaces', { headers, data: { name: 'Writing regression' } })).json();
  const item = await (await page.request.post(`/api/workspaces/${workspace.id}/items`, {
    headers, data: { type: 'markdown', title: 'Inline writing', parentId: null },
  })).json();
  if (markdown) {
    const reset = await page.request.put(`/api/items/${item.id}/markdown`, { headers, data: { snapshot: '', markdown } });
    expect(reset.ok()).toBeTruthy();
  }
  await page.goto(`/workspace/${workspace.id}/${item.id}`);
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  return item.id as string;
}

test('continuous typing inside an existing pair preserves every character', async ({ page }) => {
  await openDocument(page);
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('****');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('pair bold');
  await page.getByLabel('文档标题').click();
  await expect(page.locator('.ProseMirror strong')).toContainText('pair bold');
});

test('inline source changes sync before leaving the active element', async ({ page }) => {
  const id = await openDocument(page, 'Before **bold** after.');
  await page.locator('.ProseMirror strong').click();
  const source = page.getByLabel('编辑加粗源码');
  await expect(source).toBeVisible();
  await source.fill('**edited live**');
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text()), {
    timeout: 4000,
  }).toContain('**edited live**');
  await page.reload();
  await expect(page.locator('.ProseMirror strong')).toContainText('edited live');
});

for (const [pair, left, text, selector, raw, label] of [
  ['****', 2, '加粗内容', 'strong', '**加粗内容**', '编辑加粗源码'],
  ['**', 1, '斜体内容', 'em', '*斜体内容*', '编辑斜体源码'],
  ['``', 1, 'const value = 1', 'code', '`const value = 1`', '编辑行内代码源码'],
  ['$$', 1, 'x^2+1', '[data-type="math_inline"]', '$x^2+1$', '编辑行内公式'],
] as const) {
  test(`${label}: delimiter-first input, real arrow positions, rendering and reload`, async ({ page }) => {
    await openDocument(page);
    await page.locator('.ProseMirror').click();
    await page.keyboard.type(pair);
    for (let i = 0; i < left; i += 1) await page.keyboard.press('ArrowLeft');
    await page.keyboard.type(text);
    const source = page.getByLabel(label);
    await expect(source).toHaveValue(raw);
    await sourceCaret(source, 'start');
    await source.press('ArrowRight');
    await expect.poll(() => source.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(1);
    await sourceCaret(source, 'end');
    await source.press('ArrowLeft');
    await expect.poll(() => source.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(raw.length - 1);
    await sourceCaret(source, 'end');
    await source.press('ArrowRight');
    await expect(source).toBeHidden();
    await page.keyboard.type(' outside');
    const rendered = page.locator(`.ProseMirror ${selector}`);
    await expect(rendered).toBeVisible();
    if (selector === '[data-type="math_inline"]') {
      await expect(rendered).toHaveAttribute('data-value', text);
      await expect(rendered.locator('.katex')).toBeVisible();
      await expect(page.locator('.milkdown-latex-inline-edit')).toHaveCount(0);
    } else await expect(rendered).toHaveText(text);
    await expect(page.locator('.ProseMirror')).toContainText(' outside');
    await page.reload();
    await expect(rendered).toBeVisible();
    if (selector !== '[data-type="math_inline"]') await expect(rendered).toHaveText(text);
    else await expect(rendered).toHaveAttribute('data-value', text);
    await rendered.click();
    await expect(source).toHaveValue(raw);
    await sourceCaret(source, 'start');
    await source.press('ArrowLeft');
    await expect(source).toBeHidden();
    await page.keyboard.type('before ');
    await expect(page.locator('.ProseMirror p')).toContainText('before ');
    await expect(rendered).toBeVisible();
  });
}

test('nested formatting and delimiter deletion preserve document semantics', async ({ page }) => {
  const id = await openDocument(page, 'Before **bold and *nested*** after.');
  await page.locator('.ProseMirror strong').first().click({ position: { x: 5, y: 8 } });
  const source = page.getByLabel('编辑加粗源码');
  await expect(source).toBeVisible();
  await source.fill('**changed and *nested***');
  await page.getByLabel('文档标题').click();
  await expect(page.locator('.ProseMirror em')).toHaveText('nested');
  await page.locator('.ProseMirror strong').first().click({ position: { x: 5, y: 8 } });
  await source.fill('plain text');
  await page.getByLabel('文档标题').click();
  await expect(page.locator('.ProseMirror strong')).toHaveCount(0);
  await expect(page.locator('.ProseMirror p')).toHaveText('Before plain text after.');
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('Before plain text after.');
});

test('two editors merge live inline text edits without waiting for blur', async ({ page }) => {
  await openDocument(page, 'Before **shared** after.');
  const peer = await page.context().newPage();
  await peer.goto(page.url());
  await expect(peer.locator('.ProseMirror strong')).toHaveText('shared');
  await page.locator('.ProseMirror strong').click();
  await peer.locator('.ProseMirror strong').click();
  const source = page.getByLabel('编辑加粗源码');
  const peerSource = peer.getByLabel('编辑加粗源码');
  await sourceCaret(source, 'start');
  await source.press('ArrowRight');
  await source.press('ArrowRight');
  await source.pressSequentially('A ');
  await expect(peerSource).toHaveValue('**A shared**');
  await sourceCaret(peerSource, 'end');
  await peerSource.press('ArrowLeft');
  await peerSource.press('ArrowLeft');
  await peerSource.pressSequentially(' B');
  await expect(source).toHaveValue('**A shared B**');
  await source.dispatchEvent('compositionstart', { data: '' });
  await source.fill('**中A shared B**');
  await sourceCaret(peerSource, 'end');
  await peerSource.press('ArrowLeft');
  await peerSource.press('ArrowLeft');
  await peerSource.pressSequentially(' C');
  await expect(peerSource).toHaveValue('**A shared B C**');
  await source.dispatchEvent('compositionend', { data: '中' });
  await expect(peerSource).toHaveValue('**中A shared B C**');
  await peer.close();
  await page.reload();
  await expect(page.locator('.ProseMirror strong')).toHaveText('中A shared B C');
});

test('source editing uses the shared undo history', async ({ page }) => {
  await openDocument(page, 'Before **original** after.');
  await page.locator('.ProseMirror strong').click();
  const source = page.getByLabel('编辑加粗源码');
  await source.fill('**revised**');
  await source.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(source).toHaveValue('**original**');
  await source.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
  await expect(source).toHaveValue('**revised**');
});

test('IME composition stays intact until compositionend and empty content is saved', async ({ page }) => {
  const id = await openDocument(page, '**原文**');
  await page.locator('.ProseMirror strong').click();
  const source = page.getByLabel('编辑加粗源码');
  await source.dispatchEvent('compositionstart', { data: '' });
  await source.fill('**中文输入**');
  await expect(source).toBeFocused();
  await source.dispatchEvent('compositionend', { data: '中文输入' });
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('**中文输入**');
  await source.fill('');
  await page.getByLabel('文档标题').click();
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text()).trim()).toBe('');
  await page.reload();
  await expect(page.locator('.ProseMirror')).toHaveText('');
});

test('viewer cannot enter editable inline source', async ({ page, browser }) => {
  await openDocument(page, '**readonly** and $x^2$');
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const session = await (await page.request.get('/api/auth/session')).json();
  const invitation = await (await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
    headers: { 'x-madoc-csrf-token': session.csrfToken, Origin: 'http://127.0.0.1:3100' },
    data: { email: 'reader@example.test', role: 'viewer' },
  })).json();
  const context = await browser.newContext();
  const accepted = await context.request.post(`/api/invites/${invitation.token}/accept`, {
    data: { name: 'Reader', password: 'password123' },
  });
  expect(accepted.ok()).toBeTruthy();
  const reader = await context.newPage();
  await reader.goto(page.url());
  await expect(reader.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  await reader.locator('.ProseMirror strong').click();
  await reader.locator('.ProseMirror [data-type="math_inline"]').click();
  await expect(reader.locator('.madoc-inline-source')).toHaveCount(0);
  await context.close();
});
