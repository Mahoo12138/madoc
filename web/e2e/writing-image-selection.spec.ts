import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

for (const inline of [false, true]) {
  test(`image source mouse selection does not drag the ${inline ? 'inline' : 'block'} image`, async ({ page }) => {
    await page.route('**/selection.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><rect width="320" height="100" fill="#ddd"/></svg>' }));
    const markdown = '![description](/selection.svg "title")';
    await openDocument(page, inline ? `before ${markdown} after` : markdown);
    const image = page.locator('.madoc-image-source-view');
    await image.locator(inline ? 'img' : '.image-wrapper').click();
    const source = image.getByLabel('编辑图片 Markdown 源码');
    await expect(source).toBeFocused();
    await image.evaluate((element) => {
      element.dataset.drags = '0';
      element.addEventListener('dragstart', (event) => {
        if (!event.defaultPrevented) element.dataset.drags = String(Number(element.dataset.drags) + 1);
      });
    });
    // Wait for the source to finish laying out and drag across its first line.
    // The textarea center can lie on a wrap boundary (or a short last line).
    await source.click({ trial: true });
    const box = (await source.boundingBox())!;
    const firstLine = await source.evaluate(element => {
      const style = getComputedStyle(element);
      return parseFloat(style.paddingTop) + parseFloat(style.lineHeight) / 2;
    });
    await source.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 0));
    await page.mouse.move(box.x + 3, box.y + firstLine);
    await page.mouse.down();
    await page.mouse.move(box.x + 110, box.y + firstLine, { steps: 12 });
    await page.mouse.up();
    await expect(image).toHaveAttribute('data-drags', '0');
    expect(await source.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBeGreaterThan(5);
    // Starting over an existing text selection must not lift the image either.
    await page.mouse.move(box.x + 20, box.y + firstLine);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + firstLine, { steps: 12 });
    await page.mouse.up();
    await expect(image).toHaveAttribute('data-drags', '0');
    await expect(source).toHaveValue(markdown);
    await expect(image).toHaveCount(1);
    // Dragging from the image itself remains available after source selection.
    const preview = image.locator(inline ? 'img' : '.image-wrapper');
    const previewBox = (await preview.boundingBox())!;
    await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(previewBox.x + previewBox.width / 2 + 50, previewBox.y + previewBox.height / 2 + 20, { steps: 10 });
    await expect(image).toHaveAttribute('data-drags', '1');
    await page.keyboard.press('Escape');
    await page.mouse.up();
  });
}
