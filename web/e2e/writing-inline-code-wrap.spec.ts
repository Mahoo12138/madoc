import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';

const code =
  'this_is_a_very_long_inline_code_identifier_without_spaces_for_testing_overflow_wrapping_and_horizontal_layout_behavior_in_a_markdown_preview_'.repeat(4);

async function expectContained(page: Page, container: Locator) {
  const size = await container.evaluate((element) => ({
    client: element.clientWidth, scroll: element.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
  const documentSize = await page.evaluate(() => ({
    client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
  }));
  expect(documentSize.scroll).toBeLessThanOrEqual(documentSize.client + 1);
}

for (const width of [1280, 390]) {
  for (const [name, markdown] of [
    ['paragraph', `前文 \`${code}\` 后文`],
    ['quote', `> 引用 \`${code}\` 后文`],
    ['list', `- 列表 \`${code}\` 后文`],
  ]) {
    test(`long inline code wraps within its container: ${name} ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const id = await openDocument(page, markdown);
      const editor = page.locator('.ProseMirror');
      const rendered = editor.locator('code');
      const paragraph = editor.locator('p').filter({ has: page.locator('code') });
      await expect(rendered).toHaveText(code);
      await expectContained(page, paragraph);
      const lines = await rendered.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const parent = element.closest('p')!.getBoundingClientRect();
        return [...range.getClientRects()].map((rect) => ({
          left: rect.left - parent.left, right: rect.right - parent.right, top: rect.top,
        }));
      });
      expect(new Set(lines.map((line) => line.top)).size).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line.left).toBeGreaterThanOrEqual(-1);
        expect(line.right).toBeLessThanOrEqual(1);
      }
      if (name === 'paragraph') await paragraph.screenshot({ path: testInfo.outputPath(`wrapped-${width}.png`) });
      await rendered.click({ position: { x: 10, y: 8 } });
      const source = page.getByLabel('编辑行内代码源码');
      await expect(source).toHaveValue('`' + code + '`');
      await expectContained(page, editor);
      const bounds = await source.boundingBox();
      const parentBounds = await paragraph.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(parentBounds!.x + parentBounds!.width + 1);
      await source.fill('`' + code + 'edited`');
      await expectContained(page, editor);
      await page.setViewportSize({ width: width === 1280 ? 390 : 1280, height: 844 });
      await expectContained(page, editor);
      await page.getByLabel('文档标题').click();
      await expect(rendered).toHaveText(code + 'edited');
      await expectContained(page, paragraph);
      await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('`' + code + 'edited`');
      await page.reload();
      await expect(rendered).toHaveText(code + 'edited');
      await expectContained(page, paragraph);
    });
  }
}
