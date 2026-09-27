import { expect, test, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { accountHeaders } from './helpers/account';

const editorBundle = /\/editor-[^/]+\.js$/;
const boardBundle = /\/whiteboard-[^/]+\.js$/;

async function createLoadingFixture(page: Page) {
  const status = await (await page.request.get('/api/setup/status')).json();
  const auth = await page.request.post(
    `/api/${status.initialized ? 'auth/sign-in' : 'setup/admin'}`,
    {
      data: {
        ...(!status.initialized ? { name: 'Owner' } : {}),
        email: 'owner@example.test',
        password: 'password123',
      },
    },
  );
  expect(auth.ok()).toBeTruthy();
  const { csrfToken } = await auth.json();
  const preferencesResponse = await page.request.get('/api/me/preferences');
  expect(preferencesResponse.ok()).toBeTruthy();
  const { preferences } = await preferencesResponse.json();
  const headers = {
    'x-madoc-csrf-token': csrfToken,
    Origin: 'http://127.0.0.1:3100',
  };
  const workspace = await (
    await page.request.post('/api/workspaces', {
      headers,
      data: { name: 'Loading boundary' },
    })
  ).json();
  const create = async (type: string) =>
    (
      await page.request.post(`/api/workspaces/${workspace.id}/items`, {
        headers,
        data: { type, title: `Boundary ${type}`, parentId: null },
      })
    ).json();
  const markdown = await create('markdown');
  expect(
    (
      await page.request.put(`/api/items/${markdown.id}/markdown`, {
        headers,
        data: { snapshot: '', markdown: '# Loading boundary' },
      })
    ).ok(),
  ).toBeTruthy();
  return {
    fontSize: preferences.fontSize as number,
    workspace,
    markdown,
    whiteboard: await create('whiteboard'),
  };
}

for (const surface of ['list', 'empty', 'markdown', 'whiteboard'] as const) {
  test(`cold ${surface} loads only the required content engine`, async ({
    page,
  }, info) => {
    const workspaceFixture = await createLoadingFixture(page);
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script')
        requests.push(new URL(request.url()).pathname);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      surface === 'list'
        ? '/workspaces'
        : `/workspace/${workspaceFixture.workspace.id}${surface === 'empty' ? '' : `/${workspaceFixture[surface].id}`}`,
    );
    if (surface === 'list')
      await expect(
        page
          .getByRole('link', {
            name: '打开工作区 Loading boundary',
            exact: true,
          })
          .last(),
      ).toBeVisible();
    else if (surface === 'empty')
      await expect(
        page.getByRole('heading', { name: '从一个文档或白板开始' }),
      ).toBeVisible();
    else
      await expect(
        page.locator(surface === 'markdown' ? '.ProseMirror' : '.excalidraw'),
      ).toBeVisible();
    if (surface === 'markdown') {
      await expect(page.locator('.ProseMirror')).toHaveCSS(
        'padding',
        '18px 0px 120px',
      );
      await expect(page.locator('.ProseMirror')).toHaveCSS(
        'font-size',
        `${workspaceFixture.fontSize}px`,
      );
      await expect(page.locator('.ProseMirror h1')).toHaveCSS(
        'font-size',
        `${workspaceFixture.fontSize * 2}px`,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('.ProseMirror')).toHaveCSS(
        'padding',
        '18px 0px 120px',
      );
    }
    await info.attach('script-requests', {
      body: JSON.stringify(requests, null, 2),
      contentType: 'application/json',
    });
    expect(requests.some((url) => editorBundle.test(url))).toBe(
      surface === 'markdown',
    );
    expect(requests.some((url) => boardBundle.test(url))).toBe(
      surface === 'whiteboard',
    );
    expect(errors).toEqual([]);
    if (surface === 'empty') {
      // Navigation after the initial render must still load each engine on demand.
      await page
        .getByRole('navigation', { name: '文件列表' })
        .getByRole('button', { name: 'Boundary markdown', exact: true })
        .click();
      await expect(
        page.getByRole('textbox', { name: '文档正文', exact: true }),
      ).toBeVisible();
      expect(requests.some((url) => editorBundle.test(url))).toBe(true);
      expect(requests.some((url) => boardBundle.test(url))).toBe(false);
      await page
        .getByRole('navigation', { name: '文件列表' })
        .getByRole('button', { name: 'Boundary whiteboard', exact: true })
        .click();
      await expect(page.locator('.excalidraw')).toBeVisible();
      expect(requests.some((url) => boardBundle.test(url))).toBe(true);
      expect(errors).toEqual([]);
    }
  });
}

test('only visible navigation is mounted and state survives tabs, drawer and viewport changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await openDocument(page, '# Parent\n\n## Child');
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const headers = await accountHeaders(page, 'http://127.0.0.1:3100');
  const folder = await (
    await page.request.post(`/api/workspaces/${workspaceId}/items`, {
      headers,
      data: { type: 'folder', title: 'Kept folder', parentId: null },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/items/${id}/move`, {
        headers,
        data: { parentId: folder.id, index: 0 },
      })
    ).ok(),
  ).toBeTruthy();
  const trees = page.locator('nav[aria-label="文件列表"]');
  const outlines = page.locator('nav[aria-label="文档大纲"]');
  await expect(trees).toHaveCount(1);
  await expect(outlines).toHaveCount(1);
  await trees.getByRole('button', { name: 'Kept folder', exact: true }).click();
  await page.getByRole('button', { name: '最近', exact: true }).click();
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    if (width === 390) {
      await expect(trees).toHaveCount(0);
      await page.getByRole('button', { name: '打开内容导航' }).click();
    }
    await expect(trees).toHaveCount(1);
    await expect(
      trees.getByRole('button', { name: 'Kept folder', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('tab', { name: '大纲', exact: true }).click();
    await expect(trees).toHaveCount(0);
    await expect(outlines).toHaveCount(1);
    await page
      .getByRole('button', { name: '折叠 Parent', exact: true })
      .click();
    await page.getByRole('tab', { name: '我的', exact: true }).click();
    await expect(outlines).toHaveCount(0);
    await page.locator('label').filter({ hasText: '最近访问' }).click();
    await page.getByRole('tab', { name: '文件', exact: true }).click();
    await page.getByRole('tab', { name: '我的', exact: true }).click();
    await expect(
      page.getByRole('radio', { name: '最近访问', exact: true }),
    ).toBeChecked();
    await page.getByRole('tab', { name: '大纲', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '展开 Parent', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '展开 Parent', exact: true })
      .click();
    await page.getByRole('tab', { name: '文件', exact: true }).click();
  }
  // Resizing an open phone drawer should expose exactly one desktop navigation.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trees).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: '最近', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(
    trees.getByRole('button', { name: 'Kept folder', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await trees.getByRole('button', { name: 'Kept folder', exact: true }).click();
  await expect(
    trees.getByRole('button', { name: 'Inline writing', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('textbox', { name: '文档正文', exact: true }),
  ).toContainText('Parent');
});

test('a thousand entries mount once and retain sibling order after refresh', async ({
  page,
}) => {
  const workspaceFixture = await createLoadingFixture(page);
  const items = Array.from({ length: 100 }, (_, folder) => [
    {
      ...workspaceFixture.markdown,
      id: `folder-${folder}`,
      title: `Folder ${folder}`,
      type: 'folder',
      parentId: null,
      sortKey: folder,
    },
    ...Array.from({ length: 9 }, (_, doc) => ({
      ...workspaceFixture.markdown,
      id: `doc-${folder}-${doc}`,
      title: `Document ${folder}-${doc}`,
      parentId: `folder-${folder}`,
      sortKey: doc,
    })),
  ])
    .flat()
    .reverse();
  await page.route(
    `**/api/workspaces/${workspaceFixture.workspace.id}/items`,
    (route) => route.fulfill({ json: items }),
  );
  await page.goto(`/workspace/${workspaceFixture.workspace.id}`);
  const trees = page.locator('nav[aria-label="文件列表"]');
  await expect(trees).toHaveCount(1);
  await expect(trees.getByRole('button', { name: /^Folder \d+$/ })).toHaveCount(
    100,
  );
  await expect(
    trees.getByRole('button', { name: /^Document \d+-\d+$/ }),
  ).toHaveCount(900);
  await expect(trees.locator('button[aria-current]')).toHaveCount(0);
  expect(
    (await trees.locator('button').allTextContents())
      .filter((t) => /^Folder|^Document/.test(t))
      .slice(0, 11),
  ).toEqual([
    'Folder 0',
    ...Array.from({ length: 9 }, (_, i) => `Document 0-${i}`),
    'Folder 1',
  ]);
  await trees.getByRole('button', { name: 'Folder 0', exact: true }).click();
  await expect(
    trees.getByRole('button', { name: /^Document \d+-\d+$/ }),
  ).toHaveCount(891);
  await page.reload();
  await expect(trees).toHaveCount(1);
  await expect(
    trees.getByRole('button', { name: /^Document \d+-\d+$/ }),
  ).toHaveCount(900);
});
