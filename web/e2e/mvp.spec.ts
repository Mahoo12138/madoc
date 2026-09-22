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
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
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
  await strong.click();
  const strongSource = page.getByLabel('编辑加粗源码');
  await expect(strongSource).toBeVisible();
  await expect(strongSource).toHaveValue('**bold**');
  await strongSource.evaluate((element: HTMLInputElement) => element.setSelectionRange(0, 0));
  await strongSource.press('ArrowRight');
  await expect.poll(() => strongSource.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(1);
  await strongSource.press('ArrowRight');
  await expect.poll(() => strongSource.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(2);
  const italic = editor.locator('em');
  await italic.click();
  await expect(page.getByLabel('编辑斜体源码')).toHaveValue('*italic*');

  // Typing inside pre-created delimiter pairs should promote them to rendered inline elements.
  await placeCaretAtLineEnd(editor.locator('p').filter({ hasText: 'bold' }).first());
  await page.keyboard.press('Enter');
  await editor.pressSequentially('****');
  await editor.press('ArrowLeft');
  await editor.press('ArrowLeft');
  await editor.pressSequentially('p');
  const pairBoldSource = editor.locator('.madoc-inline-source:visible');
  await expect(pairBoldSource).toHaveValue('**p**');
  await pairBoldSource.pressSequentially('air bold');
  await pairBoldSource.evaluate((element: HTMLInputElement) => element.setSelectionRange(element.value.length, element.value.length));
  await pairBoldSource.press('ArrowRight');
  await expect(editor.locator('strong').filter({ hasText: 'pair bold' })).toHaveCount(1);

  await placeCaretAtLineEnd(editor.locator('p').filter({ hasText: 'pair bold' }));
  await page.keyboard.press('Enter');
  await editor.pressSequentially('``');
  await editor.press('ArrowLeft');
  await editor.pressSequentially('p');
  const pairCodeSource = editor.locator('.madoc-inline-source:visible');
  await expect(pairCodeSource).toHaveValue('`p`');
  await pairCodeSource.pressSequentially('air code');
  await pairCodeSource.evaluate((element: HTMLInputElement) => element.setSelectionRange(element.value.length, element.value.length));
  await pairCodeSource.press('ArrowRight');
  await expect(editor.locator('code').filter({ hasText: 'pair code' })).toHaveCount(1);

  await placeCaretAtLineEnd(editor.locator('p').filter({ hasText: 'pair code' }));
  await page.keyboard.press('Enter');
  await editor.pressSequentially('$$');
  await editor.press('ArrowLeft');
  await editor.pressSequentially('x');
  await expect(editor.locator('[data-type="math_inline"]')).toHaveCount(1);
  const mathSource = page.getByLabel('编辑行内公式');
  await expect(mathSource).toHaveValue('$x$');
  await mathSource.pressSequentially('^2');
  await expect(mathSource).toHaveValue('$x^2$');
  await mathSource.evaluate((element: HTMLInputElement) => element.setSelectionRange(element.value.length, element.value.length));
  await mathSource.press('ArrowRight');

  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor.locator('strong').filter({ hasText: 'pair bold' })).toHaveCount(1);
  await expect(editor.locator('code').filter({ hasText: 'pair code' })).toHaveCount(1);
  const persistedMath = editor.locator('[data-type="math_inline"]');
  await expect(persistedMath).toHaveCount(1);
  await persistedMath.click();
  const persistedMathSource = page.getByLabel('编辑行内公式');
  await expect(persistedMathSource).toHaveValue('$x^2$');
  await persistedMathSource.evaluate((element: HTMLInputElement) => {
    const cursor = element.value.length - 1;
    element.setSelectionRange(cursor, cursor);
  });
  await persistedMathSource.pressSequentially('+1');
  await expect(persistedMathSource).toHaveValue('$x^2+1$');
  await persistedMathSource.evaluate((element: HTMLInputElement) => element.setSelectionRange(element.value.length, element.value.length));
  await persistedMathSource.press('ArrowRight');

  await page.keyboard.press('Enter');
  await editor.pressSequentially('``inline ` code``');
  const inlineCode = editor.locator('code').filter({ hasText: 'inline ` code' });
  await expect(inlineCode).toHaveText('inline ` code');

  await placeCaretAtLineEnd(editor.locator('p').filter({ hasText: 'inline ` code' }));
  await page.keyboard.press('Enter');
  await editor.pressSequentially('(');
  await expect(editor.locator('p').last()).toHaveText('()');
  await editor.pressSequentially('paired');
  await editor.pressSequentially(')');
  await expect(editor.locator('p').last()).toHaveText('(paired)');

  await page.keyboard.press('Enter');
  await editor.pressSequentially('中文文本');
  const chineseParagraph = editor.locator('p').last();
  await chineseParagraph.evaluate((element) => {
    const selection = document.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    (element.closest('.ProseMirror') as HTMLElement | null)?.focus();
  });
  await page.keyboard.type('"');
  await expect(chineseParagraph).toHaveText('"中文文本"');

  await page.getByRole('button', { name: '切换专注模式' }).click();
  await expect(page.locator('[data-focus-mode="true"]')).toBeVisible();
  await expect(chineseParagraph).toHaveCSS('opacity', '1');
  await expect(editor.locator('h1')).toHaveCSS('opacity', '0.24');
  await page.getByRole('button', { name: '切换打字机模式' }).click();
  await expect(page.locator('[data-typewriter-mode="true"]')).toBeVisible();
  await expect(page.getByLabel('文档统计')).toContainText('字');
  await page.getByRole('button', { name: '查看编辑快捷键' }).click();
  await expect(page.getByText('选择文本后会出现格式工具栏')).toBeVisible();
  await page.keyboard.press('Escape');

  await placeCaretAtLineEnd(chineseParagraph);
  await page.keyboard.press('Enter');
  await editor.pressSequentially('```typescript');
  await editor.press('Enter');
  const codeBlock = editor.locator('.milkdown-code-block');
  await expect(codeBlock).toHaveCount(1);
  await codeBlock.locator('.cm-content').pressSequentially('const answer = 42;');
  await expect(codeBlock).toContainText('const answer = 42;');
  const languageButton = codeBlock.locator('.language-button');
  await expect(languageButton).toHaveCSS('opacity', '1');
  await page.getByLabel('文档标题').click();
  await page.mouse.move(0, 0);
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
