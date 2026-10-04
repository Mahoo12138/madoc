import { expect, test } from '@playwright/test';
import { accountHeaders } from './helpers/account';
import { openDocument } from './helpers/writing';
import {
  filterCodeLanguages,
  selectedCodeLanguage,
} from '../src/features/markdown/markdown-code-language-store';

test('language search matches names and aliases without treating an unknown fence as a known language', () => {
  const languages = [
    { name: 'TypeScript', alias: ['ts', 'typescript'] },
    { name: 'JavaScript', alias: ['js', 'javascript'] },
  ];
  expect(selectedCodeLanguage('TS', languages)).toBe(languages[0]);
  expect(selectedCodeLanguage('custom', languages)).toBeUndefined();
  expect(filterCodeLanguages('  JS  ', languages)).toEqual([languages[1]]);
  expect(filterCodeLanguages('ScRiPt', languages)).toEqual(languages);
  expect(filterCodeLanguages('missing', languages)).toEqual([]);
});

test('keyboard language selection preserves content and fence metadata through collaboration, undo and reload', async ({
  page,
}) => {
  const id = await openDocument(
    page,
    '```ts {2}\nconst first = 1;\nconst second = 2;\n```\n\nAfter code.',
  );
  const block = page.locator('.milkdown-code-block');
  const trigger = block.locator('.language-button');
  const peer = await page.context().newPage();
  try {
    await peer.goto(page.url());
    await expect(peer.locator('.language-button')).toContainText('TypeScript');
    await expect(trigger).toContainText('TypeScript');
    await trigger.focus();
    await trigger.press('Enter');
    const search = page.getByPlaceholder('搜索语言');
    await expect(search).toBeFocused();
    await search.fill('PyThOn');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(trigger).toContainText('Python');
    await expect(peer.locator('.language-button')).toContainText('Python');
    await expect(block.locator('.madoc-code-highlight')).toHaveText(
      'const second = 2;',
    );
    await expect
      .poll(
        async () =>
          await (await page.request.get(`/api/items/${id}/export.md`)).text(),
      )
      .toContain('```Python {2}');
    await expect(block.locator('.cm-content')).toContainText(
      'const first = 1;',
    );
    await block.locator('.cm-content').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(trigger).toContainText('TypeScript');
    await expect(peer.locator('.language-button')).toContainText('TypeScript');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(trigger).toContainText('Python');
    await expect
      .poll(
        async () =>
          await (await page.request.get(`/api/items/${id}/export.md`)).text(),
      )
      .toContain('```Python {2}');
    await page.reload();
    await expect(trigger).toContainText('Python');
    await expect(block.locator('.cm-content')).toContainText(
      'const second = 2;',
    );
    await expect(block.locator('.madoc-code-highlight')).toHaveText(
      'const second = 2;',
    );
  } finally {
    await peer.close();
  }
});

test('unknown languages remain available, empty search results do not edit, and plain text clears only the language', async ({
  page,
}) => {
  const id = await openDocument(
    page,
    '```madoc-script {1}\nkeep this content\n```',
  );
  const block = page.locator('.milkdown-code-block');
  const trigger = block.locator('.language-button');
  await block.hover();
  await trigger.click();
  await expect(
    page.getByRole('option', { name: 'madoc-script', exact: true }),
  ).toHaveAttribute('data-checked', 'true');
  const search = page.getByPlaceholder('搜索语言');
  await search.fill('not-a-real-language');
  await expect(page.getByText('没有匹配的语言')).toBeVisible();
  await search.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    await (await page.request.get(`/api/items/${id}/export.md`)).text(),
  ).toContain('```madoc-script {1}');
  await trigger.press('Enter');
  await page.getByRole('option', { name: '纯文本', exact: true }).click();
  await expect(trigger).toContainText('纯文本');
  await expect(trigger).toBeFocused();
  await expect
    .poll(
      async () =>
        await (await page.request.get(`/api/items/${id}/export.md`)).text(),
    )
    .toMatch(/``` \{1\}\nkeep this content/);
  await expect(block.locator('.madoc-code-highlight')).toHaveText(
    'keep this content',
  );
  await page.reload();
  await expect(trigger).toContainText('纯文本');
  await expect(block.locator('.cm-content')).toHaveText('keep this content');
  await expect(block.locator('.madoc-code-highlight')).toHaveText(
    'keep this content',
  );
  const exported = await (
    await page.request.get(`/api/items/${id}/export.md`)
  ).text();
  await openDocument(page, exported);
  await expect(trigger).toContainText('纯文本');
  await expect(block.locator('.madoc-code-highlight')).toHaveText(
    'keep this content',
  );
});

test('the project language picker fits a 320px viewport and remains read-only for viewers', async ({
  page,
  browser,
}, testInfo) => {
  const id = await openDocument(page, '```javascript\nconst value = 42;\n```');
  await page.setViewportSize({ width: 320, height: 740 });
  const trigger = page.locator('.language-button');
  await page.locator('.milkdown-code-block').hover();
  await trigger.click();
  const menu = page.locator('.mantine-Combobox-dropdown');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: testInfo.outputPath('code-language-320.png'),
    fullPage: true,
  });
  await page.getByPlaceholder('搜索语言').press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });
  const workspace = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const invite = await (
    await page.request.post(`/api/workspaces/${workspace}/invites`, {
      headers,
      data: { email: `language-viewer-${id}@example.test`, role: 'viewer' },
    })
  ).json();
  const context = await browser.newContext();
  try {
    const response = await context.request.post(
      `http://127.0.0.1:3100/api/invites/${invite.token}/accept`,
      {
        data: { name: 'Viewer', password: 'password123' },
      },
    );
    expect(response.ok()).toBeTruthy();
    const viewer = await context.newPage();
    const writes: string[] = [];
    viewer.on('websocket', (socket) => {
      socket.on('framesent', ({ payload }) => {
        const message = JSON.parse(String(payload)) as { type?: string };
        if (
          message.type === 'markdown.update' ||
          message.type === 'markdown.cache.update'
        )
          writes.push(String(payload));
      });
    });
    await viewer.goto(page.url());
    const content = viewer.locator('.cm-content');
    await expect(content).toHaveAttribute('aria-readonly', 'true');
    const persisted = await (
      await page.request.get(`/api/items/${id}/export.md`)
    ).text();
    const expectUnchanged = async () => {
      await expect(content).toHaveText('const value = 42;');
      await expect(page.locator('.cm-content')).toHaveText('const value = 42;');
      expect(
        await (await page.request.get(`/api/items/${id}/export.md`)).text(),
      ).toBe(persisted);
      expect(writes).toEqual([]);
    };
    await content.click();
    await expect(content).toBeFocused();
    await viewer.keyboard.press('End');
    await viewer.keyboard.type('UNAUTHORIZED_INPUT');
    await expectUnchanged();
    await viewer.keyboard.press('ControlOrMeta+a');
    await viewer.keyboard.press('Backspace');
    await expectUnchanged();
    await viewer.keyboard.press('Home');
    await viewer.keyboard.press('Backspace');
    await expectUnchanged();
    for (const shortcut of [
      'ControlOrMeta+Enter',
      'ControlOrMeta+z',
      'ControlOrMeta+y',
      'ControlOrMeta+Shift+z',
    ]) {
      await viewer.keyboard.press(shortcut);
      await expectUnchanged();
    }
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await viewer.evaluate(() =>
      navigator.clipboard.writeText('UNAUTHORIZED_PASTE'),
    );
    await content.click();
    await viewer.keyboard.press('ControlOrMeta+v');
    await expectUnchanged();
    await viewer.reload();
    await expect(content).toHaveAttribute('aria-readonly', 'true');
    await expectUnchanged();
    await viewer.locator('.milkdown-code-block').hover();
    await expect(viewer.locator('.language-button')).toBeDisabled();
    await expect(viewer.locator('.language-button')).toContainText(
      'JavaScript',
    );
    await expect(viewer.getByPlaceholder('搜索语言')).toHaveCount(0);
    await page.getByRole('button', { name: '进入阅读视图' }).click();
    await expect(trigger).toBeDisabled();
    await page.getByRole('button', { name: '返回编辑' }).click();
    await expect(trigger).toBeEnabled();
  } finally {
    await context.close();
  }
});

test('reading view preserves local undo and redo history while rejecting code shortcuts', async ({
  page,
}) => {
  const id = await openDocument(page, '```javascript\nconst value = 42;\n```');
  const block = page.locator('.milkdown-code-block');
  const trigger = block.locator('.language-button');
  const content = block.locator('.cm-content');
  await block.hover();
  await trigger.click();
  await page.getByPlaceholder('搜索语言').fill('python');
  await page.getByRole('option', { name: 'Python', exact: true }).click();
  await expect(trigger).toContainText('Python');
  await expect
    .poll(
      async () =>
        await (await page.request.get(`/api/items/${id}/export.md`)).text(),
    )
    .toContain('```Python');
  const before = await (
    await page.request.get(`/api/items/${id}/export.md`)
  ).text();
  await page.getByRole('button', { name: '进入阅读视图' }).click();
  await expect(trigger).toBeDisabled();
  await content.focus();
  await page.keyboard.press('Home');
  for (const shortcut of [
    'Backspace',
    'ControlOrMeta+Enter',
    'ControlOrMeta+z',
    'ControlOrMeta+y',
    'ControlOrMeta+Shift+z',
  ]) {
    await page.keyboard.press(shortcut);
    await expect(trigger).toContainText('Python');
    await expect(content).toHaveText('const value = 42;');
    expect(
      await (await page.request.get(`/api/items/${id}/export.md`)).text(),
    ).toBe(before);
  }
  await page.getByRole('button', { name: '返回编辑' }).click();
  await content.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(trigger).toContainText('JavaScript');
  await page.getByRole('button', { name: '进入阅读视图' }).click();
  await expect(trigger).toBeDisabled();
  await content.focus();
  for (const shortcut of ['ControlOrMeta+y', 'ControlOrMeta+Shift+z']) {
    await page.keyboard.press(shortcut);
    await expect(trigger).toContainText('JavaScript');
  }
  await page.getByRole('button', { name: '返回编辑' }).click();
  await content.focus();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(trigger).toContainText('Python');
  await expect(content).toHaveText('const value = 42;');
});

test('switching a highlighted language to plain text clears its syntax extension', async ({
  page,
}) => {
  const id = await openDocument(
    page,
    '```javascript\nconst value = "hello";\n```',
  );
  const block = page.locator('.milkdown-code-block');
  await expect
    .poll(() => block.locator('.cm-line span').count())
    .toBeGreaterThan(0);
  await block.hover();
  await block.locator('.language-button').click();
  await page.getByRole('option', { name: '纯文本', exact: true }).click();
  await expect(block.locator('.language-button')).toContainText('纯文本');
  await expect(block.locator('.language-button')).toBeFocused();
  await expect(block.locator('.cm-line span')).toHaveCount(0);
  await expect
    .poll(
      async () =>
        await (await page.request.get(`/api/items/${id}/export.md`)).text(),
    )
    .toContain('```\nconst value = "hello";');
});
