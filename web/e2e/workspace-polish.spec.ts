import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

async function expectTouchActions(page: Page) {
  const buttons = page.locator('article').getByRole('button');
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box, await button.getAttribute('aria-label')).toBeTruthy();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
}

// These badges sit on the white editor surface and have a translucent tint.
async function badgeContrast(label: Locator) {
  return label.evaluate((element) => {
    const rgb = (value: string) => {
      const channels = value.match(/[\d.]+/g)!.map(Number);
      return value.startsWith('color(srgb')
        ? channels.map((channel, index) =>
            index < 3 ? channel * 255 : channel,
          )
        : channels;
    };
    const foreground = rgb(getComputedStyle(element).color);
    const tint = rgb(getComputedStyle(element.parentElement!).backgroundColor);
    const background = tint
      .slice(0, 3)
      .map((channel) => channel * (tint[3] ?? 1) + 255 * (1 - (tint[3] ?? 1)));
    const luminance = (color: number[]) =>
      color.slice(0, 3).reduce((sum, channel, index) => {
        const value = channel / 255;
        return (
          sum +
          (value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4) *
            [0.2126, 0.7152, 0.0722][index]
        );
      }, 0);
    return (luminance(background) + 0.05) / (luminance(foreground) + 0.05);
  });
}

test('touch editor controls fit narrow widths and preserve reading and keyboard modes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDocument(page, '# 标题\n\n保留正文');
  for (const width of [390, 320, 760]) {
    await page.setViewportSize({ width, height: 844 });
    await expectTouchActions(page);
  }
  const focus = page.getByRole('button', { name: '切换专注模式' });
  const initial = await focus.getAttribute('aria-pressed');
  await focus.click();
  await expect(focus).toHaveAttribute(
    'aria-pressed',
    initial === 'true' ? 'false' : 'true',
  );
  await focus.click();
  await focus.press('Tab');
  const typewriter = page.getByRole('button', { name: '切换打字机模式' });
  await expect(typewriter).toBeFocused();
  await expect(typewriter).toHaveCSS('outline-style', 'solid');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: '进入阅读视图' }).click();
  await expect(page.locator('.ProseMirror')).toHaveAttribute(
    'contenteditable',
    'false',
  );
  await expectTouchActions(page);
  await page.getByRole('button', { name: '返回编辑' }).click();
  await expect(page.locator('.ProseMirror')).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await expect(page.locator('.ProseMirror')).toContainText('保留正文');
});

test('saved and offline local status stay readable while edits recover', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let offline = false;
  let disconnect = () => {};
  await page.routeWebSocket('**/ws', (socket) => {
    if (offline) {
      socket.close({ code: 1000 });
      return;
    }
    const server = socket.connectToServer();
    disconnect = () => {
      server.close({ code: 1000 });
      socket.close({ code: 1000 });
    };
  });
  await openDocument(page, '恢复正文');
  expect(
    await badgeContrast(page.getByText('已保存', { exact: true })),
  ).toBeGreaterThanOrEqual(4.5);
  offline = true;
  disconnect();
  const disconnected = page.getByText('离线', { exact: true });
  await expect(disconnected).toBeVisible();
  expect(await badgeContrast(disconnected)).toBeGreaterThanOrEqual(4.5);
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('，本地编辑');
  const local = page.getByText('已保存到此设备，待同步', { exact: true });
  await expect(local).toBeVisible();
  expect(await badgeContrast(local)).toBeGreaterThanOrEqual(4.5);
  await expectTouchActions(page);
  offline = false;
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText(
    '恢复正文，本地编辑',
  );
});

for (const platform of ['MacIntel', 'Win32']) {
  test(`search shortcut and long navigation labels remain clear on ${platform}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) =>
        Object.defineProperty(navigator, 'platform', { get: () => value }),
      platform,
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    const id = await openDocument(page, '# 键盘导航');
    const title = '很长的工作区文档名称LongDocumentName'.repeat(6);
    const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
    expect(
      (
        await page.request.patch(`/api/items/${id}`, {
          headers,
          data: { title },
        })
      ).ok(),
    ).toBeTruthy();
    await page.reload();
    const recent = page
      .getByRole('navigation', { name: '最近访问列表' })
      .getByRole('button', { name: new RegExp(title) });
    await expect(recent).toHaveAttribute('title', title);
    await expect(recent.locator('svg')).toHaveCSS('width', '15px');
    await expect(
      page
        .getByRole('navigation', { name: '文件列表' })
        .getByRole('button', { name: title, exact: true }),
    ).toHaveAttribute('title', title);
    const search = page.getByRole('button', { name: /搜索文档、页面内容/ });
    await expect(search).toContainText(
      platform === 'MacIntel' ? '⌘ K' : 'Ctrl K',
    );
    await search.press(platform === 'MacIntel' ? 'Meta+k' : 'Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('.ProseMirror')).toContainText('键盘导航');
  });
}

test('large touchscreens use touch targets while pointer desktops retain compact controls', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDocument(page, '# 触控桌面');
  expect(
    (await page
      .getByRole('button', { name: '导出 Markdown', exact: true })
      .boundingBox())!.width,
  ).toBe(28);
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    hasTouch: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const touch = await context.newPage();
    await touch.goto(page.url());
    await expect(touch.locator('.ProseMirror')).toBeVisible();
    await expectTouchActions(touch);
  } finally {
    await context.close();
  }
});
