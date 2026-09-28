import { expect, test, type Locator } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

test('loading and successful missing-item results are separate states', async ({
  page,
}) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/workspaces/${workspaceId}/items`, async (route) => {
    await ready;
    await route.fulfill({ status: 200, json: [] });
  });
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('正在加载工作区…');
  await expect(page.getByRole('alert')).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toContainText('无法打开此链接');
  await expect(
    page.getByRole('button', { name: '重试加载', exact: true }),
  ).toHaveCount(0);
});

test('workspace list rate limiting offers retry instead of an empty state', async ({
  page,
}) => {
  await openDocument(page);
  await page.route('**/api/workspaces', (route) =>
    route.fulfill({
      status: 429,
      json: { error: { code: 'RATE_LIMITED', message: 'too many requests' } },
    }),
  );
  await page.goto('/workspaces');
  await expect(page.getByRole('alert')).toContainText('请求过于频繁', {
    timeout: 20_000,
  });
  await expect(
    page.getByText('你的第一个 Workspace', { exact: true }),
  ).toHaveCount(0);
  await page.unroute('**/api/workspaces');
  await page.getByRole('button', { name: '重试加载', exact: true }).click();
  await expect(
    page
      .getByRole('link', { name: '打开工作区 Writing regression', exact: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const resource of ['workspace', 'items'] as const) {
  test(`${resource} read failure offers recovery without claiming missing content`, async ({
    page,
  }) => {
    await openDocument(page, '# 保留正文');
    const workspaceId = new URL(page.url()).pathname.split('/')[2];
    const path = `/api/workspaces/${workspaceId}${resource === 'items' ? '/items' : ''}`;
    let fail = true;
    await page.route(`**${path}`, (route) =>
      fail
        ? route.fulfill({
            status: 503,
            json: {
              error: { code: 'UNAVAILABLE', message: 'upstream unavailable' },
            },
          })
        : route.continue(),
    );
    await page.reload();
    const retry = page.getByRole('button', { name: '重试加载', exact: true });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    const failureTitle =
      resource === 'items' ? '内容目录加载失败' : '工作区加载失败';
    await expect(page.getByRole('alert')).toContainText(failureTitle);
    for (const target of [page.getByText(failureTitle, { exact: true }), retry])
      expect(await contrastRatio(target)).toBeGreaterThanOrEqual(4.5);
    await expect(
      page.getByText(/内容可能已删除|从一个文档或白板开始/),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '新建文档', exact: true }),
    ).toHaveCount(0);
    fail = false;
    await retry.click();
    await expect(
      page.getByRole('textbox', { name: '文档正文', exact: true }),
    ).toContainText('保留正文');
    await expect(
      page.getByRole('button', { name: '重试加载', exact: true }),
    ).toHaveCount(0);
  });
}

test('confirmed deletion remains read-only when a later directory refresh fails', async ({
  page,
}) => {
  const id = await openDocument(page, '# 本地副本');
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const editor = page.getByRole('textbox', { name: '文档正文', exact: true });
  expect(
    (await page.request.delete(`/api/items/${id}`, { headers })).ok(),
  ).toBeTruthy();
  await expect(
    page.locator('main').getByRole('alert').filter({ hasText: '此内容已删除' }),
  ).toContainText('已停止保存');
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await page.route(`**/api/workspaces/${workspaceId}/items`, (route) =>
    route.abort(),
  );
  expect(
    (
      await page.request.patch(`/api/workspaces/${workspaceId}`, {
        headers,
        data: { name: '目录已变更' },
      })
    ).ok(),
  ).toBeTruthy();
  await expect(
    page.getByRole('button', { name: '重试加载', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  for (const name of ['版本与分享', '文档评论', '重命名'])
    await expect(
      page.locator('header').getByRole('button', { name, exact: true }),
    ).toHaveCount(0);
  await page.unroute(`**/api/workspaces/${workspaceId}/items`);
  await page.getByRole('button', { name: '重试加载', exact: true }).click();
  await expect(
    page.locator('main').getByRole('alert').filter({ hasText: '此内容已删除' }),
  ).toContainText('已停止保存');
  await expect(editor).toContainText('本地副本');
});

test('failed background tree refresh keeps the editor mounted and retries the latest directory', async ({
  page,
}) => {
  const id = await openDocument(page, '# 初始正文');
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const editor = page.locator('.ProseMirror');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await editor.evaluate((el) => el.setAttribute('data-retained-editor', 'yes'));
  await page.route(`**/api/workspaces/${workspaceId}/items`, (route) =>
    route.abort(),
  );
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  expect(
    (
      await page.request.patch(`/api/items/${id}`, {
        headers,
        data: { title: '远端新名称' },
      })
    ).ok(),
  ).toBeTruthy();
  await expect(
    page.getByRole('button', { name: '重试加载', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('alert')).toContainText('已保留当前已加载的内容');
  await expect(editor).toHaveAttribute('data-retained-editor', 'yes');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.press('ControlOrMeta+End');
  await page.keyboard.type('本地仍可编辑');
  await page.unroute(`**/api/workspaces/${workspaceId}/items`);
  await page.getByRole('button', { name: '重试加载', exact: true }).click();
  await expect(page.getByLabel('文档标题', { exact: true })).toHaveValue(
    '远端新名称',
  );
  await expect(editor).toHaveAttribute('data-retained-editor', 'yes');
  await expect(editor).toContainText('本地仍可编辑');
  expect(errors).toEqual([]);
});

for (const status of [401, 403, 404]) {
  test(`workspace ${status} is distinct from an empty workspace`, async ({
    page,
  }) => {
    await openDocument(page);
    const workspaceId = new URL(page.url()).pathname.split('/')[2];
    await page.goto(`/workspace/${workspaceId}`);
    let requests = 0;
    await page.route(`**/api/workspaces/${workspaceId}`, (route) => {
      requests++;
      return route.fulfill({
        status,
        json: { error: { code: 'DENIED', message: 'denied' } },
      });
    });
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(
      status === 401
        ? '登录已过期'
        : status === 403
          ? '无法访问此工作区'
          : '工作区不可用',
    );
    if (status === 404)
      await expect(page.getByRole('alert')).toContainText(
        '工作区可能已删除，或当前账号没有访问权限',
      );
    await expect(
      page.getByRole('button', { name: '新建文档', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('从一个文档或白板开始', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', {
        name: status === 401 ? '重新登录' : '返回工作区列表',
      }),
    ).toBeVisible();
    // StrictMode and workspace.watch may each start an initial read. Once the
    // denial is rendered, it must settle instead of entering a refetch loop.
    const settledRequests = requests;
    await page.waitForTimeout(1100);
    expect(requests).toBe(settledRequests);
  });
}

test('workspace cards support keyboard navigation and long multilingual names at 320px', async ({
  page,
}) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const name = '团队🚀 العربية עברית Résumé'.repeat(12);
  expect(
    (
      await page.request.patch(`/api/workspaces/${workspaceId}`, {
        headers,
        data: { name },
      })
    ).ok(),
  ).toBeTruthy();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/workspaces');
  const link = page.getByRole('link', {
    name: `打开工作区 ${name}`,
    exact: true,
  });
  await expect(link).toHaveAttribute('href', `/workspace/${workspaceId}`);
  await page.getByRole('button', { name: '账号菜单' }).focus();
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press('Tab');
    if (await link.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(link).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await link.press('Enter');
  await expect(page).toHaveURL(`/workspace/${workspaceId}`);
});

test('editor, member roles, invitation fields and overlay close controls have accessible names', async ({
  page,
}) => {
  await openDocument(page, '# 可访问正文');
  await expect(
    page.getByRole('textbox', { name: '文档正文', exact: true }),
  ).toHaveAttribute('aria-multiline', 'true');
  await page.getByRole('button', { name: '成员管理', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '成员与邀请', exact: true });
  await expect(drawer.getByRole('textbox', { name: / 的角色$/ })).toBeVisible();
  await expect(
    drawer.getByRole('button', { name: '关闭', exact: true }),
  ).toBeVisible();
  await drawer.getByRole('tab', { name: '邀请', exact: true }).click();
  await expect(
    drawer.getByRole('textbox', { name: '邀请邮箱', exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByRole('textbox', { name: '邀请角色', exact: true }),
  ).toBeVisible();
  await drawer.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: /搜索文档、页面内容/ }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }),
  ).toBeVisible();
});

test('secondary text is readable on the actual workspace surfaces', async ({
  page,
}) => {
  await openDocument(page, '# 对比度');
  for (const target of [
    page.getByLabel('文档统计'),
    page.getByText('还没有收藏，可使用文件旁的星标添加。', { exact: true }),
    page.getByRole('button', { name: /搜索文档、页面内容/ }).locator('kbd'),
  ]) {
    expect(await contrastRatio(target)).toBeGreaterThanOrEqual(4.5);
  }
});

async function contrastRatio(target: Locator) {
  return target.evaluate((el) => {
    const rgba = (value: string) => {
      const channels = value.match(/[\d.]+/g)!.map(Number);
      return [channels[0], channels[1], channels[2], channels[3] ?? 1];
    };
    const blend = (front: number[], back: number[]) =>
      front
        .slice(0, 3)
        .map((value, i) => value * front[3] + back[i] * (1 - front[3]));
    const lum = (color: number[]) =>
      color
        .map((value) => {
          const n = value / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        })
        .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ancestors: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement)
      ancestors.unshift(node);
    const background = ancestors.reduce(
      (back, node) => blend(rgba(getComputedStyle(node).backgroundColor), back),
      [255, 255, 255],
    );
    const a = lum(blend(rgba(getComputedStyle(el).color), background)),
      b = lum(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}
