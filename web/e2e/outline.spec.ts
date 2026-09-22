import { expect, test, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';

const longDocument = `# 开始\n\n${'正文内容。\n\n'.repeat(24)}## 中间\n\n${'中间段落。\n\n'.repeat(24)}### 结尾\n\n${'结束段落。\n\n'.repeat(24)}`;

async function headersFor(page: Page) {
  const { csrfToken } = await (
    await page.request.get('/api/auth/session')
  ).json();
  return { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
}

test('outline uses live headings, navigates duplicate titles, and follows scroll', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await openDocument(
    page,
    longDocument + '\n\n## 中间\n\n```md\n# 不是标题\n```',
  );
  await page.getByRole('tab', { name: 'Outline' }).click();
  const outline = page.getByRole('navigation', { name: '文档大纲' });
  await expect(outline.getByRole('button', { name: /级标题/ })).toHaveCount(4);
  await expect(outline).not.toContainText('不是标题');
  const middle = outline
    .getByRole('button', { name: '中间，2 级标题' })
    .first();
  await middle.click();
  await expect(middle).toHaveAttribute('aria-current', 'location');
  await expect
    .poll(() =>
      page
        .locator('.ProseMirror h2')
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBe(90);
  await page.keyboard.type('新');
  await expect(
    outline.getByRole('button', { name: '新中间，2 级标题' }),
  ).toBeVisible();
  await page.getByLabel('文档标题').focus();
  await page
    .locator('.ProseMirror h3')
    .evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 90));
  await expect(
    outline.getByRole('button', { name: '结尾，3 级标题' }),
  ).toHaveAttribute('aria-current', 'location');
  await outline
    .getByRole('button', { name: '中间，2 级标题', exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator('.ProseMirror h2')
        .last()
        .evaluate((el) => el.getBoundingClientRect().top < innerHeight),
    )
    .toBeTruthy();
  expect(errors).toEqual([]);
});

test('file tree state survives tab and document changes, with whiteboard fallback', async ({
  page,
}) => {
  await openDocument(page, '# 第一份');
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const headers = await headersFor(page);
  const create = async (
    type: string,
    title: string,
    parentId: string | null = null,
  ) => {
    const response = await page.request.post(
      `/api/workspaces/${workspaceId}/items`,
      { headers, data: { type, title, parentId } },
    );
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const folder = await create('folder', '资料');
  await create('markdown', '子文档', folder.id);
  const second = await create('markdown', '第二份');
  await page.request.put(`/api/items/${second.id}/markdown`, {
    headers,
    data: { snapshot: '', markdown: '# 第二份标题' },
  });
  await create('whiteboard', '设计白板');
  await create('markdown', '空文档');
  await page.reload();
  const files = page.getByRole('navigation', { name: '文件列表' });
  await files.getByRole('button', { name: '资料', exact: true }).click();
  await expect(
    files.getByRole('button', { name: '子文档', exact: true }),
  ).toBeHidden();
  await page.getByRole('tab', { name: 'Outline' }).click();
  await expect(
    page.getByRole('button', { name: '第一份，1 级标题' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '文件', exact: true }).click();
  await expect(
    files.getByRole('button', { name: '资料', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await files.getByRole('button', { name: '第二份', exact: true }).click();
  await page.getByRole('tab', { name: 'Outline' }).click();
  await expect(
    page.getByRole('button', { name: '第二份标题，1 级标题' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '第一份，1 级标题' }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: '文件', exact: true }).click();
  await files.getByRole('button', { name: '设计白板', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Outline' })).toBeDisabled();
  await expect(files).toBeVisible();
  await files.getByRole('button', { name: '空文档', exact: true }).click();
  await page.getByRole('tab', { name: 'Outline' }).click();
  await expect(page.getByText('暂无标题', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '文件', exact: true }).click();
  await expect(
    files.getByRole('button', { name: '资料', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await files
    .getByRole('button', { name: '第二份 的操作', exact: true })
    .click();
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('改名文档');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await files
    .getByRole('button', { name: '改名文档 的操作', exact: true })
    .click();
  await page.getByRole('menuitem', { name: '移动到…', exact: true }).click();
  await page.getByRole('textbox', { name: '目标位置' }).click();
  await page.getByRole('option', { name: '资料', exact: true }).click();
  await page.getByRole('button', { name: '移动', exact: true }).click();
  await files.getByRole('button', { name: '资料', exact: true }).click();
  await expect(
    files.getByRole('button', { name: '改名文档', exact: true }),
  ).toBeVisible();
  await files
    .getByRole('button', { name: '改名文档 的操作', exact: true })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  await expect(
    files.getByRole('button', { name: '改名文档', exact: true }),
  ).toHaveCount(0);
});

test('heading removal and undo refresh the outline without changing the file tree', async ({
  page,
}) => {
  await openDocument(page, '# 临时标题\n\n正文');
  await page.getByRole('tab', { name: 'Outline' }).click();
  await page.getByRole('button', { name: '临时标题，1 级标题' }).click();
  await page.locator('.ProseMirror h1').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Backspace');
  await expect(
    page.getByRole('button', { name: '未命名标题，1 级标题' }),
  ).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.getByText('暂无标题', { exact: true })).toBeVisible();
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+z' : 'Control+z',
  );
  await expect(
    page
      .getByRole('navigation', { name: '文档大纲' })
      .getByRole('button', { name: /级标题/ }),
  ).toHaveCount(1);
});

test('remote heading edits update a viewer outline and navigation does not write', async ({
  page,
  browser,
}) => {
  const id = await openDocument(page, '# 协作标题\n\n## 下一节');
  const url = page.url();
  const workspaceId = new URL(url).pathname.split('/')[2];
  const headers = await headersFor(page);
  const invite = await (
    await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
      headers,
      data: { email: 'outline-reader@example.test', role: 'viewer' },
    })
  ).json();
  const context = await browser.newContext();
  const viewer = await context.newPage();
  await viewer.request.post(`/api/invites/${invite.token}/accept`, {
    headers: { Origin: headers.Origin },
    data: { name: 'Reader', password: 'password123' },
  });
  await viewer.goto(url);
  await expect(viewer.locator('.ProseMirror')).toHaveAttribute(
    'contenteditable',
    'false',
  );
  await viewer.getByRole('tab', { name: 'Outline' }).click();
  await page.locator('.ProseMirror h1').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('更新');
  await expect(
    viewer.getByRole('button', { name: '更新协作标题，1 级标题' }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        await (await page.request.get(`/api/items/${id}/export.md`)).text(),
    )
    .toContain('更新协作标题');
  const before = await (
    await page.request.get(`/api/items/${id}/markdown`)
  ).json();
  await viewer
    .getByRole('button', { name: '折叠 更新协作标题', exact: true })
    .click();
  await expect(
    viewer.getByRole('button', { name: '下一节，2 级标题' }),
  ).toBeHidden();
  expect(
    await (await page.request.get(`/api/items/${id}/markdown`)).json(),
  ).toEqual(before);
  await viewer
    .getByRole('button', { name: '展开 更新协作标题', exact: true })
    .click();
  await viewer.setViewportSize({ width: 390, height: 844 });
  await viewer.getByRole('button', { name: '打开内容导航' }).click();
  await viewer
    .getByRole('dialog')
    .getByRole('button', { name: '下一节，2 级标题' })
    .click();
  await expect(viewer.getByRole('dialog')).toBeHidden();
  await expect(viewer.locator('.ProseMirror h2')).toBeFocused();
  await viewer.keyboard.type('不能写入');
  await expect(viewer.locator('.ProseMirror')).not.toContainText('不能写入');
  expect(
    await (await page.request.get(`/api/items/${id}/markdown`)).json(),
  ).toEqual(before);
  await context.close();
});

test('desktop and mobile outline layout, keyboard tabs and drawer navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDocument(page, longDocument);
  await page.getByRole('tab', { name: '文件', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Outline' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('button', { name: '开始，1 级标题' }),
  ).toBeVisible();
  await page.screenshot({ path: '../.impeccable/review/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开内容导航' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('tab', { name: 'Outline' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(drawer).toHaveCSS('opacity', '1');
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.x))
    .toBe(0);
  await page.screenshot({
    path: '../.impeccable/review/mobile.png',
    animations: 'disabled',
  });
  await drawer.getByRole('button', { name: '结尾，3 级标题' }).click();
  await expect(drawer).toBeHidden();
  await expect
    .poll(() =>
      page
        .locator('.ProseMirror h3')
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBe(90);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole('button', { name: '打开内容导航' }).click();
  await drawer.getByRole('tab', { name: '文件', exact: true }).click();
  await drawer
    .getByRole('button', { name: 'Inline writing', exact: true })
    .click();
  await expect(drawer).toBeHidden();
});
