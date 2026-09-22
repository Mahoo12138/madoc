import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

for (const markdown of ['**粗体文字**', '*斜体文字*', '***组合文字***', '`code`', '[链接](https://example.com)', '[**加粗链接**](https://example.com)', '$a+b=c$']) {
  test(`right-side whitespace places caret after all source: ${markdown}`, async ({ page }) => {
    await openDocument(page, markdown);
    const paragraph = page.locator('.ProseMirror p').first();
    const box = (await paragraph.boundingBox())!;
    const clickRight = () => page.mouse.click(box.x + box.width - 5, box.y + box.height / 2);
    await clickRight();
    const source = page.locator('.madoc-inline-source');
    await expect(source).toBeFocused();
    const caret = () => source.evaluate((input: HTMLInputElement) => ({ start: input.selectionStart, end: input.selectionEnd, length: input.value.length }));
    let selection = await caret();
    expect(selection.start).toBe(selection.length);
    expect(selection.end).toBe(selection.length);
    await source.evaluate((input: HTMLInputElement) => input.setSelectionRange(1, 1));
    await clickRight();
    await expect(source).toBeFocused();
    selection = await caret();
    expect(selection.start).toBe(selection.length);
    expect(selection.end).toBe(selection.length);
    await source.press('ArrowRight');
    await expect(source).toHaveCount(0);
    await page.keyboard.type('tail');
    await expect(paragraph).toContainText('tail');
    for (const marked of await paragraph.locator('strong, em, code, a, [data-type="math_inline"]').all()) {
      await expect(marked).not.toContainText('tail');
    }
  });
}


test('clicking after ordinary trailing text does not reopen the preceding mark', async ({ page }) => {
  await openDocument(page, '**粗体** 普通尾文');
  const paragraph = page.locator('.ProseMirror p').first();
  const box = (await paragraph.boundingBox())!;
  await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2);
  await expect(page.locator('.madoc-inline-source')).toHaveCount(0);
  await page.keyboard.type('tail');
  await expect(paragraph).toHaveText('粗体 普通尾文tail');
});
