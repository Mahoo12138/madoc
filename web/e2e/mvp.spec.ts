import { expect, test, type Locator } from '@playwright/test';

test('first run, invite, collaborative Markdown, whiteboard and export', async ({ page, browser }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await page.getByLabel('姓名').fill('Owner');
  await page.getByLabel('邮箱').fill('owner@example.test');
  await page.getByLabel('密码').fill('password123');
  await page.getByRole('button', { name: '创建并进入' }).click();
  await page.getByRole('button', { name: '新建 Workspace' }).click();
  await page.getByLabel('名称').fill('Project Atlas');
  await page.getByRole('button', { name: '创建', exact: true }).click();

  await page.getByRole('button', { name: '新建文档' }).click();
  const documentTitle = page.getByLabel('名称');
  await documentTitle.pressSequentially('Architecture');
  await expect(documentTitle).toHaveValue('Architecture');
  expect(pageErrors).toEqual([]);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  const documentURL = page.url();
  const editor = page.locator('.ProseMirror');
  const placeCaretAtLineEnd = async (line: Locator) => {
    await line.evaluate((element) => {
      const selection = document.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      (element.closest('.ProseMirror') as HTMLElement | null)?.focus();
    });
  };
  await editor.click();
  await editor.pressSequentially('# System overview');
  await editor.press('Enter');
  await editor.pressSequentially('Collaborative Markdown works.');
  await expect(editor.locator('h1')).toHaveText('System overview');
  await expect(editor.locator('p').filter({ hasText: 'Collaborative Markdown works.' })).toHaveCount(1);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ProseMirror h1')).toHaveText('System overview');
  await expect(page.locator('.ProseMirror p').filter({ hasText: 'Collaborative Markdown works.' })).toHaveCount(1);
  const contentParagraph = page.locator('.ProseMirror p').filter({ hasText: 'Collaborative Markdown works.' });
  await contentParagraph.click();
  await editor.press('End');
  await editor.press('Enter');
  for (const [level, text] of [[2, 'Heading two'], [3, 'Heading three'], [4, 'Heading four'], [5, 'Heading five'], [6, 'Heading six']] as const) {
    await editor.pressSequentially(`${'#'.repeat(level)} ${text}`);
    if (level !== 6) await editor.press('Enter');
  }
  for (const [level, size] of [[1, 32], [2, 24], [3, 20], [4, 18], [5, 16], [6, 14]] as const) {
    await expect(editor.locator(`h${level}`)).toHaveCount(1);
    await expect(editor.locator(`h${level}`)).toHaveCSS('font-size', `${size}px`);
  }
  await editor.press('End');
  await editor.press('Enter');
  await editor.pressSequentially('**bold** and *italic*');
  await expect(editor.locator('strong')).toHaveText('bold');
  await expect(editor.locator('em')).toHaveText('italic');
  const strong = editor.locator('strong');
  const strongBox = await strong.boundingBox();
  if (!strongBox) throw new Error('Bold mark is not visible');
  for (const x of [1, strongBox.width / 2, Math.max(1, strongBox.width - 1)]) {
    await strong.click({ position: { x, y: strongBox.height / 2 } });
    await page.mouse.move(0, 0);
    const activeStrong = editor.locator('.madoc-active-mark[data-mark-name="strong"]');
    await expect(activeStrong).toHaveCount(1);
    await expect.poll(() => activeStrong.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('"**"');
    await expect.poll(() => activeStrong.evaluate((element) => getComputedStyle(element, '::after').content)).toBe('"**"');
  }
  const italic = editor.locator('em');
  const italicBox = await italic.boundingBox();
  if (!italicBox) throw new Error('Italic mark is not visible');
  await italic.click({ position: { x: italicBox.width / 2, y: italicBox.height / 2 } });
  await page.mouse.move(0, 0);
  const activeItalic = editor.locator('.madoc-active-mark[data-mark-name="em"]');
  await expect(activeItalic).toHaveCount(1);
  await expect.poll(() => activeItalic.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('"*"');
  await expect.poll(() => activeItalic.evaluate((element) => getComputedStyle(element, '::after').content)).toBe('"*"');

  await placeCaretAtLineEnd(editor.locator('p').filter({ hasText: 'bold' }));
  await page.keyboard.press('Enter');
  await editor.pressSequentially('``inline ` code``');
  const inlineCode = editor.locator('code');
  await expect(inlineCode).toHaveText('inline ` code');

  await placeCaretAtLineEnd(editor.locator('p').filter({ hasText: 'inline ` code' }));
  await page.keyboard.press('Enter');
  await editor.pressSequentially('```typescript');
  await editor.press('Enter');
  const codeBlock = editor.locator('.milkdown-code-block');
  await expect(codeBlock).toHaveCount(1);
  await codeBlock.locator('.cm-content').pressSequentially('const answer = 42;');
  await expect(codeBlock).toContainText('const answer = 42;');
  const languageButton = codeBlock.locator('.language-button');
  await expect(languageButton).toHaveCSS('opacity', '0');
  const codeBlockHeight = await codeBlock.evaluate((element) => Math.round(element.getBoundingClientRect().height));
  await codeBlock.hover();
  await expect(languageButton).toHaveCSS('opacity', '1');
  await expect.poll(() => codeBlock.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(codeBlockHeight);
  await page.screenshot({ path: '/tmp/madoc-mvp-final.png', fullPage: true });

  await page.getByRole('button', { name: '成员管理' }).click();
  await page.getByRole('tab', { name: '邀请' }).click();
  await page.getByPlaceholder('member@example.com').fill('member@example.test');
  await page.getByRole('button', { name: '创建链接' }).click();
  await expect(page.locator('input[readonly]')).toHaveCount(3);
  const inviteLink = await page.locator('input[readonly]').last().inputValue();
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto(inviteLink);
  await member.getByLabel('姓名').fill('Member');
  await member.getByLabel('设置密码').fill('password123');
  await member.getByRole('button', { name: '接受邀请' }).click();
  await member.getByText('Architecture', { exact: true }).click();
  await member.locator('.ProseMirror').click();
  await member.locator('.ProseMirror').press('End');
  await expect(page.locator('.ProseMirror .madoc-remote-cursor')).toHaveCount(1);
  await expect(page.locator('.ProseMirror .ProseMirror-yjs-cursor')).toHaveCount(0);

  await page.goto(documentURL);
  await page.locator('.ProseMirror').click();
  await page.locator('.ProseMirror').press('End');
  await page.locator('.ProseMirror').press('Enter');
  await page.locator('.ProseMirror').pressSequentially('Shared update');
  await expect(member.locator('.ProseMirror')).toContainText('Shared update');

  const workspaceURL = new URL(documentURL); workspaceURL.pathname = workspaceURL.pathname.split('/').slice(0, -1).join('/');
  await page.goto(workspaceURL.toString());
  await page.getByRole('button', { name: '新建白板' }).click();
  await page.getByLabel('名称').fill('System board');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await member.goto(page.url());
  await expect(member.locator('.excalidraw')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出' }).click();
  await page.getByRole('menuitem', { name: 'Excalidraw JSON' }).click();
  await download;
  await memberContext.close();
});
