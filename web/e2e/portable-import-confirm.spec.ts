import { expect, test, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { portableImportFiles } from './helpers/portable-packages';

async function openImport(page: Page, mobile = false, split = true) {
  if (mobile) await page.getByRole('button', { name: '打开内容导航' }).click();
  const navigation = mobile ? page.getByRole('dialog') : page.locator('aside');
  await navigation.getByRole('button', { name: '新建内容' }).click();
  await page.getByRole('menuitem', { name: '导入内容包' }).click();
  const dialog = page.getByRole('dialog', { name: '导入内容包', exact: true });
  await dialog.locator('input[type=file]').setInputFiles(portableImportFiles(split).reverse());
  await expect(dialog).toContainText('导入包校验通过');
  return dialog;
}
async function setup(page: Page) {
  const source = await openDocument(page, 'Source is unchanged');
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  return { source, workspace, headers, endpoint: `/api/workspaces/${workspace}/imports` };
}

for (const mobile of [false, true]) {
  test(`confirm imports a complete set to a chosen folder after resolving its name (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const { source, workspace, headers, endpoint } = await setup(page);
    const parent = await (
      await page.request.post(`/api/workspaces/${workspace}/items`, {
        headers,
        data: { type: 'folder', title: '目标目录', parentId: null },
      })
    ).json();
    await page.request.post(`/api/workspaces/${workspace}/items`, {
      headers,
      data: { type: 'folder', title: '导入资料', parentId: parent.id },
    });
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith(endpoint)) requests++;
    });
    const dialog = await openImport(page, mobile);
    await dialog.getByRole('textbox', { name: '导入位置' }).click();
    await page.getByRole('option', { name: '目标目录', exact: true }).click();
    await expect(dialog).toContainText('目标位置已有同名内容');
    await expect(dialog.getByRole('button', { name: '确认导入', exact: true })).toBeDisabled();
    await dialog.getByRole('textbox', { name: '新目录名称' }).fill('新资料');
    await expect(dialog.getByRole('button', { name: '确认导入', exact: true })).toBeEnabled();
    expect(requests).toBe(0);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(await page.title()).toBeTruthy();
    await page.screenshot({ path: `/tmp/madoc-import-confirm-${mobile ? 'mobile' : 'desktop'}.png` });
    await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
    await expect(dialog).toContainText('导入完成');
    await expect(dialog).toContainText('已创建 3 个内容项和 1 个附件');
    await expect(dialog.getByRole('button', { name: '确认导入', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `/tmp/madoc-import-success-${mobile ? 'mobile' : 'desktop'}.png` });
    const items = await (await page.request.get(`/api/workspaces/${workspace}/items`)).json();
    const root = items.find((item: { title: string }) => item.title === '新资料');
    expect(root.parentId).toBe(parent.id);
    const docs = items.filter((item: { parentId: string }) => item.parentId === root.id);
    expect(docs).toHaveLength(2);
    const first = docs.find((item: { title: string }) => item.title === '笔记 1');
    const second = docs.find((item: { title: string }) => item.title === '笔记 2');
    expect((await (await page.request.get(`/api/items/${source}/export.md`)).text()).trim()).toBe(
      'Source is unchanged',
    );
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.goto(`/workspace/${workspace}/${first.id}`);
    await expect(page.locator('.ProseMirror a').filter({ hasText: '下一篇' })).toHaveAttribute(
      'href',
      `/workspace/${workspace}/${second.id}`,
    );
    await expect
      .poll(() =>
        page
          .locator('.ProseMirror img')
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    expect(requests).toBe(1);
    expect(errors).toEqual([]);
  });
}

test('lost success response retries the identical request even if a later attempt is rejected', async ({ page }) => {
  const { workspace, endpoint } = await setup(page);
  const plans: string[] = [];
  await page.route(`**${endpoint}`, async (route) => {
    const text = route.request().postDataBuffer()!.toString();
    plans.push(text.match(/name="plan"\r\n\r\n([^\r]+)/)![1]);
    if (plans.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('failed');
    } else if (plans.length === 2) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'FORBIDDEN', message: 'denied' } }),
      });
    } else await route.continue();
  });
  const dialog = await openImport(page);
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(dialog).toContainText('尚未确认导入结果');
  await expect(dialog.getByRole('textbox', { name: '新目录名称' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '重新选择导入包' })).toBeDisabled();
  page.once('dialog', async (confirmation) => {
    expect(confirmation.message()).toContain('丢失本次重试信息');
    await confirmation.dismiss();
  });
  await dialog.getByRole('button', { name: '关闭预览' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '重试确认' }).click();
  await expect(dialog.getByRole('button', { name: '重试确认' })).toBeEnabled();
  await expect(dialog.getByRole('textbox', { name: '新目录名称' })).toBeDisabled();
  await dialog.getByRole('button', { name: '重试确认' }).click();
  await expect(dialog).toContainText('此前的导入成功，没有重复创建');
  expect(plans).toHaveLength(3);
  expect(new Set(plans).size).toBe(1);
  const items = await (await page.request.get(`/api/workspaces/${workspace}/items`)).json();
  expect(items).toHaveLength(4);
});

test('a confirmed name conflict leaves no partial group and allows correction', async ({ page }) => {
  const { workspace, headers, endpoint } = await setup(page);
  let intercept = true;
  await page.route(`**${endpoint}`, async (route) => {
    if (intercept) {
      intercept = false;
      const conflict = await page.request.post(`/api/workspaces/${workspace}/items`, {
        headers,
        data: { type: 'folder', title: '导入资料', parentId: null },
      });
      expect(conflict.status()).toBe(201);
    }
    await route.continue();
  });
  const dialog = await openImport(page, false, false);
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(dialog).toContainText('导入位置或名称发生冲突');
  const items = await (await page.request.get(`/api/workspaces/${workspace}/items`)).json();
  expect(items).toHaveLength(2);
  await dialog.getByRole('textbox', { name: '新目录名称' }).fill('修正后导入');
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(dialog).toContainText('导入完成');
  expect(await (await page.request.get(`/api/workspaces/${workspace}/items`)).json()).toHaveLength(5);
});

test('canceling preparation sends no import request and allows a fresh attempt', async ({ page }) => {
  const { workspace, endpoint } = await setup(page);
  const dialog = await openImport(page);
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith(endpoint)) requests++;
  });
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let resume: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    crypto.subtle.digest = async (...args) => {
      await gate;
      return original(...args);
    };
    Object.assign(window, {
      releaseImportDigest: () => {
        crypto.subtle.digest = original;
        resume!();
      },
    });
  });
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('正在准备');
  await dialog.getByRole('button', { name: '取消准备' }).click();
  await page.evaluate(() => (window as unknown as { releaseImportDigest: () => void }).releaseImportDigest());
  await expect(dialog).toContainText('已取消准备，尚未提交任何内容');
  expect(requests).toBe(0);
  expect(await (await page.request.get(`/api/workspaces/${workspace}/items`)).json()).toHaveLength(1);
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(dialog).toContainText('导入完成');
  expect(requests).toBe(1);
});

test('revoking an editor during submission rejects the entire group and leaves a readable result', async ({
  page,
  browser,
}) => {
  const { workspace, source, headers, endpoint } = await setup(page);
  const invite = await (
    await page.request.post(`/api/workspaces/${workspace}/invites`, {
      headers,
      data: { email: 'import-editor@example.test', role: 'editor' },
    })
  ).json();
  const context = await browser.newContext();
  try {
    const accepted = await (
      await context.request.post(`http://127.0.0.1:3100/api/invites/${invite.token}/accept`, {
        data: { name: 'Importer', password: 'password123' },
      })
    ).json();
    const editor = await context.newPage();
    await editor.goto(`http://127.0.0.1:3100/workspace/${workspace}/${source}`);
    await expect(editor.locator('.ProseMirror')).toBeVisible();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived: () => void = () => {};
    const arrival = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await editor.route(`**${endpoint}`, async (route) => {
      arrived();
      await gate;
      await route.continue();
    });
    const dialog = await openImport(editor);
    await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
    await arrival;
    await expect(dialog.getByRole('button', { name: '关闭预览' })).toBeDisabled();
    await editor.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    const downgraded = await page.request.patch(`/api/workspaces/${workspace}/members/${accepted.user.id}`, {
      headers,
      data: { role: 'viewer' },
    });
    expect(downgraded.ok()).toBeTruthy();
    await expect(dialog).toContainText('当前账号已无工作区写入权限');
    release();
    await expect(dialog).toContainText('当前账号无法导入');
    await expect(dialog.getByRole('button', { name: '确认导入', exact: true })).toBeDisabled();
    expect(await (await page.request.get(`/api/workspaces/${workspace}/items`)).json()).toHaveLength(1);
    await dialog.getByRole('button', { name: '关闭预览' }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('a malformed success response keeps the original import for confirmation', async ({ page }) => {
  const { workspace, endpoint } = await setup(page);
  let requests = 0;
  await page.route(`**${endpoint}`, async (route) => {
    requests++;
    if (requests === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ rootId: 'wrong-result' }),
      });
    } else await route.continue();
  });
  const dialog = await openImport(page);
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(dialog).toContainText('尚未确认导入结果');
  await dialog.getByRole('button', { name: '重试确认' }).click();
  await expect(dialog).toContainText('此前的导入成功，没有重复创建');
  expect(await (await page.request.get(`/api/workspaces/${workspace}/items`)).json()).toHaveLength(4);
});

test('removing the selected target blocks submission until another location is chosen', async ({ page }) => {
  const { workspace, headers } = await setup(page);
  const parent = await (
    await page.request.post(`/api/workspaces/${workspace}/items`, {
      headers,
      data: { type: 'folder', title: '稍后删除', parentId: null },
    })
  ).json();
  const dialog = await openImport(page);
  await dialog.getByRole('textbox', { name: '导入位置' }).click();
  await page.getByRole('option', { name: '稍后删除', exact: true }).click();
  expect((await page.request.delete(`/api/items/${parent.id}`, { headers })).ok()).toBeTruthy();
  await expect(dialog).toContainText('目标目录已不可用');
  await expect(dialog.getByRole('button', { name: '确认导入', exact: true })).toBeDisabled();
  await dialog.getByRole('textbox', { name: '导入位置' }).click();
  await page.getByRole('option', { name: '工作区根目录', exact: true }).click();
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(dialog).toContainText('导入完成');
  const items = await (await page.request.get(`/api/workspaces/${workspace}/items`)).json();
  expect(items.find((item: { title: string }) => item.title === '导入资料').parentId).toBeNull();
});
