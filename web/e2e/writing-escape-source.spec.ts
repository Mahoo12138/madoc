import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

for (const [markdown, character] of [
  [String.raw`\*不是斜体\*`, '*'],
  [String.raw`\*\*不是粗体\*\*`, '*'],
  [String.raw`\# 不是标题`, '#'],
  [String.raw`\> 不是引用`, '>'],
  [String.raw`\- 不是列表项`, '-'],
  [String.raw`1\. 不是有序列表项`, '.'],
  [String.raw`\[不是链接\]\(https://example.com\)`, '['],
  [String.raw`反斜杠：\\`, '\\'],
]) {
  test(`only the current escape is editable and gray: ${markdown}`, async ({ page }) => {
    await openDocument(page, markdown);
    const editor = page.locator('.ProseMirror');
    await editor.locator('[data-markdown-escape]').first().click({ position: { x: 1, y: 8 } });
    const source = page.getByLabel('编辑转义文本源码');
    await expect(source).toBeFocused();
    await expect(source).toHaveValue('\\' + character);
    const marker = editor.locator('.madoc-escape-marker');
    await expect(marker).toHaveCount(1);
    await expect(marker).toHaveText('\\');
    const colors = await marker.evaluate((element) => ({
      slash: getComputedStyle(element).color,
      text: getComputedStyle(element.parentElement!).color,
    }));
    expect(colors.slash).not.toBe(colors.text);
    await source.fill(String.raw`\!`);
    await page.getByLabel('文档标题').click();
    await expect(source).toHaveCount(0);
    await expect(editor).toContainText('!');
    await page.reload();
    await editor.locator('[data-markdown-escape]').first().click({ position: { x: 1, y: 8 } });
    await expect(source).toHaveValue(String.raw`\!`);
  });
}

test('plain text stays rendered and moving to either end reveals only that escape', async ({ page }, testInfo) => {
  await openDocument(page, String.raw`\*中间文字\*`);
  const paragraph = page.locator('.ProseMirror p').first();
  const source = page.getByLabel('编辑转义文本源码');
  await paragraph.evaluate((element) => {
    const text = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!;
    element.closest<HTMLElement>('.ProseMirror')!.focus();
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await expect(source).toHaveCount(0);
  await paragraph.locator('[data-markdown-escape]').first().click({ position: { x: 1, y: 8 } });
  await expect(source).toHaveValue(String.raw`\*`);
  await expect(paragraph.locator('[data-markdown-escape]').last()).toBeVisible();
  await paragraph.screenshot({ path: testInfo.outputPath('local-gray-escape.png') });
  await source.evaluate((element: HTMLInputElement) => element.setSelectionRange(0, 0));
  await source.press('ArrowRight');
  await expect.poll(() => source.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(1);
  await source.press('ArrowRight');
  await source.press('ArrowRight');
  await expect(source).toHaveCount(0);
  await paragraph.locator('[data-markdown-escape]').last().click({ position: { x: 1, y: 8 } });
  await expect(source).toHaveValue(String.raw`\*`);
  await expect(paragraph.locator('[data-markdown-escape]').first()).toBeVisible();
  await expect(paragraph.locator('.madoc-escape-marker')).toHaveCount(1);
});

test('adjacent escaped stars remain separate edit targets', async ({ page }) => {
  await openDocument(page, String.raw`\*\*文字\*\*`);
  const paragraph = page.locator('.ProseMirror p').first();
  await paragraph.locator('[data-markdown-escape]').first().click({ position: { x: 1, y: 8 } });
  const source = page.getByLabel('编辑转义文本源码');
  await expect(source).toHaveValue(String.raw`\*`);
  await source.fill(String.raw`\!`);
  await source.evaluate((element: HTMLInputElement) => element.setSelectionRange(2, 2));
  await source.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(source).toHaveValue(String.raw`\*`);
  await source.fill(String.raw`\?`);
  await page.getByLabel('文档标题').click();
  await expect(paragraph).toHaveText('!?文字**');
});

test('local escape changes sync and undo without exposing the other end', async ({ page }) => {
  await openDocument(page, String.raw`\*共享\*`);
  const peer = await page.context().newPage();
  await peer.goto(page.url());
  for (const target of [page, peer]) {
    await target.locator('.ProseMirror [data-markdown-escape]').first().click({ position: { x: 1, y: 8 } });
  }
  const source = page.getByLabel('编辑转义文本源码');
  const peerSource = peer.getByLabel('编辑转义文本源码');
  await source.fill(String.raw`\!`);
  await expect(peerSource).toHaveValue(String.raw`\!`);
  await source.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(source).toHaveValue(String.raw`\*`);
  await expect(peerSource).toHaveValue(String.raw`\*`);
  await expect(page.locator('.madoc-escape-marker')).toHaveCount(1);
  await peer.close();
});
