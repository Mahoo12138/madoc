import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  const status = await (await page.request.get('/api/setup/status')).json();
  const auth = await page.request.post(
    status.initialized ? '/api/auth/sign-in' : '/api/setup/admin',
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
  const headers = {
    'x-madoc-csrf-token': csrfToken,
    Origin: new URL(test.info().project.use.baseURL!).origin,
  };
  const response = await page.request.post('/api/workspaces', {
    headers,
    data: { name: '设置测试空间' },
  });
  expect(response.ok()).toBeTruthy();
  const workspace = (await response.json()) as { id: string; name: string };
  // Prime the list cache before opening the workspace.
  await page.goto('/workspaces');
  await expect(
    page.getByRole('heading', { name: 'Workspaces', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('heading', { name: workspace.name, exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(`/workspace/${workspace.id}`);
  await expect(page).toHaveTitle('madoc — collaborative Markdown workspace');
  await expect(
    page
      .getByRole('button', { name: 'Workspace 菜单' })
      .or(page.getByRole('button', { name: 'Workspace 设置', exact: true }))
      .first(),
  ).toBeAttached();
  const csrfCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'madoc_csrf',
  );
  headers['x-madoc-csrf-token'] = csrfCookie!.value.split('.')[0];
  return { workspace, headers };
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Workspace 菜单' }).click();
  await page.getByRole('menuitem', { name: '设置', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Workspace 设置' }),
  ).toBeVisible();
}

test('owner renames, cancels drafts, and sees the persisted name across navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const { workspace } = await setup(page);
  await openSettings(page);
  const input = page.getByLabel('Workspace 名称', { exact: true });
  const save = page.getByRole('button', { name: '保存名称' });
  await expect(save).toBeDisabled();
  await input.fill('   ');
  await expect(save).toBeDisabled();
  await input.fill('未保存的名称');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await openSettings(page);
  await expect(input).toHaveValue(workspace.name);
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  await page.screenshot({
    path: '/tmp/madoc-settings-desktop.png',
    animations: 'disabled',
  });
  await input.fill('  新的协作空间  ');
  await input.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Workspace 菜单' }),
  ).toContainText('新的协作空间');
  await page.reload();
  await expect(page.locator('header')).toContainText('新的协作空间');
  await page.getByRole('button', { name: 'Workspace 菜单' }).click();
  await page.getByRole('menuitem', { name: '所有 Workspaces' }).click();
  await expect(
    page.getByRole('heading', { name: '新的协作空间' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('rename failure retains the draft and can be retried', async ({
  page,
}) => {
  const { workspace } = await setup(page);
  await openSettings(page);
  await page.route(`**/api/workspaces/${workspace.id}`, async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Unavailable' } },
      });
    else await route.continue();
  });
  await page.getByLabel('Workspace 名称', { exact: true }).fill('保留草稿');
  await page.getByRole('button', { name: '保存名称' }).click();
  await expect(page.getByRole('alert')).toContainText('操作未完成');
  await expect(page.getByLabel('Workspace 名称', { exact: true })).toHaveValue(
    '保留草稿',
  );
  expect(
    (await (await page.request.get(`/api/workspaces/${workspace.id}`)).json())
      .name,
  ).toBe(workspace.name);
  await page.unroute(`**/api/workspaces/${workspace.id}`);
  await page.getByRole('button', { name: '保存名称' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('header')).toContainText('保留草稿');
});

test('deletion requires an exact name, supports cancel/retry, and preserves other workspaces', async ({
  page,
}) => {
  const { workspace, headers } = await setup(page);
  const other = await (
    await page.request.post('/api/workspaces', {
      headers,
      data: { name: '保留空间' },
    })
  ).json();
  const item = await (
    await page.request.post(`/api/workspaces/${workspace.id}/items`, {
      headers,
      data: { type: 'markdown', title: '待删除文档', parentId: null },
    })
  ).json();
  await page.goto(`/workspace/${workspace.id}/${item.id}`);
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await openSettings(page);
  await page
    .getByRole('button', { name: '删除 Workspace', exact: true })
    .click();
  const confirm = page.getByLabel('输入 Workspace 名称以确认');
  const remove = page.getByRole('button', { name: '永久删除', exact: true });
  await expect(remove).toBeDisabled();
  await confirm.fill(`${workspace.name}错`);
  await expect(remove).toBeDisabled();
  await page.getByRole('button', { name: '取消删除' }).click();
  expect(
    (await page.request.get(`/api/workspaces/${workspace.id}`)).ok(),
  ).toBeTruthy();
  await page
    .getByRole('button', { name: '删除 Workspace', exact: true })
    .click();
  await expect(confirm).toHaveValue('');
  await confirm.fill(workspace.name);
  await page.screenshot({
    path: '/tmp/madoc-settings-delete.png',
    animations: 'disabled',
  });
  await page.route(`**/api/workspaces/${workspace.id}`, async (route) => {
    if (route.request().method() === 'DELETE')
      await route.fulfill({ status: 503, json: {} });
    else await route.continue();
  });
  await remove.click();
  await expect(page.getByRole('alert')).toContainText('操作未完成');
  await expect(confirm).toHaveValue(workspace.name);
  await page.unroute(`**/api/workspaces/${workspace.id}`);
  await remove.click();
  await expect(page).toHaveURL('/workspaces');
  await expect(
    page.getByRole('heading', { name: workspace.name, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '保留空间', exact: true }),
  ).toBeVisible();
  expect(
    (await page.request.get(`/api/workspaces/${workspace.id}`)).status(),
  ).toBe(404);
  expect((await page.request.get(`/api/items/${item.id}`)).status()).toBe(404);
  expect(
    (await page.request.get(`/api/workspaces/${other.id}`)).ok(),
  ).toBeTruthy();
  const list = (await (await page.request.get('/api/workspaces')).json()) as {
    id: string;
  }[];
  expect(list.some((entry) => entry.id === workspace.id)).toBe(false);
});

for (const role of ['editor', 'viewer'] as const) {
  test(`${role} has no settings controls and cannot mutate through the API`, async ({
    page,
    browser,
  }) => {
    const { workspace, headers } = await setup(page);
    const email = `${role}-${workspace.id}@example.test`;
    const invite = await (
      await page.request.post(`/api/workspaces/${workspace.id}/invites`, {
        headers,
        data: { email, role },
      })
    ).json();
    const context = await browser.newContext();
    const member = await context.newPage();
    try {
      const acceptance = await member.request.post(
        `/api/invites/${invite.token}/accept`,
        {
          headers: { Origin: headers.Origin },
          data: { name: role, password: 'password123' },
        },
      );
      expect(acceptance.ok()).toBeTruthy();
      await member.goto(`/workspace/${workspace.id}`);
      await member.getByRole('button', { name: 'Workspace 菜单' }).click();
      const csrfCookie = (await member.context().cookies()).find(
        (cookie) => cookie.name === 'madoc_csrf',
      );
      const memberHeaders = {
        ...headers,
        'x-madoc-csrf-token': csrfCookie!.value.split('.')[0],
      };
      await expect(
        member.getByRole('menuitem', { name: '设置', exact: true }),
      ).toHaveCount(0);
      const renameResponse = await member.request.patch(
        `/api/workspaces/${workspace.id}`,
        {
          headers: memberHeaders,
          data: { name: 'Denied' },
        },
      );
      expect(renameResponse.status()).toBe(403);
      expect((await renameResponse.json()).error.code).toBe('FORBIDDEN');
      const deleteResponse = await member.request.delete(
        `/api/workspaces/${workspace.id}`,
        {
          headers: memberHeaders,
        },
      );
      expect(deleteResponse.status()).toBe(403);
      expect((await deleteResponse.json()).error.code).toBe('FORBIDDEN');
      await member.keyboard.press('Escape');
      await member.setViewportSize({ width: 390, height: 844 });
      await expect(
        member.getByRole('button', { name: 'Workspace 设置', exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test('mobile settings stay within the viewport and keyboard dismissal restores focus', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const entry = page.getByRole('button', {
    name: 'Workspace 设置',
    exact: true,
  });
  await entry.click();
  const dialog = page.getByRole('dialog', { name: 'Workspace 设置' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await expect(dialog).toHaveCSS('opacity', '1');
  await page.screenshot({
    path: '/tmp/madoc-settings-mobile.png',
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(entry).toBeFocused();
  expect(errors).toEqual([]);
});

test('a pending rename blocks duplicate submissions and dismissal', async ({
  page,
}) => {
  const { workspace } = await setup(page);
  await openSettings(page);
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/workspaces/${workspace.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      requests += 1;
      await gate;
    }
    await route.continue();
  });
  const input = page.getByLabel('Workspace 名称', { exact: true });
  await input.fill('等待保存');
  try {
    await input.press('Enter');
    await expect.poll(() => requests).toBe(1);
    await expect(input).toBeDisabled();
    await expect(page.getByRole('button', { name: '保存名称' })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: '取消', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: 'Workspace 设置' }),
    ).toBeVisible();
    expect(requests).toBe(1);
  } finally {
    release();
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('header')).toContainText('等待保存');
});
