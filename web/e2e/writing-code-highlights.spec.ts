import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { highlightedCodeLines } from '../src/features/markdown/markdown-code-lines';

const code = `function add(
  a: Ref<number> | number,
  b: Ref<number> | number
) {
  return computed(() => unref(a) + unref(b))
}`;

for (const [meta, expected] of [
  ['{2,3}', [2, 3]], ['{2-4,6}', [2, 3, 4, 6]],
  ['title="add.ts" {2, 3,2}', [2, 3]], ['{0,4-2,99}', []],
  ['{2,nope}', []], ['{2-9007199254740991}', [2, 3, 4, 5, 6]],
  ['{9007199254740992}', []], ['{2} {4}', [2, 4]], ['', []],
] as const) {
  test(`line highlight metadata: ${meta}`, () => {
    expect(highlightedCodeLines(meta, 6)).toEqual(expected);
  });
}

test('fence line highlights survive editing, language changes, export and reload', async ({ page }, testInfo) => {
  const id = await openDocument(page, '```ts {2,3}\n' + code + '\n```');
  const block = page.locator('.milkdown-code-block');
  await expect(block.locator('.cm-line').first()).toBeVisible();
  const lines = block.locator('.cm-line');
  const highlighted = block.locator('.madoc-code-highlight');
  await expect(highlighted).toHaveText(['  a: Ref<number> | number,', '  b: Ref<number> | number']);
  await expect(lines.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(await highlighted.first().evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await lines.first().click();
  await page.keyboard.press('Home');
  await page.keyboard.type('// ');
  await expect(highlighted).toHaveCount(2);
  await expect(lines.first()).toContainText('// function add(');
  await page.keyboard.press('ArrowDown');
  await expect(highlighted).toHaveCount(2);
  await block.hover();
  await block.locator('.language-button').click();
  await block.getByPlaceholder('搜索语言').fill('javascript');
  await block.locator('[data-language="JavaScript"]').click();
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toMatch(/```javascript \{2,3\}/i);
  await page.getByLabel('文档标题').click();
  await expect(highlighted).toHaveCount(2);
  await block.screenshot({ path: testInfo.outputPath('explicit-code-lines.png') });
  await page.reload();
  await expect(highlighted).toHaveCount(2);
  await expect(lines.first()).toContainText('// function add(');
  const exported = await (await page.request.get(`/api/items/${id}/export.md`)).text();
  await openDocument(page, exported);
  await expect(highlighted).toHaveText(['  a: Ref<number> | number,', '  b: Ref<number> | number']);
});

test('highlights track line numbers after inserting lines and sync to another editor', async ({ page }) => {
  await openDocument(page, '```ts {2-3}\none\ntwo\nthree\nfour\n```');
  const peer = await page.context().newPage();
  await peer.goto(page.url());
  await expect(peer.locator('.madoc-code-highlight')).toHaveText(['two', 'three']);
  await page.locator('.cm-line').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.locator('.madoc-code-highlight')).toHaveText(['one', 'two']);
  await expect(peer.locator('.madoc-code-highlight')).toHaveText(['one', 'two']);
  await peer.close();
});

test('unknown metadata stays in Markdown and plain blocks never highlight the active row', async ({ page }) => {
  const id = await openDocument(page, '```ts title="sample" {bad}\none\ntwo\n```\n\n```ts\na\nb\n```');
  const blocks = page.locator('.milkdown-code-block');
  for (const block of await blocks.all()) {
    await block.locator('.cm-line').first().click();
    await expect(block.locator('.cm-activeLine')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(block.locator('.madoc-code-highlight')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await expect(block.locator('.cm-activeLine')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await page.keyboard.type('!');
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('title="sample" {bad}');
});

test('code highlights preserve the existing block-math serializer', async ({ page }) => {
  const id = await openDocument(page, '```ts {1}\nconst n = 1\n```\n\n$$\na+b\n$$');
  await expect(page.locator('.madoc-code-highlight')).toHaveText('const n = 1');
  await page.locator('.milkdown-code-block').first().locator('.cm-line').click();
  await page.keyboard.press('End');
  await page.keyboard.type(';');
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('const n = 1;');
  const markdown = await (await page.request.get(`/api/items/${id}/export.md`)).text();
  expect(markdown).toContain('```ts {1}');
  expect(markdown).toMatch(/\$\$\s+a\+b\s+\$\$/);
});
