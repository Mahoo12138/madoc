import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

test('consecutive dividers show only the gap cursor, then restore the text caret', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openDocument(page, '---\n\n---\n\n---');
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('hr')).toHaveCount(3);
  await editor.evaluate((element: HTMLElement) => {
    element.focus();
    const range = document.createRange();
    range.setStartAfter(element.querySelector('hr')!);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect(editor.locator('.ProseMirror-gapcursor')).toHaveCSS('display', 'block');
  await expect(editor).toHaveClass(/ProseMirror-hideselection/);
  await expect(editor).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');
  const gap = editor.locator('.ProseMirror-gapcursor');
  const appearance = await gap.evaluate((element) => {
    const style = getComputedStyle(element);
    const caret = getComputedStyle(element, '::after');
    return {
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
      borderTop: caret.borderTopWidth,
      borderLeft: caret.borderLeftWidth,
      color: caret.borderLeftColor,
      expectedColor: getComputedStyle(document.querySelector<HTMLInputElement>('[aria-label="文档标题"]')!).caretColor,
    };
  });
  expect(appearance.height).toBeGreaterThanOrEqual(appearance.lineHeight);
  expect(appearance.borderTop).toBe('0px');
  expect(appearance.borderLeft).toBe('1px');
  expect(appearance.color).toBe(appearance.expectedColor);
  await page.screenshot({ path: '/tmp/madoc-divider-gap.png' });
  const followingDividerY = (await editor.locator('hr').nth(1).boundingBox())!.y;
  await page.keyboard.type('after divider');
  await expect(editor).toContainText('after divider');
  await expect(editor.locator('.ProseMirror-gapcursor')).toHaveCount(0);
  await expect(editor).not.toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');
  await expect(editor.locator('hr')).toHaveCount(3);
  expect((await editor.locator('hr').nth(1).boundingBox())!.y).toBeCloseTo(followingDividerY, 1);
  await page.screenshot({ path: '/tmp/madoc-divider-text.png' });
  expect(errors).toEqual([]);
});

test('the temporary insertion line follows navigation and collapses on blur without changing Markdown', async ({ page }) => {
  const id = await openDocument(page, '---\n\n---\n\n---\n\n---');
  const editor = page.locator('.ProseMirror');
  const dividers = editor.locator('hr');
  await expect(dividers).toHaveCount(4);
  const originalMarkdown = await (await page.request.get(`/api/items/${id}/export.md`)).text();
  const initialDistance = (await dividers.nth(1).boundingBox())!.y - (await dividers.first().boundingBox())!.y;
  await editor.evaluate((element: HTMLElement) => {
    element.focus();
    const range = document.createRange();
    range.setStartAfter(element.querySelector('hr')!);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  const gap = editor.locator('.ProseMirror-gapcursor');
  await expect(gap).toBeVisible();
  const distance = (await dividers.nth(1).boundingBox())!.y - (await dividers.first().boundingBox())!.y;
  expect(distance).toBeGreaterThan(initialDistance + 28);

  // Move across the next divider using real keys, then open its following gap.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(gap).toBeVisible();
  await expect.poll(() => gap.evaluate((element) => Array.from(element.parentElement!.querySelectorAll('hr')).indexOf(element.previousElementSibling as HTMLHRElement))).toBe(1);
  await expect(gap).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(gap).toBeVisible();
  await page.screenshot({ path: '/tmp/madoc-divider-gap-mobile.png' });

  // Clicking the opened line keeps this insertion position usable.
  const bounds = (await gap.boundingBox())!;
  await page.mouse.click(bounds.x + 8, bounds.y + bounds.height / 2);
  await expect(gap).toBeVisible();
  await page.getByLabel('文档标题').click();
  await expect(gap).toBeHidden();
  const collapsedDistance = (await dividers.nth(1).boundingBox())!.y - (await dividers.first().boundingBox())!.y;
  expect(collapsedDistance).toBeCloseTo(initialDistance, 1);
  await expect(dividers).toHaveCount(4);
  const exportedMarkdown = await (await page.request.get(`/api/items/${id}/export.md`)).text();
  // Milkdown canonicalizes --- to ***; ignore that unrelated normalization.
  const dividerLines = (text: string) => text.trim().split(/\n+/).map((line) => line.replace(/\*/g, '-'));
  expect(dividerLines(exportedMarkdown)).toEqual(dividerLines(originalMarkdown));
});
