import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ContentVersion } from '../src/api/types';
import { accountHeaders } from './helpers/account';
import { openDocument, openOutline } from './helpers/writing';

const baseURL = 'http://127.0.0.1:3100';
const longTitle =
  '文档布局与版本记录 العربية עברית ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3);
const longVersionName =
  '发布检查点 العربية עברית ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(2);
const longHeading =
  '跨设备章节 العربية עברית ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3);
const markdown = [
  '# 入口章节',
  ...Array.from(
    { length: 28 },
    (_, index) =>
      `## 目录章节 ${index + 1}\n\n这是版本布局回归正文。\n\n${'段落内容。\n\n'.repeat(3)}`,
  ),
  `## ${longHeading}\n\n末尾内容。`,
].join('\n\n');

async function versionFixture(page: Page, count = 16) {
  const itemId = await openDocument(page, markdown);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, baseURL);
  const renamed = await page.request.patch(`/api/items/${itemId}`, {
    headers,
    data: { title: longTitle },
  });
  expect(renamed.ok()).toBeTruthy();
  const manual: ContentVersion[] = [];
  for (let index = 0; index < count; index++) {
    const response = await page.request.post(`/api/items/${itemId}/versions`, {
      headers,
      data: {
        label: index === count - 1 ? longVersionName : `布局版本 ${index + 1}`,
        assetIds: [],
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    manual.push((await response.json()).version);
  }
  const result = (await (
    await page.request.get(`/api/items/${itemId}/versions`)
  ).json()) as { versions: ContentVersion[] };
  const automatic = result.versions.find(
    (version) => version.kind === 'automatic',
  );
  expect(automatic).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('文档标题')).toHaveValue(longTitle);
  return {
    itemId,
    workspaceId,
    headers,
    manual,
    automatic: automatic!,
    url: page.url(),
  };
}

async function openHistory(page: Page) {
  const direct = page.getByRole('button', { name: '版本与分享', exact: true });
  if (await direct.isVisible()) await direct.click();
  else {
    await page
      .getByRole('button', { name: '工作区更多操作', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: '版本与分享', exact: true })
      .click();
  }
  const history = page.getByRole('dialog', { name: '版本历史', exact: true });
  await expect(history).toBeVisible();
  await expect(
    history.getByRole('tab', { name: '历史记录', exact: true }),
  ).toBeVisible();
  return history;
}

function checkpoint(history: Locator, label: string) {
  return history
    .getByRole('navigation', { name: '版本列表', exact: true })
    .getByRole('button')
    .filter({ has: history.page().getByText(label, { exact: true }) });
}

async function expectDialogFits(page: Page, dialog: Locator) {
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left >= -1 &&
          box.right <= innerWidth + 1 &&
          box.top >= -1 &&
          box.bottom <= innerHeight + 1 &&
          element.scrollWidth <= element.clientWidth + 1 &&
          [...element.querySelectorAll('button, input, select')].every(
            (control) => {
              const bounds = control.getBoundingClientRect();
              return (
                !bounds.width ||
                (bounds.left >= box.left - 1 && bounds.right <= box.right + 1)
              );
            },
          )
        );
      }),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}

async function saveLayoutScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/version-layout/${name}.png`,
    animations: 'disabled',
  });
}

test('desktop toolbar, independently scrolling outline and long version rows fit their containers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await versionFixture(page);
  const toolbar = page.locator('header[aria-label="工作区工具栏"]');
  const entry = toolbar.getByRole('button', {
    name: '版本与分享',
    exact: true,
  });
  await expect(entry).toBeVisible();
  const panel = page.getByRole('complementary', { name: '文档大纲面板' });
  const outline = page.getByRole('navigation', { name: '文档大纲' });
  const controls = ['全部展开', '全部折叠', '隐藏大纲'].map((name) =>
    panel.getByRole('button', { name, exact: true }),
  );
  const boxes = await Promise.all(
    controls.map((control) => control.boundingBox()),
  );
  for (const box of boxes) expect(box).not.toBeNull();
  for (const box of boxes.slice(1))
    expect(Math.abs(box!.y - boxes[0]!.y)).toBeLessThanOrEqual(2);
  const rootList = outline.locator('ol').first();
  const beforeScroll = await page.evaluate(() => scrollY);
  expect(
    await rootList.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await outline
    .getByRole('button', { name: `${longHeading}，2 级标题`, exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await rootList.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(beforeScroll);
  await saveLayoutScreenshot(page, 'desktop-outline');
  const history = await openHistory(page);
  await checkpoint(history, longVersionName).click();
  const content = history.getByRole('tabpanel', { name: '正文', exact: true });
  await expect(content).toBeVisible();
  await expect(content.locator('pre')).toContainText('这是版本布局回归正文。');
  await expect(history.getByLabel('版本名称')).toHaveCount(0);
  await expect(history.getByLabel('恢复副本名称')).toHaveCount(0);
  await expectDialogFits(page, history);
  await saveLayoutScreenshot(page, 'desktop-history');
  await checkpoint(history, '布局版本 1').scrollIntoViewIfNeeded();
  await checkpoint(history, '布局版本 1').click();
  await expect(
    history.getByRole('button', { name: '恢复为新副本', exact: true }),
  ).toBeEnabled();
});

for (const width of [320, 390]) {
  test(`${width}px version history scrolls and manual selection controls sharing without replacing automatic selection`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    const fixture = await versionFixture(page);
    const history = await openHistory(page);
    await checkpoint(history, longVersionName).click();
    await expectDialogFits(page, history);
    await checkpoint(history, '布局版本 1').scrollIntoViewIfNeeded();
    await checkpoint(history, '布局版本 1').click();
    const content = history.getByRole('tabpanel', {
      name: '正文',
      exact: true,
    });
    await expect(content).toBeVisible();
    await expect(content.locator('pre')).toContainText(
      '这是版本布局回归正文。',
    );
    await checkpoint(history, longVersionName).click();
    await history.getByRole('tab', { name: '只读分享', exact: true }).click();
    const selected = history.getByLabel('发布版本', { exact: true });
    await expect(selected).toHaveValue(new RegExp(longVersionName));
    await expect(
      history.getByRole('button', { name: '新建分享', exact: true }),
    ).toBeEnabled();
    await selected.click();
    await expect(page.getByRole('option', { name: /自动保存/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await history.getByRole('tab', { name: '历史记录', exact: true }).click();
    await checkpoint(history, fixture.automatic.label || '自动保存').click();
    await history.getByRole('tab', { name: '只读分享', exact: true }).click();
    await expect(selected).toHaveValue('');
    await expect(
      history.getByRole('button', { name: '新建分享', exact: true }),
    ).toBeDisabled();
    await selected.click();
    await page.getByRole('option', { name: longVersionName }).click();
    await history
      .getByRole('button', { name: '新建分享', exact: true })
      .click();
    const create = page.getByRole('dialog', {
      name: '新建只读分享',
      exact: true,
    });
    await expectDialogFits(page, create);
    await create.getByLabel('有效期（可选）').fill('2099-10-03T12:30');
    await create.getByRole('button', { name: '取消', exact: true }).click();
    await expect(create).toHaveCount(0);
    await history
      .getByRole('button', { name: '新建分享', exact: true })
      .click();
    await expect(create.getByLabel('有效期（可选）')).toHaveValue('');
    await create.getByRole('button', { name: '取消', exact: true }).click();
    await expectDialogFits(page, history);
    await saveLayoutScreenshot(page, `share-mobile-${width}`);
    await history.getByRole('tab', { name: '历史记录', exact: true }).click();
    await expect(
      history.getByRole('button', { name: '恢复为新副本', exact: true }),
    ).toBeEnabled();
    await expect
      .poll(() =>
        content.evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBeGreaterThanOrEqual(80);
    await saveLayoutScreenshot(page, `history-mobile-${width}`);
    await page.setViewportSize({
      width: width === 320 ? 740 : 390,
      height: 390,
    });
    await expectDialogFits(page, history);
    await expect
      .poll(() =>
        content.evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBeGreaterThanOrEqual(80);
    await expect
      .poll(() =>
        content.evaluate(
          (element) =>
            element.scrollHeight > element.clientHeight &&
            ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
        ),
      )
      .toBe(true);
    const restoreEntry = history.getByRole('button', {
      name: '恢复为新副本',
      exact: true,
    });
    await restoreEntry.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        restoreEntry.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const dialog = element
            .closest('[role="dialog"]')!
            .getBoundingClientRect();
          return (
            box.top >= Math.max(0, dialog.top) &&
            box.bottom <= Math.min(innerHeight, dialog.bottom) &&
            box.left >= Math.max(0, dialog.left) &&
            box.right <= Math.min(innerWidth, dialog.right) &&
            element.contains(
              document.elementFromPoint(
                box.left + box.width / 2,
                box.top + box.height / 2,
              ),
            )
          );
        }),
      )
      .toBe(true);
    await restoreEntry.click();
    const restore = page.getByRole('dialog', {
      name: '恢复为新副本',
      exact: true,
    });
    await expect(restore).toBeVisible();
    await restore.getByRole('button', { name: '取消', exact: true }).click();
    await expect(restore).toHaveCount(0);
    await expect(history).toBeVisible();
    await content.scrollIntoViewIfNeeded();
    await saveLayoutScreenshot(page, `history-short-${width}`);
    await history.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(history).toHaveCount(0);
  });
}

test('text dialogs cancel drafts, retain failed input and block repeated submission or dismissal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await versionFixture(page, 1);
  const history = await openHistory(page);
  const saveEntry = history.getByRole('button', {
    name: '保存手动版本',
    exact: true,
  });
  await saveEntry.click();
  const save = page.getByRole('dialog', { name: '保存手动版本', exact: true });
  await expect(save).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(save).toHaveCount(0);
  await expect(history).toBeVisible();
  await saveEntry.click();
  const label = save.getByLabel('版本名称');
  await label.fill('取消的版本草稿');
  await save.getByRole('button', { name: '取消', exact: true }).click();
  await saveEntry.click();
  await expect(label).toHaveValue('');
  const savedName = `重试版本 ${fixture.itemId}`;
  await label.fill(savedName);
  let versionAttempts = 0;
  let releaseVersion!: () => void;
  const heldVersion = new Promise<void>((resolve) => {
    releaseVersion = resolve;
  });
  await page.route(`**/api/items/${fixture.itemId}/versions`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    versionAttempts++;
    if (versionAttempts === 1)
      return route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: '保存版本暂时失败' } },
      });
    await heldVersion;
    await route.continue();
  });
  await save.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: '保存版本暂时失败' }),
  ).toBeVisible();
  await expect(label).toHaveValue(savedName);
  await expectDialogFits(page, save);
  await save.getByRole('button', { name: '保存', exact: true }).click();
  try {
    await expect.poll(() => versionAttempts).toBe(2);
    await expect(label).toBeDisabled();
    await expect(
      save.getByRole('button', { name: '保存', exact: true }),
    ).toBeDisabled();
    await expect(
      save.getByRole('button', { name: '取消', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.mouse.click(1, 1);
    await expect(save).toBeVisible();
    expect(versionAttempts).toBe(2);
  } finally {
    releaseVersion();
  }
  await expect(save).toHaveCount(0);
  const persisted = (await (
    await page.request.get(`/api/items/${fixture.itemId}/versions`)
  ).json()) as { versions: ContentVersion[] };
  expect(
    persisted.versions.filter((version) => version.label === savedName),
  ).toHaveLength(1);
  await history
    .getByRole('button', { name: '恢复为新副本', exact: true })
    .click();
  const restore = page.getByRole('dialog', {
    name: '恢复为新副本',
    exact: true,
  });
  const title = restore.getByLabel('恢复副本名称');
  const initialTitle = await title.inputValue();
  await title.fill('取消的恢复副本');
  await restore.getByRole('button', { name: '取消', exact: true }).click();
  await history
    .getByRole('button', { name: '恢复为新副本', exact: true })
    .click();
  await expect(title).toHaveValue(initialTitle);
  await restore.getByRole('button', { name: '取消', exact: true }).click();
  await history.getByRole('tab', { name: '只读分享', exact: true }).click();
  await history.getByRole('button', { name: '新建分享', exact: true }).click();
  const create = page.getByRole('dialog', {
    name: '新建只读分享',
    exact: true,
  });
  await expect(create).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(create).toHaveCount(0);
  await expect(history).toBeVisible();
  await history.getByRole('button', { name: '新建分享', exact: true }).click();
  const expiry = create.getByLabel('有效期（可选）');
  await expiry.fill('2099-10-03T12:30');
  let shareAttempts = 0;
  let releaseShare!: () => void;
  const heldShare = new Promise<void>((resolve) => {
    releaseShare = resolve;
  });
  await page.route(`**/api/items/${fixture.itemId}/shares`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    shareAttempts++;
    if (shareAttempts > 1) await heldShare;
    await route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: '创建分享暂时失败' } },
    });
  });
  await create
    .getByRole('button', { name: '创建只读分享', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: '创建分享暂时失败' }),
  ).toBeVisible();
  await expect(expiry).toHaveValue('2099-10-03T12:30');
  await create
    .getByRole('button', { name: '创建只读分享', exact: true })
    .click();
  try {
    await expect.poll(() => shareAttempts).toBe(2);
    await expect(expiry).toBeDisabled();
    await expect(
      create.getByRole('button', { name: '取消', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.mouse.click(1, 1);
    await expect(create).toBeVisible();
    expect(shareAttempts).toBe(2);
  } finally {
    releaseShare();
  }
  await expect(expiry).toBeEnabled();
  await expect(expiry).toHaveValue('2099-10-03T12:30');
  await create.getByRole('button', { name: '取消', exact: true }).click();
  await expect(history).toBeVisible();
});

test('editor and viewer keep their version permissions after opening on mobile and resizing', async ({
  page,
  browser,
}) => {
  const fixture = await versionFixture(page, 2);
  const before = await (
    await page.request.get(`/api/items/${fixture.itemId}/markdown`)
  ).json();
  for (const role of ['editor', 'viewer'] as const) {
    const inviteResponse = await page.request.post(
      `/api/workspaces/${fixture.workspaceId}/invites`,
      {
        headers: fixture.headers,
        data: { email: `${role}-${fixture.workspaceId}@example.test`, role },
      },
    );
    expect(inviteResponse.ok()).toBeTruthy();
    const { token } = await inviteResponse.json();
    const context = await browser.newContext({
      viewport: { width: 390, height: 740 },
    });
    try {
      const accepted = await context.request.post(
        `${baseURL}/api/invites/${token}/accept`,
        {
          data: { name: role, password: 'password123' },
        },
      );
      expect(accepted.ok()).toBeTruthy();
      const member = await context.newPage();
      await member.goto(fixture.url);
      await expect(member.locator('.ProseMirror')).toBeVisible();
      const history = await openHistory(member);
      await checkpoint(history, longVersionName).click();
      for (const width of [390, 1440]) {
        await member.setViewportSize({ width, height: 900 });
        await expectDialogFits(member, history);
        await expect(
          history.getByRole('tab', { name: '只读分享', exact: true }),
        ).toHaveCount(0);
        for (const name of ['保存手动版本', '恢复为新副本']) {
          const action = history.getByRole('button', { name, exact: true });
          if (role === 'viewer') await expect(action).toHaveCount(0);
          else await expect(action).toBeEnabled();
        }
      }
      await member.keyboard.press('Escape');
      const outline = await openOutline(member);
      await outline
        .getByRole('button', { name: '目录章节 1，2 级标题', exact: true })
        .click();
      if (role === 'viewer') {
        await expect(member.locator('.ProseMirror')).toHaveAttribute(
          'contenteditable',
          'false',
        );
        expect(
          await (
            await page.request.get(`/api/items/${fixture.itemId}/markdown`)
          ).json(),
        ).toEqual(before);
      }
    } finally {
      await context.close();
    }
  }
});
