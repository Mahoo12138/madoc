import { expect, test, type Locator, type Page } from "@playwright/test";
import { openDocument } from "./helpers/writing";
import { accountHeaders } from "./helpers/account";

const longTitle =
  "跨设备工作区设计说明与多语言长标题ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(
    2,
  );

async function expectToolbarFits(page: Page) {
  const toolbar = page.locator('header[aria-label="工作区工具栏"]');
  await expect(toolbar).toBeVisible();
  await expect
    .poll(() =>
      toolbar.evaluate((header) => {
        const bounds = header.getBoundingClientRect();
        return [...header.querySelectorAll("button")].every((button) => {
          const box = button.getBoundingClientRect();
          if (!box.width || !box.height) return true;
          return (
            box.left >= bounds.left &&
            box.right <= bounds.right + 1 &&
            box.top >= Math.max(0, bounds.top) &&
            box.bottom <= bounds.bottom + 1
          );
        });
      }),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

async function expectActionOpacity(target: Locator, expected: number) {
  await expect
    .poll(() =>
      target.evaluate((element) => {
        let opacity = 1;
        for (
          let node: Element | null = element;
          node;
          node = node.parentElement
        )
          opacity *= Number(getComputedStyle(node).opacity);
        return opacity;
      }),
    )
    .toBe(expected);
}

async function saveTreeActionScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/tree-action-visibility-design/${name}.png`,
    animations: "disabled",
  });
}

test("tree actions reveal on row hover and keyboard focus, stay visible for an open menu, and reserve their layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 887 });
  await openDocument(
    page,
    "# Tree action visibility\n\nKeyboard actions keep the document open.",
  );
  const documentURL = page.url();
  const files = page.getByRole("navigation", { name: "文件列表" });
  const link = files.getByRole("button", {
    name: "Inline writing",
    exact: true,
  });
  const row = link.locator("..");
  const favorite = files.getByRole("button", {
    name: "收藏 Inline writing",
    exact: true,
  });
  const menuTrigger = files.getByRole("button", {
    name: "Inline writing 的操作",
    exact: true,
  });
  await expect(favorite).toBeEnabled();
  await page.mouse.move(1100, 700);
  for (const target of [favorite, menuTrigger])
    await expectActionOpacity(target, 0);
  const initialLinkBox = await link.boundingBox();
  const initialRowBox = await row.boundingBox();
  expect(initialLinkBox).not.toBeNull();
  expect(initialRowBox).not.toBeNull();
  await saveTreeActionScreenshot(page, "desktop-normal");
  await row.hover();
  for (const target of [favorite, menuTrigger])
    await expectActionOpacity(target, 1);
  await saveTreeActionScreenshot(page, "desktop-hover");
  for (const [target, initial] of [
    [link, initialLinkBox],
    [row, initialRowBox],
  ] as const) {
    const hovered = await target.boundingBox();
    for (const axis of ["x", "y", "width", "height"] as const)
      expect(hovered![axis]).toBeCloseTo(initial![axis], 1);
  }
  await page.mouse.move(1100, 700);
  for (const target of [favorite, menuTrigger])
    await expectActionOpacity(target, 0);
  for (const [target, initial] of [
    [link, initialLinkBox],
    [row, initialRowBox],
  ] as const) {
    const hidden = await target.boundingBox();
    for (const axis of ["x", "y", "width", "height"] as const)
      expect(hidden![axis]).toBeCloseTo(initial![axis], 1);
  }
  await link.focus();
  for (const target of [favorite, menuTrigger])
    await expectActionOpacity(target, 1);
  await page.keyboard.press("Tab");
  await expect(favorite).toBeFocused();
  await page.keyboard.press("Enter");
  const savedFavorite = files.getByRole("button", {
    name: "取消收藏 Inline writing",
    exact: true,
  });
  await expect(savedFavorite).toHaveAttribute("aria-pressed", "true");
  await expect(savedFavorite).toBeEnabled();
  await expect(page).toHaveURL(documentURL);
  await page.keyboard.press("Tab");
  await expect(menuTrigger).toBeFocused();
  await menuTrigger.press("Enter");
  const menu = page.getByRole("menu");
  await expect(
    menu.getByRole("menuitem", { name: "重命名", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "复制链接", exact: true }),
  ).toBeFocused();
  await page.mouse.move(1100, 700);
  for (const target of [savedFavorite, menuTrigger])
    await expectActionOpacity(target, 1);
  await saveTreeActionScreenshot(page, "desktop-menu-open");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.locator(".ProseMirror").click();
  await page.mouse.move(1100, 700);
  for (const target of [savedFavorite, menuTrigger])
    await expectActionOpacity(target, 0);
  await expect(page).toHaveURL(documentURL);
});

test("long workspace and item names preserve toolbar actions across breakpoints and text scaling", async ({
  page,
}) => {
  const id = await openDocument(page, "# 第一节\n\n正文\n\n## 下一节");
  const workspace = new URL(page.url()).pathname.split("/")[2];
  const headers = await accountHeaders(page, "http://127.0.0.1:3100");
  expect(
    (
      await page.request.patch(`/api/workspaces/${workspace}`, {
        headers,
        data: { name: longTitle },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.patch(`/api/items/${id}`, {
        headers,
        data: { title: longTitle },
      })
    ).ok(),
  ).toBeTruthy();
  await expect(page.getByLabel("文档标题")).toHaveValue(longTitle);
  for (const width of [
    320, 390, 760, 768, 900, 1024, 1180, 1181, 1280, 1440, 1920,
  ]) {
    await page.setViewportSize({ width, height: width === 760 ? 390 : 844 });
    await expectToolbarFits(page);
    if (width <= 1180)
      await expect(
        page.getByRole("button", { name: "工作区更多操作" }),
      ).toBeInViewport();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await expectToolbarFits(page);
});

test("compact actions navigate management, preserve child dialogs, and retain editor routes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openDocument(page, "# 开始\n\n正文");
  const documentURL = page.url();
  const more = page.getByRole("button", { name: "工作区更多操作" });
  await more.press("Enter");
  const menu = page.getByRole("menu");
  for (const name of [
    "版本与分享",
    "文档评论",
    "重命名",
    "回收站",
    "管理",
    "所有工作区",
  ]) {
    await expect(
      menu.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  }
  await menu.getByRole("menuitem", { name: "管理", exact: true }).click();
  const management = page.getByRole("main", { name: "工作区管理" });
  await expect(management).toBeVisible();
  await expect(page).toHaveURL(/\/workspace\/[^/]+\/manage#workspace$/);
  await management.getByRole("button", { name: "打开工作区管理导航" }).click();
  const managementNav = page.getByRole("navigation", {
    name: "工作区管理导航",
  });
  expect(
    await managementNav.evaluate((element) => element.scrollWidth),
  ).toBeLessThanOrEqual(
    await managementNav.evaluate((element) => element.clientWidth),
  );
  await managementNav.getByRole("button", { name: "成员管理" }).click();
  await expect(page).toHaveURL(/\/manage#members$/);
  await expect(
    management.getByRole("heading", { name: "成员管理", exact: true }),
  ).toBeVisible();
  for (const target of [
    management.getByRole("tab", { name: "邀请" }),
    management.getByRole("button", { name: /移除/ }),
  ]) {
    expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: "/tmp/madoc-management-members-mobile.png",
    animations: "disabled",
  });
  await management.getByRole("tab", { name: "邀请" }).click();
  await management.getByRole("button", { name: "创建邀请" }).click();
  const inviteDialog = page.getByRole("dialog", { name: "创建邀请" });
  const inviteEmail = inviteDialog.getByRole("textbox", { name: "邀请邮箱" });
  await expect(inviteEmail).toBeVisible();
  expect((await inviteEmail.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: "/tmp/madoc-management-invite-mobile.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(inviteDialog).toHaveCount(0);
  await expect(management).toBeVisible();
  await management.getByRole("button", { name: "打开工作区管理导航" }).click();
  await page
    .getByRole("navigation", { name: "工作区管理导航" })
    .getByRole("button", { name: "活动记录" })
    .click();
  await expect(page).toHaveURL(/\/manage#activity$/);
  await expect(
    management.getByRole("heading", { name: "活动记录", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/madoc-management-activity-mobile.png",
    animations: "disabled",
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await expect(management).toBeVisible();
  await management.getByRole("button", { name: "返回工作区" }).click();
  await expect(page).toHaveURL(documentURL);
  await expect(more).toBeVisible();
  await page.getByRole("button", { name: "快速打开与搜索" }).click();
  await expect(
    page.getByRole("combobox", { name: "搜索当前工作区" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "显示大纲", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("tab", { name: "大纲", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await more.click();
  await page.getByRole("menuitem", { name: "所有工作区", exact: true }).click();
  await expect(page).toHaveURL("/workspaces");
});

for (const role of ["editor", "viewer"] as const) {
  test(`compact menu preserves ${role} permissions after resize and on whiteboards`, async ({
    page,
    browser,
  }) => {
    await openDocument(page, "# 只读也能导航");
    const url = page.url();
    const workspace = new URL(url).pathname.split("/")[2];
    const headers = await accountHeaders(page, "http://127.0.0.1:3100");
    const board = await (
      await page.request.post(`/api/workspaces/${workspace}/items`, {
        headers,
        data: { type: "whiteboard", title: "响应式白板", parentId: null },
      })
    ).json();
    const invite = await (
      await page.request.post(`/api/workspaces/${workspace}/invites`, {
        headers,
        data: { email: `${role}-${workspace}@example.test`, role },
      })
    ).json();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    try {
      expect(
        (
          await context.request.post(
            `http://127.0.0.1:3100/api/invites/${invite.token}/accept`,
            {
              data: { name: role, password: "password123" },
            },
          )
        ).ok(),
      ).toBeTruthy();
      const member = await context.newPage();
      await member.goto(url);
      await expect(member.locator(".ProseMirror")).toBeVisible();
      await member.getByRole("button", { name: "工作区更多操作" }).click();
      await expect(
        member.getByRole("menuitem", { name: "管理", exact: true }),
      ).toBeVisible();
      await expect(
        member.getByRole("menuitem", { name: "版本与分享", exact: true }),
      ).toBeVisible();
      for (const name of ["重命名", "回收站"]) {
        await expect(
          member.getByRole("menuitem", { name, exact: true }),
        ).toHaveCount(role === "editor" ? 1 : 0);
      }
      await member.getByRole("menuitem", { name: "管理", exact: true }).click();
      const management = member.getByRole("main", { name: "工作区管理" });
      await management
        .getByRole("button", { name: "打开工作区管理导航" })
        .click();
      const managementNav = member.getByRole("navigation", {
        name: "工作区管理导航",
      });
      await expect(
        managementNav.getByRole("button", { name: "成员管理" }),
      ).toBeVisible();
      await expect(
        managementNav.getByRole("button", { name: "活动记录" }),
      ).toBeVisible();
      await member.keyboard.press("Escape");
      await expect(
        management.getByRole("button", { name: "导出工作区 ZIP" }),
      ).toHaveCount(role === "editor" ? 1 : 0);
      await expect(management.getByLabel("工作区名称")).toHaveCount(0);
      await management.getByRole("button", { name: "返回工作区" }).click();
      await expect(member).toHaveURL(url);
      await member.setViewportSize({ width: 1440, height: 900 });
      await expectToolbarFits(member);
      await expect(
        member.getByRole("button", { name: "重命名", exact: true }),
      ).toHaveCount(role === "editor" ? 1 : 0);
      await member.setViewportSize({ width: 760, height: 390 });
      await member.goto(`/workspace/${workspace}/${board.id}`);
      await expect(member.locator(".excalidraw")).toBeVisible();
      await expectToolbarFits(member);
      await member.getByRole("button", { name: "工作区更多操作" }).click();
      await expect(
        member.getByRole("menuitem", { name: "版本与分享", exact: true }),
      ).toHaveCount(0);
      await expect(
        member.getByRole("menuitem", { name: "文档评论", exact: true }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test("phone and large touchscreens have 44px tree targets without changing outline or favorite state", async ({
  page,
  browser,
}) => {
  await openDocument(page, "# 父标题\n\n## 子标题");
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    hasTouch: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const touch = await context.newPage();
    await touch.goto(page.url());
    await expect(touch.locator(".ProseMirror")).toBeVisible();
    for (const width of [1440, 320]) {
      await touch.setViewportSize({ width, height: 844 });
      if (width === 320)
        await touch.getByRole("button", { name: "打开内容导航" }).click();
      const files = touch.getByRole("navigation", { name: "文件列表" });
      for (const name of [
        "Inline writing",
        "收藏 Inline writing",
        "Inline writing 的操作",
      ]) {
        const target = files.getByRole("button", { name, exact: true });
        const box = await target.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await expectActionOpacity(target, 1);
      }
      const create = await touch
        .getByRole("button", { name: "新建内容" })
        .boundingBox();
      expect(create!.width).toBeGreaterThanOrEqual(44);
      expect(create!.height).toBeGreaterThanOrEqual(44);
      await touch.mouse.move(1100, 600);
      for (const name of ["收藏 Inline writing", "Inline writing 的操作"])
        await expectActionOpacity(
          files.getByRole("button", { name, exact: true }),
          1,
        );
      await saveTreeActionScreenshot(
        touch,
        width === 320 ? "mobile-tree-actions" : "large-touch-tree-actions",
      );
    }
    await touch
      .getByRole("button", { name: "收藏 Inline writing", exact: true })
      .click();
    await expect(
      touch.getByRole("button", {
        name: "取消收藏 Inline writing",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await touch
      .getByRole("dialog")
      .getByRole("tab", { name: "大纲", exact: true })
      .click();
    const fold = touch
      .getByRole("dialog")
      .getByRole("button", { name: "折叠 父标题", exact: true });
    expect((await fold.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await fold.click();
    await touch.keyboard.press("Escape");
    await expect(touch.getByRole("dialog")).toBeHidden();
    await touch.setViewportSize({ width: 1440, height: 900 });
    await expect(
      touch.getByRole("button", { name: "展开 父标题", exact: true }),
    ).toBeVisible();
    await expect(
      touch
        .getByRole("navigation", { name: "文件列表" })
        .getByRole("button", { name: "取消收藏 Inline writing", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const favorites = touch.getByRole("navigation", { name: "我的收藏" });
    for (const name of ["Inline writing", "取消收藏 Inline writing"]) {
      const box = await favorites
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await context.close();
  }
});
