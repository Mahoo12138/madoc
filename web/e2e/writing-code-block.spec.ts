import { expect, test, type Locator } from '@playwright/test';
import { openDocument } from './helpers/writing';

async function expectFloatingTools(block: Locator) {
  const panel = (await block.boundingBox())!;
  const language = (await block.locator('.language-button').boundingBox())!;
  const copy = (await block.locator('.copy-button').boundingBox())!;
  const firstLine = (await block.locator('.cm-line').first().boundingBox())!;
  expect(language.y).toBeGreaterThanOrEqual(panel.y + panel.height);
  expect(language.x + language.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
  expect(copy.y - panel.y).toBeLessThanOrEqual(10);
  expect(copy.x + copy.width).toBeLessThanOrEqual(panel.x + panel.width);
  expect(copy.y + copy.height).toBeLessThanOrEqual(panel.y + panel.height);
  expect(firstLine.y - panel.y).toBeLessThan(20);
  await expect(block).toHaveCSS('margin-bottom', '24px');
  await expect(block.locator('.tools')).toHaveCSS('position', 'absolute');
  for (const gutter of await block.locator('.cm-activeLineGutter').all()) {
    await expect(gutter).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await expect(block.locator('.cm-lineNumbers .cm-activeLineGutter')).toHaveCSS('font-weight', '400');
  await expect(block.locator('.cm-activeLine')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
}

test('code tools float outside/inside the panel without adding a header row', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 800 });
  const content = 'console.log("hello world");\nconst answer = 42;';
  const id = await openDocument(page, `\`\`\`javascript\n${content}\n\`\`\`\n\n代码块之后的正文。`);
  await expect(page).toHaveTitle(/madoc/);
  await expect(page).toHaveURL(/\/workspace\//);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  const block = page.locator('.milkdown-code-block');
  await block.hover();
  await expectFloatingTools(block);
  const initialHeight = (await block.boundingBox())!.height;
  const copy = block.getByRole('button', { name: '复制代码' });
  await copy.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(content);

  const language = block.locator('.language-button');
  await language.focus();
  await language.press('Enter');
  await expect(block.getByPlaceholder('搜索语言')).toBeFocused();
  await block.getByPlaceholder('搜索语言').fill('typescript');
  await block.locator('[data-language="TypeScript"]').click();
  await expect(language).toContainText('TypeScript');
  await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toMatch(/```typescript/i);
  expect((await block.boundingBox())!.height).toBe(initialHeight);
  await page.reload();
  await expect(language).toContainText('TypeScript');
  await expect(block.locator('.cm-content')).toContainText('const answer = 42;');
  await block.locator('.cm-line').first().click();
  await page.keyboard.press('ArrowDown');
  await expect(block.locator('.cm-lineNumbers .cm-activeLineGutter')).toHaveText('2');
  await block.hover();
  await expectFloatingTools(block);
  await expect(language).toHaveCSS('opacity', '1');
  await expect(copy).toHaveCSS('opacity', '1');
  const box = (await block.boundingBox())!;
  await page.screenshot({ path: '/tmp/madoc-code-block-desktop.png', clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 52 } });

  await page.setViewportSize({ width: 390, height: 844 });
  await language.click();
  await expect(block.getByPlaceholder('搜索语言')).toBeFocused();
  await expectFloatingTools(block);
  const menu = (await block.locator('.list-wrapper').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/tmp/madoc-code-block-mobile.png' });
  await block.getByPlaceholder('搜索语言').fill('not-a-real-language');
  await expect(block.getByText('没有匹配的语言')).toBeVisible();
  await page.getByLabel('文档标题').click();
  await expect(block.locator('.list-wrapper')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('empty code blocks keep a full editable line beside the overlaid copy control', async ({ page }) => {
  await openDocument(page, '```\n\n```\n\n后续正文');
  const block = page.locator('.milkdown-code-block');
  await block.locator('.cm-content').click();
  await expectFloatingTools(block);
  await page.keyboard.type('hello');
  await expect(block.locator('.cm-content')).toHaveText('hello');
  await expect(block.locator('.language-button')).toHaveCSS('opacity', '1');
});

test('touch users can discover both controls without hover or editor focus', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openDocument(page, '```javascript\nconsole.log(42);\n```');
  const block = page.locator('.milkdown-code-block');
  await expect(block.locator('.language-button')).toHaveCSS('opacity', '1');
  await expect(block.locator('.copy-button')).toHaveCSS('opacity', '1');
  await block.locator('.language-button').tap();
  await expect(block.getByPlaceholder('搜索语言')).toBeVisible();
  await context.close();
});
