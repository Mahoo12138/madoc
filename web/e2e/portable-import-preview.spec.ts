import { expect, test, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { portableFiles } from './helpers/portable-packages';

async function openPreview(page: Page, mobile = false) {
  if (mobile) await page.getByRole('button', { name: '打开内容导航' }).click();
  const navigation = mobile ? page.getByRole('dialog') : page.locator('aside');
  await navigation.getByRole('button', { name: '新建内容' }).click();
  await page.getByRole('menuitem', { name: '预览导入包' }).click();
  const dialog = page.getByRole('dialog', { name: '导入包预览', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const mobile of [false, true]) {
  test(`portable package preview validates selection and paginates without writes (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const itemID = await openDocument(page, 'Unchanged source');
    const workspaceID = new URL(page.url()).pathname.split('/')[2];
    const before = await (await page.request.get(`/api/workspaces/${workspaceID}/items`)).json();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/workspaces\/[^/]+\/(?:items|assets|imports)/.test(request.url()))
        writes.push(request.url());
    });
    const dialog = await openPreview(page, mobile);
    const input = dialog.locator('input[type=file]');
    const fixtures = portableFiles(true, 35);
    await input.setInputFiles([fixtures[1]]);
    await expect(dialog.getByRole('alert')).toContainText('全部附件分包');
    await expect(dialog.getByRole('table')).toHaveCount(0);
    await input.setInputFiles(fixtures.reverse());
    await expect(dialog).toContainText('导入包校验通过');
    await expect(dialog).toContainText('35 篇文档');
    await expect(dialog).toContainText('1 个附件');
    const table = dialog.getByRole('table', { name: '导入目录结构' });
    await expect(table.getByRole('row')).toHaveCount(31);
    await dialog.getByRole('button', { name: '2', exact: true }).click();
    await expect(table.getByRole('row')).toHaveCount(6);
    await expect(table).toContainText('笔记 35.md');
    await expect(dialog).toContainText('尚未创建任何内容');
    expect(page.url()).toContain(`/workspace/${workspaceID}/${itemID}`);
    expect(await page.title()).toBeTruthy();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await dialog.getByText('整组上限：', { exact: false }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/madoc-import-preview-${mobile ? 'mobile' : 'desktop'}.png` });
    await input.setInputFiles(portableFiles(false));
    await expect(dialog).toContainText('1 篇文档');
    await expect(table).toContainText('笔记 1.md');
    await expect(dialog.getByRole('button', { name: '2', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: '关闭预览' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await (await page.request.get(`/api/workspaces/${workspaceID}/items`)).json()).toEqual(before);
    expect((await (await page.request.get(`/api/items/${itemID}/export.md`)).text()).trim()).toBe('Unchanged source');
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('preview cancellation and closing release the reader and allow reselection', async ({ page }) => {
  await openDocument(page);
  let dialog = await openPreview(page);
  await page.evaluate(() => {
    const original = File.prototype.stream;
    Object.assign(window, {
      restoreFileStream: () => {
        File.prototype.stream = original;
      },
    });
    File.prototype.stream = function () {
      return new ReadableStream();
    };
  });
  await dialog.locator('input[type=file]').setInputFiles(portableFiles(false));
  await expect(dialog.getByRole('status')).toContainText('正在校验');
  await dialog.getByRole('button', { name: '取消读取' }).click();
  await expect(dialog.getByRole('alert')).toContainText('已取消读取');
  await expect(dialog.getByRole('button', { name: '选择导入包' })).toBeEnabled();
  await dialog.locator('input[type=file]').setInputFiles(portableFiles(false));
  await expect(dialog.getByRole('status')).toBeVisible();
  await dialog.getByRole('button', { name: '关闭预览' }).click();
  await page.evaluate(() => (window as unknown as { restoreFileStream: () => void }).restoreFileStream());
  dialog = await openPreview(page);
  await dialog.locator('input[type=file]').setInputFiles(portableFiles(false));
  await expect(dialog).toContainText('导入包校验通过');
});

test('viewer has no portable import entry', async ({ page, browser }) => {
  await openDocument(page);
  const url = page.url();
  const workspaceID = new URL(url).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const invite = await (
    await page.request.post(`/api/workspaces/${workspaceID}/invites`, {
      headers: { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' },
      data: { email: 'package-viewer@example.test', role: 'viewer' },
    })
  ).json();
  const context = await browser.newContext();
  try {
    const accepted = await context.request.post(`http://127.0.0.1:3100/api/invites/${invite.token}/accept`, {
      data: { name: 'Viewer', password: 'password123' },
    });
    expect(accepted.ok()).toBeTruthy();
    const viewer = await context.newPage();
    await viewer.goto(url);
    await expect(viewer.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
    await expect(viewer.getByRole('button', { name: '新建内容' })).toHaveCount(0);
    await expect(viewer.getByRole('menuitem', { name: '预览导入包' })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
