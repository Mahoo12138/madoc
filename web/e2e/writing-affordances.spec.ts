import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

test('inline formula shows a live rendered preview below its source', async ({ page }) => {
  await openDocument(page, '测试 $x^2$ 文本');
  await page.locator('[data-type="math_inline"]').click();
  const source = page.getByLabel('编辑行内公式');
  const preview = page.getByRole('tooltip', { name: '公式预览' });
  await expect(preview.locator('.katex')).toBeVisible();
  await source.fill('$\\frac{a}{b}$');
  await expect(preview.locator('annotation')).toHaveText('\\frac{a}{b}');
  const inputBox = (await source.boundingBox())!;
  const previewBox = (await preview.boundingBox())!;
  expect(previewBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);
  await page.getByLabel('文档标题').click();
  await expect(preview).toBeHidden();
});

for (const [syntax, selector, label] of [
  ['**粗体**', 'strong', '编辑加粗源码'],
  ['*斜体*', 'em', '编辑斜体源码'],
  ['`代码`', 'code', '编辑行内代码源码'],
  ['$x^2$', '[data-type="math_inline"]', '编辑行内公式'],
] as const) {
  for (const side of ['start', 'end'] as const) {
    test(`${label}: selection at the ${side} boundary opens source`, async ({ page }) => {
      await openDocument(page, `测试${syntax}文本`);
      await page.locator(`.ProseMirror ${selector}`).evaluate((element, boundary) => {
        const editor = element.closest<HTMLElement>('.ProseMirror')!;
        editor.focus();
        const text = boundary === 'start' ? element.previousSibling! : element.nextSibling!;
        const range = document.createRange();
        range.setStart(text, boundary === 'start' ? text.textContent!.length : 0);
        range.collapse(true);
        document.getSelection()!.removeAllRanges();
        document.getSelection()!.addRange(range);
      }, side);
      await expect(page.getByLabel(label)).toBeFocused();
      await page.getByLabel('文档标题').click();
      const box = (await page.locator(`.ProseMirror ${selector}`).boundingBox())!;
      // Click on the adjacent unformatted character's edge, not inside the mark.
      await page.mouse.click(side === 'start' ? box.x - 1 : box.x + box.width + 1, box.y + box.height / 2);
      await expect(page.getByLabel(label)).toBeFocused();
    });
  }
  if (selector === '[data-type="math_inline"]') continue;
  test(`${label}: source retains its typography and has no estimated trailing gap`, async ({ page }) => {
    await openDocument(page, `测试${syntax}文本`);
    const rendered = page.locator(`.ProseMirror ${selector}`);
    const typography = await rendered.evaluate((element) => {
      const style = getComputedStyle(element);
      return { weight: style.fontWeight, style: style.fontStyle, family: style.fontFamily };
    });
    await rendered.click();
    const source = page.getByLabel(label);
    const actual = await source.evaluate((element: HTMLInputElement) => {
      const style = getComputedStyle(element);
      const measure = document.createElement('span');
      for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontFeatureSettings'] as const) measure.style[key] = style[key];
      measure.style.letterSpacing = style.letterSpacing;
      measure.style.whiteSpace = 'pre';
      measure.textContent = element.value;
      document.body.append(measure);
      const gap = element.clientWidth - measure.getBoundingClientRect().width;
      measure.remove();
      const following = document.createRange();
      following.selectNodeContents(element.closest('p')!.lastChild!);
      const trailingGap = following.getBoundingClientRect().left - element.getBoundingClientRect().right;
      return { weight: style.fontWeight, style: style.fontStyle, family: style.fontFamily, gap, trailingGap };
    });
    expect.soft(actual.weight).toBe(typography.weight);
    expect.soft(actual.style).toBe(typography.style);
    expect.soft(actual.family).toBe(typography.family);
    expect(actual.gap).toBeLessThanOrEqual(2);
    expect(actual.gap).toBeGreaterThanOrEqual(0);
    expect(actual.trailingGap).toBeLessThanOrEqual(2);
  });
}

test('source inherits combined marks and drops them when delimiters are removed', async ({ page }) => {
  await openDocument(page, '测试***粗斜体***文本');
  await page.locator('.ProseMirror em').click();
  const source = page.locator('.madoc-inline-source');
  await expect(source).toHaveCSS('font-weight', '700');
  await expect(source).toHaveCSS('font-style', 'italic');
  await source.fill('普通文字');
  await expect(source).toHaveCSS('font-weight', '400');
  await expect(source).toHaveCSS('font-style', 'normal');
});

test('inline editing stays visually compact on desktop and mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDocument(page, '测试**粗体**文本，*斜体文字*与`行内代码`。\n\n行内公式：$x^2+y^2=z^2$，输入时显示预览。');
  await expect(page).toHaveTitle(/madoc/);
  await expect(page).toHaveURL(/\/workspace\//);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.locator('.ProseMirror strong').click();
  await expect(page.getByLabel('编辑加粗源码')).toBeFocused();
  await page.screenshot({ path: '/tmp/madoc-inline-bold-desktop.png' });
  await page.getByLabel('文档标题').click();
  await page.locator('.ProseMirror [data-type="math_inline"]').click();
  await expect(page.getByRole('tooltip', { name: '公式预览' }).locator('.katex')).toBeVisible();
  await page.screenshot({ path: '/tmp/madoc-inline-math-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const preview = page.getByRole('tooltip', { name: '公式预览' });
  await expect(preview).toBeVisible();
  await expect.poll(async () => {
    const box = (await preview.boundingBox())!;
    return box.x >= 0 && box.x + box.width <= 390;
  }).toBeTruthy();
  await page.screenshot({ path: '/tmp/madoc-inline-math-mobile.png' });
  expect(errors).toEqual([]);
});
