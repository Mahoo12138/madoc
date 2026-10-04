import { expect, test, type Page } from '@playwright/test';
import { openBoard, rectangle } from './helpers/whiteboard';

type SceneState = {
  revision: number;
  scene: {
    elements: {
      id: string;
      type: string;
      version: number;
      isDeleted?: boolean;
      originalText?: string;
    }[];
    appState: Record<string, unknown>;
  };
};

async function saved(page: Page) {
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
}

async function sceneState(page: Page, id: string): Promise<SceneState> {
  const response = await page.request.get(`/api/items/${id}/whiteboard`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function persistedBackground(page: Page, requestId: string) {
  return page.evaluate(
    (id) =>
      new Promise<string | undefined>((resolve, reject) => {
        const request = indexedDB.open('madoc-whiteboard-outbox', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('drafts', 'readonly');
          const records = transaction.objectStore('drafts').getAll();
          transaction.oncomplete = () => {
            database.close();
            resolve(
              records.result.find((record) => record.id === id)?.scene.appState
                .viewBackgroundColor,
            );
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    requestId,
  );
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: '画布设置', exact: true }).click();
  await expect(page.getByText('显示主题', { exact: true })).toBeVisible();
}

async function assertToolbarLayout(page: Page) {
  const toolbar = page.getByRole('toolbar', { name: '白板状态与操作' });
  await expect(toolbar).toBeVisible();
  const toolbarBounds = await toolbar.boundingBox();
  expect(toolbarBounds).not.toBeNull();
  const drawingToolbars = await page
    .locator('.excalidraw .App-toolbar')
    .evaluateAll((elements) =>
      elements
        .filter(
          (element) =>
            element.getBoundingClientRect().width > 0 &&
            element.getBoundingClientRect().height > 0,
        )
        .map((element) => ({
          top: element.getBoundingClientRect().top,
          bottom: element.getBoundingClientRect().bottom,
        })),
    );
  expect(drawingToolbars.length).toBeGreaterThan(0);
  for (const drawingToolbar of drawingToolbars) {
    expect(drawingToolbar.top).toBeGreaterThanOrEqual(
      toolbarBounds!.y + toolbarBounds!.height - 1,
    );
  }
  const viewport = page.viewportSize()!;
  for (const label of ['画布设置', '白板操作', '导出']) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible();
    const bounds = (await button.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  }
  await expect(page.getByTestId('main-menu-trigger')).toBeHidden();
  await expect(page.locator('.excalidraw .welcome-screen-center')).toHaveCount(
    0,
  );
  await expect(
    page.locator('.excalidraw .dropdown-menu-container'),
  ).toBeHidden();
}

for (const width of [1292, 390]) {
  test(`whiteboard controls use project menus without overlapping drawing tools at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 887 });
    await openBoard(page);
    await saved(page);
    await assertToolbarLayout(page);
    await openSettings(page);
    await expect(page.getByText('浅色', { exact: true })).toBeVisible();
    await expect(page.getByText('深色', { exact: true })).toBeVisible();
    const settingsInput = (await page
      .getByLabel('自定义背景色', { exact: true })
      .boundingBox())!;
    expect(settingsInput.x).toBeGreaterThanOrEqual(0);
    expect(settingsInput.x + settingsInput.width).toBeLessThanOrEqual(
      width + 1,
    );
    await page.screenshot({
      path: testInfo.outputPath(`whiteboard-settings-${width}.png`),
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '白板操作', exact: true }).click();
    await page
      .getByRole('menuitem', { name: '快捷键帮助', exact: true })
      .click();
    const help = page.getByRole('dialog', { name: '白板快捷键' });
    await expect(help).toBeVisible();
    await expect(help).toContainText('撤销');
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    await assertToolbarLayout(page);
  });
}

test('whiteboard theme stays local across refresh and remote scene changes', async ({
  page,
}) => {
  const id = await openBoard(page);
  await saved(page);
  const initial = await sceneState(page, id);
  await openSettings(page);
  await page.getByText('深色', { exact: true }).click();
  await expect(page.locator('.excalidraw')).toHaveClass(/theme--dark/);
  await page.keyboard.press('Escape');
  // Cross the local debounce and retry windows to catch accidental scene writes.
  await page.waitForTimeout(3600);
  expect((await sceneState(page, id)).revision).toBe(initial.revision);
  await page.reload();
  await saved(page);
  await expect(page.locator('.excalidraw')).toHaveClass(/theme--dark/);
  expect((await sceneState(page, id)).revision).toBe(initial.revision);

  const { csrfToken } = await (
    await page.request.get('/api/auth/session')
  ).json();
  const response = await page.request.put(`/api/items/${id}/whiteboard`, {
    headers: {
      'x-madoc-csrf-token': csrfToken,
      Origin: 'http://127.0.0.1:3100',
    },
    data: {
      baseRevision: initial.revision,
      scene: {
        ...initial.scene,
        appState: { viewBackgroundColor: '#fff4e6', theme: 'light' },
        files: {},
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  await saved(page);
  await expect(page.locator('.excalidraw')).toHaveClass(/theme--dark/);
  const beforeLocalTheme = await sceneState(page, id);
  await openSettings(page);
  await page.getByText('浅色', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.excalidraw')).not.toHaveClass(/theme--dark/);
  await page.waitForTimeout(800);
  expect((await sceneState(page, id)).revision).toBe(beforeLocalTheme.revision);
});

test('canvas background persists and reaches peers while viewer controls stay read-only', async ({
  page,
  browser,
}) => {
  const id = await openBoard(page);
  await saved(page);
  const url = page.url();
  const workspaceId = new URL(url).pathname.split('/')[2];
  const { csrfToken } = await (
    await page.request.get('/api/auth/session')
  ).json();
  const headers = {
    'x-madoc-csrf-token': csrfToken,
    Origin: 'http://127.0.0.1:3100',
  };
  const inviteResponse = await page.request.post(
    `/api/workspaces/${workspaceId}/invites`,
    {
      headers,
      data: {
        email: `board-controls-${crypto.randomUUID()}@example.test`,
        role: 'viewer',
      },
    },
  );
  expect(inviteResponse.ok()).toBeTruthy();
  const invite = await inviteResponse.json();
  const context = await browser.newContext();
  try {
    const accepted = await context.request.post(
      `http://127.0.0.1:3100/api/invites/${invite.token}/accept`,
      {
        data: { name: 'Board viewer', password: 'password123' },
      },
    );
    expect(accepted.ok()).toBeTruthy();
    const viewer = await context.newPage();
    let writes = 0;
    await viewer.routeWebSocket('**/ws', (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) => {
        if (JSON.parse(String(message)).type === 'whiteboard.scene.update')
          writes += 1;
        server.send(message);
      });
    });
    await viewer.goto(url);
    await saved(viewer);
    await openSettings(viewer);
    await expect(
      viewer.getByLabel('自定义背景色', { exact: true }),
    ).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: /背景$/ })).toHaveCount(0);
    await expect(
      viewer.getByText('你只有查看权限，无法修改画布背景。'),
    ).toBeVisible();
    await viewer.getByText('深色', { exact: true }).click();
    await viewer.keyboard.press('Escape');
    await expect(viewer.locator('.excalidraw')).toHaveClass(/theme--dark/);
    await expect(page.locator('.excalidraw')).not.toHaveClass(/theme--dark/);
    await viewer.getByRole('button', { name: '白板操作', exact: true }).click();
    await expect(
      viewer.getByRole('menuitem', { name: '清空画布', exact: true }),
    ).toBeHidden();
    await viewer.keyboard.press('Escape');
    await viewer.getByRole('button', { name: '导出', exact: true }).click();
    await expect(
      viewer.getByRole('menuitem', { name: '导入 Excalidraw JSON' }),
    ).toBeHidden();
    await expect(
      viewer.getByRole('menuitem', { name: 'Excalidraw JSON', exact: true }),
    ).toBeVisible();
    await viewer.keyboard.press('Escape');

    await openSettings(page);
    await page.getByLabel('自定义背景色', { exact: true }).fill('#fff4e6');
    await page.getByLabel('自定义背景色', { exact: true }).press('Tab');
    await expect
      .poll(
        async () =>
          (await sceneState(page, id)).scene.appState.viewBackgroundColor,
      )
      .toBe('#fff4e6');
    await saved(page);
    await openSettings(viewer);
    await expect(viewer.getByText('#FFF4E6', { exact: true })).toBeVisible();
    await viewer.keyboard.press('Escape');
    await expect(viewer.locator('.excalidraw')).toHaveClass(/theme--dark/);
    await page.keyboard.press('Escape');
    await page.reload();
    await saved(page);
    await openSettings(page);
    await expect(page.getByLabel('自定义背景色', { exact: true })).toHaveValue(
      '#fff4e6',
    );
    await page.keyboard.press('Escape');
    const baseline = await sceneState(page, id);
    await viewer.reload();
    await saved(viewer);
    await expect(viewer.locator('.excalidraw')).toHaveClass(/theme--dark/);
    await viewer.waitForTimeout(800);
    expect(writes).toBe(0);
    expect((await sceneState(page, id)).revision).toBe(baseline.revision);
  } finally {
    await context.close();
  }
});

test('project search and help handle shortcuts without changing the scene', async ({
  page,
}) => {
  const id = await openBoard(page);
  await saved(page);
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: 'Text', exact: true }) })
    .click();
  await page
    .locator('.excalidraw canvas.interactive')
    .click({ position: { x: 260, y: 200 } });
  const text = page.locator('textarea.excalidraw-wysiwyg');
  await expect(text).toBeVisible();
  await text.fill('Alpha plan\n第一个版本');
  await text.press('Escape');
  await expect
    .poll(
      async () =>
        (await sceneState(page, id)).scene.elements.filter(
          (element) => !element.isDeleted,
        ).length,
    )
    .toBe(1);
  await saved(page);
  const original = await sceneState(page, id);
  await page.getByRole('button', { name: '白板操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '查找画布', exact: true }).click();
  const search = page.getByRole('dialog', { name: '查找画布', exact: true });
  await search.getByLabel('查找文字', { exact: true }).fill('missing');
  await search
    .getByLabel('查找文字', { exact: true })
    .press('ControlOrMeta+Shift+p');
  await search.getByLabel('查找文字', { exact: true }).press('ControlOrMeta+/');
  await expect(search).toBeVisible();
  await expect(page.locator('.excalidraw .command-palette')).toBeHidden();
  await expect(
    search.getByText('没有找到匹配的文字', { exact: true }),
  ).toBeVisible();
  await search.getByLabel('查找文字', { exact: true }).fill('alpha');
  await search.getByRole('button', { name: /Alpha plan/ }).click();
  await expect(search).toBeHidden();
  await page
    .locator('label')
    .filter({
      has: page.getByRole('radio', { name: 'Selection', exact: true }),
    })
    .click();
  await page
    .locator('.excalidraw canvas.interactive')
    .click({ position: { x: 700, y: 460 } });
  await page.keyboard.press('ControlOrMeta+f');
  await expect(search).toBeVisible();
  await expect(search.getByLabel('查找文字', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
  await page
    .locator('.excalidraw canvas.interactive')
    .click({ position: { x: 700, y: 460 } });
  await page.keyboard.press('?');
  await expect(
    page.getByRole('dialog', { name: '白板快捷键', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  for (const shortcut of ['ControlOrMeta+Shift+p', 'ControlOrMeta+/']) {
    await page
      .locator('.excalidraw canvas.interactive')
      .click({ position: { x: 700, y: 180 } });
    await page.keyboard.press(shortcut);
    await expect(
      page.getByRole('menuitem', { name: '快捷键帮助', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.excalidraw .command-palette')).toBeHidden();
    await page
      .getByRole('menuitem', { name: '快捷键帮助', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: '白板快捷键', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(800);
  expect(await sceneState(page, id)).toEqual(original);
});

test('open canvas search follows remote text edits and deletions without changing the query', async ({
  page,
}) => {
  const id = await openBoard(page);
  await saved(page);
  // Keep another element throughout so scene presence does not rerender the dialog.
  await rectangle(page);
  await expect
    .poll(
      async () =>
        (await sceneState(page, id)).scene.elements.filter(
          (element) => !element.isDeleted,
        ).length,
    )
    .toBe(1);
  await saved(page);
  const peer = await page.context().newPage();
  const remoteTexts = async () =>
    (await sceneState(page, id)).scene.elements
      .filter((element) => element.type === 'text' && !element.isDeleted)
      .map((element) => element.originalText);
  try {
    await peer.goto(page.url());
    await saved(peer);
    await peer
      .locator('label')
      .filter({ has: peer.getByRole('radio', { name: 'Text', exact: true }) })
      .click();
    await peer
      .locator('.excalidraw canvas.interactive')
      .click({ position: { x: 650, y: 260 } });
    const peerText = peer.locator('textarea.excalidraw-wysiwyg');
    await expect(peerText).toBeVisible();
    await peerText.fill('Live search original');
    await peerText.press('Escape');
    await expect.poll(remoteTexts).toEqual(['Live search original']);
    await saved(peer);

    await page.getByRole('button', { name: '白板操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '查找画布', exact: true }).click();
    const search = page.getByRole('dialog', { name: '查找画布', exact: true });
    const query = search.getByLabel('查找文字', { exact: true });
    await query.fill('live search');
    await expect(
      search.getByRole('button', { name: 'Live search original', exact: true }),
    ).toBeVisible();

    // Escape submits text and leaves it selected; Enter edits that same element.
    await peer.keyboard.press('Enter');
    await expect(peerText).toBeVisible();
    await peerText.fill('Unrelated note');
    await peerText.press('Escape');
    await expect.poll(remoteTexts).toEqual(['Unrelated note']);
    await saved(peer);
    await expect(query).toHaveValue('live search');
    await expect(
      search.getByText('没有找到匹配的文字', { exact: true }),
    ).toBeVisible();
    await expect(
      search.getByRole('button', { name: 'Live search original', exact: true }),
    ).toBeHidden();

    await peer.keyboard.press('Enter');
    await expect(peerText).toBeVisible();
    await peerText.fill('Live search revised');
    await peerText.press('Escape');
    await expect.poll(remoteTexts).toEqual(['Live search revised']);
    await saved(peer);
    await expect(query).toHaveValue('live search');
    await expect(
      search.getByRole('button', { name: 'Live search revised', exact: true }),
    ).toBeVisible();

    await peer.keyboard.press('Delete');
    await expect.poll(remoteTexts).toEqual([]);
    await saved(peer);
    await expect(query).toHaveValue('live search');
    await expect(
      search.getByText('没有找到匹配的文字', { exact: true }),
    ).toBeVisible();
    await expect(
      search.getByRole('button', { name: 'Live search revised', exact: true }),
    ).toBeHidden();
    expect(
      (await sceneState(page, id)).scene.elements.filter(
        (element) => !element.isDeleted,
      ).length,
    ).toBe(1);
  } finally {
    await peer.close();
  }
});

test('delayed scene ACKs preserve remote backgrounds through recovery and keep newer local fields pending', async ({
  page,
}) => {
  let holdACK = false;
  const held: string[] = [];
  const writes: { id: string; background: string }[] = [];
  let release = () => {};
  let releaseOne = () => {};
  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    releaseOne = () => {
      const message = held.shift();
      if (message) socket.send(message);
    };
    release = () => {
      holdACK = false;
      for (const message of held.splice(0)) socket.send(message);
    };
    socket.onMessage((message) => {
      const frame = JSON.parse(String(message));
      if (frame.type === 'whiteboard.scene.update')
        writes.push({
          id: frame.requestId,
          background: frame.payload.scene.appState.viewBackgroundColor,
        });
      server.send(message);
    });
    server.onMessage((message) => {
      if (
        holdACK &&
        JSON.parse(String(message)).type === 'whiteboard.scene.ack'
      ) {
        held.push(String(message));
        return;
      }
      socket.send(message);
    });
  });
  const id = await openBoard(page);
  await saved(page);
  const peer = await page.context().newPage();
  let holdPeerRemote = false;
  await peer.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (
        holdPeerRemote &&
        JSON.parse(String(message)).type === 'whiteboard.scene.remote'
      )
        return;
      socket.send(message);
    });
  });
  try {
    await peer.goto(page.url());
    await saved(peer);
    holdACK = true;
    await rectangle(page);
    await expect.poll(() => held.length).toBeGreaterThan(0);
    const pendingElementId = writes.at(-1)!.id;
    await expect(page.getByText('保存中', { exact: true })).toBeVisible();
    await openSettings(peer);
    await peer.getByLabel('自定义背景色', { exact: true }).fill('#fff4e6');
    await peer.getByLabel('自定义背景色', { exact: true }).press('Tab');
    await peer.keyboard.press('Escape');
    await expect
      .poll(
        async () =>
          (await sceneState(page, id)).scene.appState.viewBackgroundColor,
      )
      .toBe('#fff4e6');
    await saved(peer);
    await openSettings(page);
    await expect(page.getByLabel('自定义背景色', { exact: true })).toHaveValue(
      '#fff4e6',
    );
    await page.keyboard.press('Escape');
    await expect
      .poll(() => persistedBackground(page, pendingElementId))
      .toBe('#fff4e6');
    await page.reload();
    await expect(page.getByText('保存中', { exact: true })).toBeVisible();
    await openSettings(page);
    await expect(page.getByLabel('自定义背景色', { exact: true })).toHaveValue(
      '#fff4e6',
    );
    await page.keyboard.press('Escape');
    release();
    await saved(page);
    expect(
      (await sceneState(page, id)).scene.appState.viewBackgroundColor,
    ).toBe('#fff4e6');

    // A peer that has not yet received the local background sends an element edit
    // with its older background. Only the pending local background should win.
    holdPeerRemote = true;
    holdACK = true;
    await openSettings(page);
    await page.getByLabel('自定义背景色', { exact: true }).fill('#fff0f6');
    await page.getByLabel('自定义背景色', { exact: true }).press('Tab');
    await page.keyboard.press('Escape');
    await expect.poll(() => held.length).toBeGreaterThan(0);
    await peer
      .locator('label')
      .filter({ has: peer.getByRole('radio', { name: 'Text', exact: true }) })
      .click();
    await peer
      .locator('.excalidraw canvas.interactive')
      .click({ position: { x: 700, y: 260 } });
    const peerText = peer.locator('textarea.excalidraw-wysiwyg');
    await expect(peerText).toBeVisible();
    await peerText.fill('Peer pending settings');
    await peerText.press('Escape');
    await saved(peer);
    await page.getByRole('button', { name: '白板操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '查找画布', exact: true }).click();
    const search = page.getByRole('dialog', { name: '查找画布', exact: true });
    await search
      .getByLabel('查找文字', { exact: true })
      .fill('Peer pending settings');
    await expect(
      search.getByRole('button', {
        name: 'Peer pending settings',
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await openSettings(page);
    await expect(page.getByLabel('自定义背景色', { exact: true })).toHaveValue(
      '#fff0f6',
    );
    await page.getByLabel('自定义背景色', { exact: true }).fill('#edf2ff');
    await page.getByLabel('自定义背景色', { exact: true }).press('Tab');
    await page.keyboard.press('Escape');
    await expect
      .poll(() => {
        const latest = writes
          .filter((write) => write.background === '#edf2ff')
          .at(-1);
        return (
          latest &&
          held.some(
            (message) =>
              JSON.parse(message).payload.clientUpdateId === latest.id,
          )
        );
      })
      .toBe(true);
    releaseOne();
    await expect(page.getByText('保存中', { exact: true })).toBeVisible();
    await openSettings(page);
    await expect(page.getByLabel('自定义背景色', { exact: true })).toHaveValue(
      '#edf2ff',
    );
    await page.keyboard.press('Escape');
    release();
    await saved(page);
    const final = await sceneState(page, id);
    expect(final.scene.appState.viewBackgroundColor).toBe('#edf2ff');
    expect(
      final.scene.elements.filter((element) => !element.isDeleted),
    ).toHaveLength(2);
    holdPeerRemote = false;
    await peer.reload();
    await saved(peer);
    await openSettings(peer);
    await expect(peer.getByLabel('自定义背景色', { exact: true })).toHaveValue(
      '#edf2ff',
    );
  } finally {
    release();
    await peer.close();
  }
});

test('clear cancellation preserves content and confirmed clear syncs versioned deletions with undo', async ({
  page,
}) => {
  const id = await openBoard(page);
  await saved(page);
  await rectangle(page);
  await expect
    .poll(async () => (await sceneState(page, id)).scene.elements.length)
    .toBe(1);
  await saved(page);
  const original = await sceneState(page, id);
  const peer = await page.context().newPage();
  try {
    await peer.goto(page.url());
    await saved(peer);
    await peer.getByRole('button', { name: '白板操作', exact: true }).click();
    await expect(
      peer.getByRole('menuitem', { name: '清空画布', exact: true }),
    ).toBeEnabled();
    await peer.keyboard.press('Escape');
    await page.getByRole('button', { name: '白板操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '清空画布', exact: true }).click();
    const confirmation = page.getByRole('dialog', {
      name: '清空画布',
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole('button', { name: '取消', exact: true })
      .click();
    expect(await sceneState(page, id)).toEqual(original);
    await page.getByRole('button', { name: '白板操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '清空画布', exact: true }).click();
    await confirmation
      .getByRole('button', { name: '清空画布', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await sceneState(page, id)).scene.elements.filter(
            (element) => !element.isDeleted,
          ).length,
      )
      .toBe(0);
    await saved(page);
    const cleared = await sceneState(page, id);
    expect(cleared.scene.elements).toHaveLength(1);
    expect(cleared.scene.elements[0].id).toBe(original.scene.elements[0].id);
    expect(cleared.scene.elements[0].version).toBeGreaterThan(
      original.scene.elements[0].version,
    );
    expect(cleared.scene.elements[0].isDeleted).toBe(true);
    // A peer can remain "saved" while a remote update is still in flight.
    // Its own clear action becoming disabled confirms that deletion reached its editor.
    await peer.getByRole('button', { name: '白板操作', exact: true }).click();
    await expect(
      peer.getByRole('menuitem', { name: '清空画布', exact: true }),
    ).toBeDisabled();
    await peer.keyboard.press('Escape');
    const exported = peer.waitForEvent('download');
    await peer.getByRole('button', { name: '导出', exact: true }).click();
    await peer
      .getByRole('menuitem', { name: 'Excalidraw JSON', exact: true })
      .click();
    const { readFile } = await import('node:fs/promises');
    expect(
      JSON.parse(await readFile((await (await exported).path())!, 'utf8'))
        .elements,
    ).toEqual([]);
    await page
      .locator('.excalidraw canvas.interactive')
      .click({ position: { x: 700, y: 460 } });
    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(
        async () =>
          (await sceneState(page, id)).scene.elements.filter(
            (element) => !element.isDeleted,
          ).length,
      )
      .toBe(1);
    await saved(page);
    await peer.reload();
    await saved(peer);
    expect(
      (await sceneState(peer, id)).scene.elements.filter(
        (element) => !element.isDeleted,
      ),
    ).toHaveLength(1);

    // Excalidraw has a native clear shortcut that bypasses its canvasActions switch.
    await page
      .locator('.excalidraw canvas.interactive')
      .click({ position: { x: 700, y: 460 } });
    await page.keyboard.press('ControlOrMeta+Delete');
    await expect(confirmation).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await confirmation
      .getByRole('button', { name: '取消', exact: true })
      .click();
    expect(
      (await sceneState(page, id)).scene.elements.filter(
        (element) => !element.isDeleted,
      ),
    ).toHaveLength(1);
  } finally {
    await peer.close();
  }
});
