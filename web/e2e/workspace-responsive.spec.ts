import { expect, test, type Page } from "@playwright/test";
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

test("compact actions open dialogs, restore keyboard focus, and retain navigation routes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openDocument(page, "# 开始\n\n正文");
  const more = page.getByRole("button", { name: "工作区更多操作" });
  await more.press("Enter");
  const menu = page.getByRole("menu");
  for (const name of [
    "版本与分享",
    "文档评论",
    "重命名",
    "成员管理",
    "活动记录",
    "回收站",
    "导出 Workspace ZIP",
    "Workspace 设置",
    "所有 Workspaces",
  ]) {
    await expect(
      menu.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  }
  await menu
    .getByRole("menuitem", { name: "Workspace 设置", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Workspace 设置" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();
  await page.getByRole("button", { name: "快速打开与搜索" }).click();
  await expect(
    page.getByRole("combobox", { name: "搜索当前 Workspace" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "显示大纲", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("tab", { name: "大纲", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await more.click();
  await page
    .getByRole("menuitem", { name: "所有 Workspaces", exact: true })
    .click();
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
        member.getByRole("menuitem", { name: "Workspace 设置", exact: true }),
      ).toHaveCount(0);
      for (const name of ["重命名", "回收站", "导出 Workspace ZIP"]) {
        await expect(
          member.getByRole("menuitem", { name, exact: true }),
        ).toHaveCount(role === "editor" ? 1 : 0);
      }
      await expect(
        member.getByRole("menuitem", { name: "版本与分享", exact: true }),
      ).toBeVisible();
      await member.keyboard.press("Escape");
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
        const box = await files
          .getByRole("button", { name, exact: true })
          .boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      const create = await touch
        .getByRole("button", { name: "新建内容" })
        .boundingBox();
      expect(create!.width).toBeGreaterThanOrEqual(44);
      expect(create!.height).toBeGreaterThanOrEqual(44);
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
  } finally {
    await context.close();
  }
});
