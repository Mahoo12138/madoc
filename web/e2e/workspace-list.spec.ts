import { expect, test, type Locator, type Page } from '@playwright/test';

type ListedWorkspace = { id: string; name: string; role: string };

async function listFixture(page: Page, names = ['List regression']) {
  const { initialized } = await (
    await page.request.get('/api/setup/status')
  ).json();
  const response = await page.request.post(
    initialized ? '/api/auth/sign-in' : '/api/setup/admin',
    {
      data: {
        ...(!initialized ? { name: 'Owner' } : {}),
        email: 'owner@example.test',
        password: 'password123',
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const { csrfToken } = await response.json();
  const headers = {
    'x-madoc-csrf-token': csrfToken,
    Origin: 'http://127.0.0.1:3100',
  };
  const ids: string[] = [];
  for (const name of names) {
    const created = await page.request.post('/api/workspaces', {
      headers,
      data: { name },
    });
    expect(created.ok()).toBeTruthy();
    ids.push((await created.json()).id);
  }
  const all = (await (
    await page.request.get('/api/workspaces')
  ).json()) as ListedWorkspace[];
  const workspaces = all.filter((workspace) => ids.includes(workspace.id));
  await page.route('**/api/workspaces', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: workspaces })
      : route.continue(),
  );
  return { workspaces, headers };
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function expectStandaloneList(page: Page) {
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: '工作区导航', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '打开工作区导航', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '账号菜单', exact: true }),
  ).toBeVisible();
}

async function expectNonOverlappingCards(cards: Locator) {
  const bounds = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const { left, top, right, bottom, width, height } =
        element.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    }),
  );
  expect(bounds.length).toBeGreaterThan(0);
  for (const [index, card] of bounds.entries()) {
    expect(card.width).toBeGreaterThan(0);
    expect(card.height).toBeGreaterThan(0);
    for (const other of bounds.slice(index + 1)) {
      expect(
        card.right <= other.left ||
          other.right <= card.left ||
          card.bottom <= other.top ||
          other.bottom <= card.top,
        `workspace cards ${index} and ${bounds.indexOf(other)} overlap`,
      ).toBe(true);
    }
  }
}

async function expectCardColumns(cards: Locator, columns: number) {
  const bounds = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  expect(bounds.length).toBeGreaterThanOrEqual(columns);
  for (const [index, card] of bounds.entries()) {
    const column = index % columns;
    expect(Math.abs(card.x - bounds[column].x)).toBeLessThanOrEqual(1);
    if (index < columns) {
      expect(Math.abs(card.y - bounds[0].y)).toBeLessThanOrEqual(1);
      if (column > 0)
        expect(card.x).toBeGreaterThan(
          bounds[index - 1].x + bounds[index - 1].width,
        );
    } else {
      const above = bounds[index - columns];
      expect(card.y).toBeGreaterThanOrEqual(above.y + above.height);
    }
  }
}

async function expectCompactHeight(cards: Locator, min: number, max: number) {
  const heights = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(min);
    expect(height).toBeLessThanOrEqual(max);
  }
}

async function expectReadableWorkspaceCards(page: Page) {
  const cards = page.getByRole('link', { name: /^打开工作区 / });
  await expectNonOverlappingCards(cards);
  for (const card of await cards.all()) {
    const name = card.getByRole('heading', { level: 2 });
    const role = card.getByText(/^(所有者|编辑者|查看者)$/, { exact: true });
    const [cardBounds, nameBounds, roleBounds] = await Promise.all([
      card.boundingBox(),
      name.boundingBox(),
      role.boundingBox(),
    ]);
    expect(cardBounds).not.toBeNull();
    expect(nameBounds).not.toBeNull();
    expect(roleBounds).not.toBeNull();
    for (const child of [nameBounds!, roleBounds!]) {
      expect(child.x).toBeGreaterThanOrEqual(cardBounds!.x - 1);
      expect(child.y).toBeGreaterThanOrEqual(cardBounds!.y - 1);
      expect(child.x + child.width).toBeLessThanOrEqual(
        cardBounds!.x + cardBounds!.width + 1,
      );
      expect(child.y + child.height).toBeLessThanOrEqual(
        cardBounds!.y + cardBounds!.height + 1,
      );
    }
    expect(
      nameBounds!.x + nameBounds!.width <= roleBounds!.x ||
        roleBounds!.x + roleBounds!.width <= nameBounds!.x ||
        nameBounds!.y + nameBounds!.height <= roleBounds!.y ||
        roleBounds!.y + roleBounds!.height <= nameBounds!.y,
      'workspace name overlaps its role',
    ).toBe(true);
  }
}

async function saveDesignScreenshot(page: Page, name: string, fullPage = true) {
  await page.screenshot({
    path: `test-results/workspace-list-compact/${name}.png`,
    animations: 'disabled',
    fullPage,
  });
}

test('a single workspace opens through a keyboard accessible link', async ({
  page,
}) => {
  const { workspaces } = await listFixture(page, ['我的工作区']);
  await page.goto('/workspaces');
  await expect(
    page.getByRole('heading', { name: '工作区', level: 1 }),
  ).toBeVisible();
  await expectStandaloneList(page);
  const workspace = workspaces[0];
  const link = page.getByRole('link', {
    name: `打开工作区 ${workspace.name}`,
    exact: true,
  });
  await expect(link).toHaveAttribute('href', `/workspace/${workspace.id}`);
  await expect(link.getByRole('heading', { level: 2 })).toHaveText(
    workspace.name,
  );
  await expect(link.getByText('所有者', { exact: true })).toBeVisible();
  await saveDesignScreenshot(page, 'desktop-single');
  await page.getByRole('button', { name: '新建工作区', exact: true }).focus();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    if (await link.evaluate((element) => element === document.activeElement))
      break;
  }
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/workspace/${workspace.id}`);
  await expect(
    page.getByRole('button', { name: '新建文档', exact: true }),
  ).toBeVisible();
});

test('reduced motion keeps workspace cards still while hovering and pressing', async ({
  page,
}) => {
  const { workspaces } = await listFixture(page, ['静态交互工作区']);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/workspaces');
  expect(
    await page.evaluate(
      () => window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    ),
  ).toBe(true);
  const card = page.getByRole('link', {
    name: `打开工作区 ${workspaces[0].name}`,
    exact: true,
  });
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: '新建工作区', exact: true }).focus();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    if (await card.evaluate((element) => element === document.activeElement))
      break;
  }
  await expect(card).toBeFocused();
  const focus = await card.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      visible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
    };
  });
  expect(focus.visible).toBe(true);
  expect(focus.outlineStyle).not.toBe('none');
  expect(focus.outlineWidth).toBeGreaterThan(0);
  expect(focus.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
  await card.hover();
  await expect
    .poll(() =>
      card.evaluate((element) => window.getComputedStyle(element).transform),
    )
    .toBe('none');
  await page.mouse.down();
  try {
    await expect
      .poll(() =>
        card.evaluate((element) => window.getComputedStyle(element).transform),
      )
      .toBe('none');
  } finally {
    await page.mouse.move(1, 1);
    await page.mouse.up();
  }
});

test('multiple workspace links retain distinct destinations and readable roles', async ({
  page,
}) => {
  const longName = '团队 العربية עברית Résumé '.repeat(5).trim();
  const unbrokenName = 'DesignArchiveWithoutWordBreaks'.repeat(6);
  const { workspaces } = await listFixture(page, [
    '个人笔记',
    'Design archive',
    '共享资料',
    longName,
    unbrokenName,
  ]);
  await page.unroute('**/api/workspaces');
  const listed = workspaces
    .filter((workspace) => ![longName, unbrokenName].includes(workspace.name))
    .map((workspace, index) => ({
      ...workspace,
      role: ['owner', 'editor', 'viewer'][index],
    }));
  await page.route('**/api/workspaces', (route) =>
    route.fulfill({ json: listed }),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/workspaces');
  for (const [index, workspace] of listed.entries()) {
    const link = page.getByRole('link', {
      name: `打开工作区 ${workspace.name}`,
      exact: true,
    });
    await expect(link).toHaveAttribute('href', `/workspace/${workspace.id}`);
    await expect(link.getByRole('heading', { level: 2 })).toHaveText(
      workspace.name,
    );
    await expect(
      link.getByText(['所有者', '编辑者', '查看者'][index], { exact: true }),
    ).toBeVisible();
  }
  const cards = page.getByRole('link', { name: /^打开工作区 / });
  await expect(cards).toHaveCount(3);
  await expectCardColumns(cards, 3);
  await expectCompactHeight(cards, 104, 112);
  await expectNoHorizontalOverflow(page);
  await expectReadableWorkspaceCards(page);
  await saveDesignScreenshot(page, 'desktop-multiple');
  await page.setViewportSize({ width: 960, height: 800 });
  await expectCardColumns(cards, 2);
  await expectCompactHeight(cards, 104, 112);
  await expectReadableWorkspaceCards(page);
  await expectNoHorizontalOverflow(page);
  await saveDesignScreenshot(page, 'intermediate-960');
  for (const [width, columns] of [
    [1024, 3],
    [1023, 2],
    [761, 2],
    [760, 1],
  ]) {
    await page.setViewportSize({ width, height: 800 });
    await expectCardColumns(cards, columns);
    await expectCompactHeight(
      cards,
      width <= 760 ? 96 : 104,
      width <= 760 ? 104 : 112,
    );
    await expectNoHorizontalOverflow(page);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.unroute('**/api/workspaces');
  const longWorkspaces = workspaces.filter((workspace) =>
    [longName, unbrokenName].includes(workspace.name),
  );
  await page.route('**/api/workspaces', (route) =>
    route.fulfill({ json: [...longWorkspaces, listed[0]] }),
  );
  await page.reload();
  await expect(page.getByRole('link', { name: /^打开工作区 / })).toHaveCount(3);
  await expectReadableWorkspaceCards(page);
  await expectNoHorizontalOverflow(page);
  await saveDesignScreenshot(page, 'desktop-long-names');
  await page
    .getByRole('link', { name: `打开工作区 ${longName}`, exact: true })
    .click();
  await expect(page).toHaveURL(
    `/workspace/${longWorkspaces.find((workspace) => workspace.name === longName)!.id}`,
  );
});

for (const width of [320, 390]) {
  test(`${width}px keeps long multilingual names, creation and account settings reachable`, async ({
    page,
  }) => {
    const longName = '团队🚀 العربية עברית Résumé '.repeat(9).trim();
    const { workspaces } = await listFixture(page, [
      longName,
      ...Array.from({ length: 6 }, (_, index) => `项目 ${index + 1}`),
    ]);
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/workspaces');
    const link = page.getByRole('link', {
      name: `打开工作区 ${longName}`,
      exact: true,
    });
    await expect(link).toBeVisible();
    await expectStandaloneList(page);
    await expect(link.getByRole('heading', { level: 2 })).toHaveText(longName);
    await expectCardColumns(
      page.getByRole('link', { name: /^打开工作区 / }),
      1,
    );
    await expectCompactHeight(
      page.getByRole('link', { name: /^打开工作区 项目 / }),
      96,
      104,
    );
    await expectNoHorizontalOverflow(page);
    await expectReadableWorkspaceCards(page);
    await saveDesignScreenshot(page, `mobile-${width}`);
    await link.click();
    await expect(page).toHaveURL(
      `/workspace/${workspaces.find((workspace) => workspace.name === longName)!.id}`,
    );
    await page.goto('/workspaces');
    await expect(link).toBeVisible();
    await page.getByRole('button', { name: '新建工作区', exact: true }).click();
    const create = page.getByRole('dialog', {
      name: '新建工作区',
      exact: true,
    });
    await expect(
      create.getByRole('textbox', { name: '名称', exact: true }),
    ).toBeVisible();
    await expect(
      create.getByRole('textbox', { name: '名称', exact: true }),
    ).toBeFocused();
    await expectNoHorizontalOverflow(page);
    await saveDesignScreenshot(page, `create-mobile-${width}`, false);
    await create.getByRole('button', { name: '取消', exact: true }).click();
    await expect(create).toHaveCount(0);
    await page.getByRole('button', { name: '账号菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '设置', exact: true }).click();
    await expect(page).toHaveURL(/\/settings(?:#.*)?$/);
    await expect(page.getByRole('main', { name: '个人设置' })).toBeVisible();
  });
}

test('loading cards stay readable on desktop and mobile before the list resolves', async ({
  page,
}) => {
  const { workspaces } = await listFixture(page, ['加载后可打开的工作区']);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/workspaces', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await held;
    await route.fulfill({ json: workspaces });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/workspaces');
  const loading = page.getByRole('status', {
    name: '正在加载工作区列表',
    exact: true,
  });
  try {
    await expect(loading).toBeVisible();
    await expect(page.getByRole('link', { name: /^打开工作区 / })).toHaveCount(
      0,
    );
    const loadingCards = loading.locator(':scope > *');
    await expect(loadingCards).toHaveCount(3);
    await expectCardColumns(loadingCards, 3);
    await expectCompactHeight(loadingCards, 104, 112);
    await expectNonOverlappingCards(loadingCards);
    await expectNoHorizontalOverflow(page);
    const skeletons = loading.locator('.mantine-Skeleton-root');
    expect(await skeletons.count()).toBeGreaterThan(0);
    for (const skeleton of await skeletons.all()) {
      await expect
        .poll(() =>
          skeleton.evaluate(
            (element) =>
              window.getComputedStyle(element, '::after').animationName,
          ),
        )
        .toBe('none');
    }
    await saveDesignScreenshot(page, 'loading-desktop');
    await page.setViewportSize({ width: 320, height: 700 });
    await expectCardColumns(loadingCards, 1);
    await expectCompactHeight(loadingCards, 96, 104);
    await expectNonOverlappingCards(loadingCards);
    await expectNoHorizontalOverflow(page);
    await saveDesignScreenshot(page, 'loading-mobile-320');
  } finally {
    release();
  }
  await expect(loading).toHaveCount(0);
  const link = page.getByRole('link', {
    name: `打开工作区 ${workspaces[0].name}`,
    exact: true,
  });
  await expect(link).toBeVisible();
  await expectReadableWorkspaceCards(page);
  await link.click();
  await expect(page).toHaveURL(`/workspace/${workspaces[0].id}`);
});

test('empty list offers creation and cancelling clears the text draft', async ({
  page,
}) => {
  await listFixture(page, []);
  await page.goto('/workspaces');
  await expect(
    page.getByText('你的第一个工作区', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /^打开工作区 / })).toHaveCount(0);
  await saveDesignScreenshot(page, 'desktop-empty');
  await page.getByRole('button', { name: '创建工作区', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建工作区', exact: true });
  await expect(
    dialog.getByRole('textbox', { name: '名称', exact: true }),
  ).toBeFocused();
  await dialog
    .getByRole('textbox', { name: '名称', exact: true })
    .fill('取消的草稿');
  await saveDesignScreenshot(page, 'create-desktop', false);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '新建工作区', exact: true }).click();
  await expect(
    dialog.getByRole('textbox', { name: '名称', exact: true }),
  ).toHaveValue('');
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('   ');
  await expect(
    dialog.getByRole('button', { name: '创建', exact: true }),
  ).toBeDisabled();
});

test('failed creation retains the draft and retry persists exactly one workspace', async ({
  page,
}) => {
  await listFixture(page);
  const name = `Creation retry ${Date.now()}`;
  let attempts = 0;
  await page.route('**/api/workspaces', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts++;
    return attempts === 1
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'unavailable' } },
        })
      : route.continue();
  });
  await page.goto('/workspaces');
  await page.getByRole('button', { name: '新建工作区', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建工作区', exact: true });
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill(name);
  await dialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('创建工作区失败');
  await expect(
    dialog.getByRole('textbox', { name: '名称', exact: true }),
  ).toHaveValue(name);
  await expect(
    dialog.getByRole('button', { name: '创建', exact: true }),
  ).toBeEnabled();
  const before = (await (
    await page.request.get('/api/workspaces')
  ).json()) as ListedWorkspace[];
  expect(before.filter((workspace) => workspace.name === name)).toHaveLength(0);
  await dialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+$/);
  const after = (await (
    await page.request.get('/api/workspaces')
  ).json()) as ListedWorkspace[];
  const created = after.filter((workspace) => workspace.name === name);
  expect(created).toHaveLength(1);
  expect(new URL(page.url()).pathname).toBe(`/workspace/${created[0].id}`);
  expect(attempts).toBe(2);
});

test('pending creation blocks duplicate submission, editing and accidental dismissal', async ({
  page,
}) => {
  const { workspaces } = await listFixture(page);
  const name = `Pending creation ${Date.now()}`;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/api/workspaces', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    requests++;
    await held;
    await route.continue();
  });
  // Use client navigation to create a real history entry back to a workspace.
  // After the held creation succeeds, the intercepted back action must be reset.
  const oldWorkspacePath = `/workspace/${workspaces[0].id}`;
  await page.goto(oldWorkspacePath);
  await page.getByRole('button', { name: '工作区菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '所有工作区', exact: true }).click();
  await expect(page).toHaveURL('/workspaces');
  await page.getByRole('button', { name: '新建工作区', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建工作区', exact: true });
  const input = dialog.getByRole('textbox', { name: '名称', exact: true });
  await input.fill(name);
  await input.press('Enter');
  try {
    await expect.poll(() => requests).toBe(1);
    await expect(input).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: '创建', exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: '取消', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    await expect(input).toHaveValue(name);
    await page.goBack({ timeout: 5_000, waitUntil: 'commit' });
    await expect(page).toHaveURL('/workspaces');
    await expect(dialog.getByRole('status')).toContainText(
      '正在创建工作区，请等待操作完成。',
    );
    expect(requests).toBe(1);
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/workspace\/[^/]+$/);
  expect(new URL(page.url()).pathname).not.toBe(oldWorkspacePath);
  const after = (await (
    await page.request.get('/api/workspaces')
  ).json()) as ListedWorkspace[];
  expect(after.filter((workspace) => workspace.name === name)).toHaveLength(1);
});

test('direct session read failure stays on the list and retries without an empty-state claim', async ({
  page,
}) => {
  const { workspaces } = await listFixture(page);
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'session unavailable' } },
    }),
  );
  await page.goto('/workspaces');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL('/workspaces');
  await expect(page.getByText('你的第一个工作区', { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: '新建工作区', exact: true }),
  ).toHaveCount(0);
  await page.unroute('**/api/auth/session');
  await page.getByRole('button', { name: '重试加载', exact: true }).click();
  await expect(
    page.getByRole('link', {
      name: `打开工作区 ${workspaces[0].name}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
