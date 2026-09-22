import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

const cases = [
  [String.raw`\*不是斜体\*`, '*不是斜体*'],
  [String.raw`\*\*不是粗体\*\*`, '**不是粗体**'],
  [String.raw`\# 不是标题`, '# 不是标题'],
  [String.raw`\> 不是引用`, '> 不是引用'],
  [String.raw`\- 不是列表项`, '- 不是列表项'],
  [String.raw`1\. 不是有序列表项`, '1. 不是有序列表项'],
  [String.raw`[不是链接]\(https://example.com\)`, '[不是链接](https://example.com)'],
  [String.raw`反斜杠：\\`, '反斜杠：\\'],
] as const;

for (const [markdown, expected] of cases) {
  test(`escaped punctuation stays literal when edited: ${markdown}`, async ({ page }) => {
    await openDocument(page, markdown);
    const editor = page.locator('.ProseMirror');
    await expect(editor.locator('p').first()).toHaveText(expected);
    await expect(editor.locator('strong, em, h1, blockquote, ul, ol, a')).toHaveCount(0);
    // Edit next to a closing delimiter, where auto-pair promotion used to
    // reinterpret the decoded escaped text as new Markdown.
    await editor.locator('p').first().evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      while (walker.nextNode()) texts.push(walker.currentNode as Text);
      const last = texts.at(-1)!;
      element.closest<HTMLElement>('.ProseMirror')!.focus();
      const range = document.createRange();
      range.setStart(last, Math.max(0, last.length - 1));
      range.collapse(true);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    });
    await page.keyboard.insertText('新');
    await page.getByLabel('文档标题').click();
    await expect(editor.locator('strong, em, h1, blockquote, ul, ol, a')).toHaveCount(0);
    await expect(editor.locator('p').first()).toHaveText(expected.slice(0, -1) + '新' + expected.slice(-1));
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.reload();
    await expect(editor.locator('strong, em, h1, blockquote, ul, ol, a')).toHaveCount(0);
    await expect(editor.locator('p').first()).toContainText('新');
  });
}

for (const [markdown, expected] of cases) {
  test(`typing escapes stays literal: ${markdown}`, async ({ page }) => {
    const id = await openDocument(page);
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await page.keyboard.type(markdown);
    await page.getByLabel('文档标题').click();
    await expect(editor.locator('p').first()).toHaveText(expected);
    await expect(editor.locator('strong, em, h1, blockquote, ul, ol, a')).toHaveCount(0);
    await expect.poll(async () => (await (await page.request.get(`/api/items/${id}/export.md`)).text())).toContain('\\');
    await page.reload();
    await expect(editor.locator('p').first()).toHaveText(expected);
    const exported = await (await page.request.get(`/api/items/${id}/export.md`)).text();
    await openDocument(page, exported);
    await expect(editor.locator('p').first()).toHaveText(expected);
    await expect(editor.locator('strong, em, h1, blockquote, ul, ol, a')).toHaveCount(0);
  });
}

test('escaped punctuation coexists with real formatting, entities and code', async ({ page }) => {
  await openDocument(page, String.raw`&amp; \*literal\* **bold** \_literal\_ *italic* \\ **more**` + '\n\n' + '`\\*code\\*`' + '\n\n```text\n\\*block\\*\n```');
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('strong')).toHaveText(['bold', 'more']);
  await expect(editor.locator('em')).toHaveText('italic');
  await expect(editor.locator('p code')).toHaveText('\\*code\\*');
  await expect(editor.locator('.cm-content')).toContainText('\\*block\\*');
  await expect(editor.locator('p').first()).toHaveText('& *literal* bold _literal_ italic \\ more');
  await page.reload();
  await expect(editor.locator('strong')).toHaveText(['bold', 'more']);
});


test('backslash parity, literal deletion and normal Markdown typing', async ({ page }) => {
  await openDocument(page);
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type(String.raw`\(\)`);
  await editor.locator('[data-markdown-escape]').first().evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.setEnd(element.firstChild!, 1);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Backspace');
  await expect(editor.locator('p')).toHaveText(')');
  await openDocument(page);
  await editor.click();
  await page.keyboard.type(String.raw`\\\*literal\*`);
  await page.keyboard.press('Enter');
  await page.keyboard.type('**bold**');
  await page.getByLabel('文档标题').click();
  await expect(editor.locator('p').first()).toHaveText('\\*literal*');
  await expect(editor.locator('strong')).toHaveText('bold');
});

test('literal escapes sync, undo and render without source widgets', async ({ page }, testInfo) => {
  await openDocument(page, cases.map(([markdown]) => markdown).join('\n\n'));
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('p')).toHaveText(cases.map(([, expected]) => expected));
  await expect(editor.locator('strong, em, a, .madoc-inline-source')).toHaveCount(0);
  await editor.screenshot({ path: testInfo.outputPath('escaped-text.png') });
  const peer = await page.context().newPage();
  await peer.goto(page.url());
  await expect(peer.locator('.ProseMirror p')).toHaveText(cases.map(([, expected]) => expected));
  const punctuation = editor.locator('[data-markdown-escape]').first();
  await punctuation.evaluate((element) => {
    element.closest<HTMLElement>('.ProseMirror')!.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Backspace');
  const peerText = () => peer.locator('.ProseMirror p').first().evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('.madoc-remote-cursor').forEach((cursor) => cursor.remove());
    return copy.textContent;
  });
  await expect.poll(peerText).toBe('不是斜体*');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect.poll(peerText).toBe('*不是斜体*');
  await expect(editor.locator('.madoc-inline-source')).toHaveCount(0);
  await peer.close();
});

test('ordinary bare URLs, explicit links and escaped URLs keep distinct meanings', async ({ page }) => {
  await openDocument(page, String.raw`https://example.com

[link](https://example.com)

https\://example.com`);
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('a')).toHaveCount(2);
  await expect(editor.locator('p').last()).toHaveText('https://example.com');
  await expect(editor.locator('p').last().locator('a')).toHaveCount(0);
});

test('multiline quote escapes survive normalized source positions and editing', async ({ page }) => {
  await openDocument(page, '> \\*first\\*\r\n> \\*second\\*');
  const paragraph = page.locator('.ProseMirror blockquote p');
  await expect(paragraph).toHaveText('*first*\n*second*');
  await paragraph.locator('[data-markdown-escape]').last().evaluate((element) => {
    element.closest<HTMLElement>('.ProseMirror')!.focus();
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.insertText('new');
  await page.getByLabel('文档标题').click();
  await expect(paragraph).toHaveText('*first*\n*secondnew*');
  await expect(paragraph.locator('em, strong')).toHaveCount(0);
});
