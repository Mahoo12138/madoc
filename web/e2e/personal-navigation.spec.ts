import { expect, test, type Page } from "@playwright/test";
import { openDocument } from "./helpers/writing";
import { accountHeaders } from "./helpers/account";

async function saveSidebarScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/sidebar-spacing-design/${name}.png`,
    animations: "disabled",
  });
}

for (const width of [0, 320, 390]) {
  const mobile = width > 0;
  test(`favorites and recent navigation survive reload, hide trash and recover ${mobile ? `${width}px mobile` : "desktop"}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(
      mobile ? { width, height: 844 } : { width: 1480, height: 887 },
    );
    const id = await openDocument(page, "Personal content");
    const workspace = new URL(page.url()).pathname.split("/")[2];
    if (!mobile) {
      const recentHeader = page.getByRole("button", {
        name: "最近",
        exact: true,
      });
      const chevron = page.getByTestId("workspace-section-chevron-recent");
      await expect(chevron).toHaveCSS("visibility", "hidden");
      const labelBox = await recentHeader
        .getByText("最近", { exact: true })
        .boundingBox();
      const chevronBox = await chevron.boundingBox();
      expect(labelBox).not.toBeNull();
      expect(chevronBox).not.toBeNull();
      expect(chevronBox!.x).toBeGreaterThan(labelBox!.x + labelBox!.width);
      expect(chevronBox!.x - (labelBox!.x + labelBox!.width)).toBeLessThan(16);
      await recentHeader.hover();
      await expect(chevron).toHaveCSS("visibility", "visible");
      await expect(page.getByRole("button", { name: "新建文档" })).toHaveCount(
        0,
      );
      const recentRows = page
        .getByRole("navigation", { name: "最近访问列表" })
        .locator(":scope > div");
      await expect(recentRows.first()).toHaveCSS("border-bottom-style", "none");
      await expect(
        page.getByRole("button", { name: "新建内容" }),
      ).toBeVisible();
      const favoritesHeader = page.getByRole("button", {
        name: "收藏",
        exact: true,
      });
      const filesHeader = page.getByRole("button", {
        name: "文档空间",
        exact: true,
      });
      const emptyFavorites = page.getByText(
        "还没有收藏，可使用文件旁的星标添加。",
        { exact: true },
      );
      const emptyGroup = favoritesHeader.locator("xpath=../..");
      const emptyBox = await emptyGroup.boundingBox();
      const headerBox = await favoritesHeader.boundingBox();
      const messageBox = await emptyFavorites.boundingBox();
      expect(
        emptyBox!.height - headerBox!.height - messageBox!.height,
      ).toBeLessThanOrEqual(16);
      const treeRow = page
        .getByRole("navigation", { name: "文件列表" })
        .getByRole("button", { name: "Inline writing", exact: true });
      expect((await treeRow.boundingBox())!.height).toBeGreaterThanOrEqual(30);
      expect((await treeRow.boundingBox())!.height).toBeLessThanOrEqual(32);
      await saveSidebarScreenshot(page, "desktop-expanded");
      await recentHeader.click();
      await favoritesHeader.click();
      for (const [first, second] of [
        [recentHeader, favoritesHeader],
        [favoritesHeader, filesHeader],
      ]) {
        const firstBox = await first.boundingBox();
        const secondBox = await second.boundingBox();
        const gap = secondBox!.y - firstBox!.y - firstBox!.height;
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThanOrEqual(10);
      }
      await expect(
        page.getByRole("navigation", { name: "最近访问列表" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("navigation", { name: "我的收藏" }),
      ).toHaveCount(0);
      await saveSidebarScreenshot(page, "desktop-collapsed");
      await recentHeader.click();
      await favoritesHeader.click();
    }
    const headers = await accountHeaders(page, "http://127.0.0.1:3100");
    if (mobile)
      await page.getByRole("button", { name: "打开内容导航" }).click();
    const files = page.getByRole("navigation", { name: "文件列表" });
    await files
      .getByRole("button", { name: "收藏 Inline writing", exact: true })
      .click();
    await expect(
      files.getByRole("button", {
        name: "取消收藏 Inline writing",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    if (mobile)
      await page.getByRole("tab", { name: "我的", exact: true }).click();
    const favorites = page.getByRole("navigation", { name: "我的收藏" });
    await expect(
      favorites.getByText("Inline writing", { exact: true }),
    ).toHaveCount(mobile ? 2 : 1);
    if (mobile) {
      for (const name of ["Inline writing", "取消收藏 Inline writing"]) {
        const box = await favorites
          .getByRole("button", { name, exact: true })
          .boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      await saveSidebarScreenshot(page, `mobile-${width}-navigation`);
    }
    await page.screenshot({
      path: testInfo.outputPath("favorites.png"),
      fullPage: true,
    });
    if (mobile)
      await page
        .locator("label")
        .filter({ has: page.getByText("最近访问", { exact: true }) })
        .filter({ visible: true })
        .click();
    const recent = page.getByRole("navigation", { name: "最近访问列表" });
    await expect(recent.getByRole("button")).toHaveCount(1);
    await recent.getByRole("button").click();
    if (mobile) await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    if (mobile)
      await page.getByRole("button", { name: "打开内容导航" }).click();
    await expect(
      files.getByRole("button", {
        name: "取消收藏 Inline writing",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    if (mobile)
      await page.getByRole("tab", { name: "我的", exact: true }).click();
    await expect(
      favorites.getByRole("button", { name: "取消收藏 Inline writing" }),
    ).toBeVisible();
    await page.request.delete(`/api/items/${id}`, { headers });
    await expect(favorites.getByRole("button")).toHaveCount(0);
    const [batch] = await (
      await page.request.get(`/api/workspaces/${workspace}/trash`)
    ).json();
    await page.request.post(
      `/api/workspaces/${workspace}/trash/${batch.id}/restore`,
      { headers, data: {} },
    );
    await expect(
      favorites.getByRole("button", { name: "取消收藏 Inline writing" }),
    ).toBeVisible();
    await favorites
      .getByRole("button", { name: "取消收藏 Inline writing" })
      .click();
    await expect(favorites.getByRole("button")).toHaveCount(0);
    expect((await page.request.get(`/api/items/${id}`)).ok()).toBeTruthy();
    if (mobile)
      await page
        .locator("label")
        .filter({ has: page.getByText("最近访问", { exact: true }) })
        .filter({ visible: true })
        .click();
    await expect(recent.getByRole("button")).toHaveCount(1);
  });
}

test("favorite rows share hover and keyboard focus across remove without opening or deleting the document", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 887 });
  const activeId = await openDocument(page, "Current document stays open");
  const activeURL = page.url();
  const workspace = new URL(activeURL).pathname.split("/")[2];
  const headers = await accountHeaders(page, "http://127.0.0.1:3100");
  const folderResponse = await page.request.post(
    `/api/workspaces/${workspace}/items`,
    { headers, data: { type: "folder", title: "项目资料", parentId: null } },
  );
  expect(folderResponse.ok()).toBeTruthy();
  const folder = await folderResponse.json();
  const created: { id: string; title: string }[] = [];
  for (const title of ["待取消的收藏", "保留的收藏", "方案草稿"]) {
    const response = await page.request.post(
      `/api/workspaces/${workspace}/items`,
      {
        headers,
        data: {
          type: "markdown",
          title,
          parentId: title === "保留的收藏" ? null : folder.id,
        },
      },
    );
    expect(response.ok()).toBeTruthy();
    const item = await response.json();
    created.push(item);
    if (title !== "方案草稿")
      expect(
        (
          await page.request.put(`/api/items/${item.id}/favorite`, { headers })
        ).ok(),
      ).toBeTruthy();
    expect(
      (
        await page.request.post(`/api/items/${item.id}/visit`, { headers })
      ).ok(),
    ).toBeTruthy();
  }
  await page.reload();
  await expect(page.locator(".ProseMirror")).toBeVisible();
  const favorites = page.getByRole("navigation", { name: "我的收藏" });
  const remove = favorites.getByRole("button", {
    name: "取消收藏 待取消的收藏",
    exact: true,
  });
  const row = remove.locator("..");
  await expect(remove).toBeVisible();
  const rows = favorites.locator(":scope > div");
  await expect(rows).toHaveCount(2);
  const firstBox = await rows.nth(0).boundingBox();
  const secondBox = await rows.nth(1).boundingBox();
  expect(firstBox!.height).toBeGreaterThanOrEqual(30);
  expect(firstBox!.height).toBeLessThanOrEqual(36);
  expect(secondBox!.y - firstBox!.y - firstBox!.height).toBeLessThanOrEqual(4);
  await row.hover();
  const hoveredBackground = await row.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(hoveredBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(hoveredBackground).not.toBe("transparent");
  await remove.hover();
  await expect(row).toHaveCSS("background-color", hoveredBackground);
  const rowBox = await row.boundingBox();
  const removeBox = await remove.boundingBox();
  expect(removeBox!.x).toBeGreaterThanOrEqual(rowBox!.x);
  expect(removeBox!.x + removeBox!.width).toBeLessThanOrEqual(
    rowBox!.x + rowBox!.width,
  );
  await saveSidebarScreenshot(page, "desktop-favorite-row-hover");
  await page.mouse.move(1100, 600);
  await remove.focus();
  await expect(remove).toBeFocused();
  await expect(row).toHaveCSS("background-color", hoveredBackground);
  await saveSidebarScreenshot(page, "desktop-favorite-row-focus");
  let itemDeletes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      new URL(request.url()).pathname === `/api/items/${created[0].id}`
    )
      itemDeletes++;
  });
  await page.keyboard.press("Enter");
  await expect(remove).toHaveCount(0);
  await expect(page).toHaveURL(activeURL);
  await expect(page.locator(".ProseMirror")).toContainText(
    "Current document stays open",
  );
  for (const id of [activeId, ...created.map((item) => item.id)])
    expect((await page.request.get(`/api/items/${id}`)).ok()).toBeTruthy();
  await expect(
    favorites.getByRole("button", { name: "保留的收藏", exact: true }),
  ).toBeVisible();
  expect(itemDeletes).toBe(0);
  await expect(
    page.getByRole("navigation", { name: "最近访问列表" }).getByRole("button"),
  ).toHaveCount(4);
  const folderToggle = page
    .getByRole("navigation", { name: "文件列表" })
    .getByRole("button", { name: "项目资料", exact: true });
  await expect(folderToggle).toHaveAttribute("aria-expanded", "true");
  await page.mouse.move(1100, 600);
  await saveSidebarScreenshot(page, "desktop-content-expanded");
  const remainingRemove = favorites.getByRole("button", {
    name: "取消收藏 保留的收藏",
    exact: true,
  });
  await expect(remainingRemove).toBeEnabled();
  await remainingRemove.hover();
  await saveSidebarScreenshot(page, "desktop-content-favorite-hover");
  await folderToggle.click();
  await expect(folderToggle).toHaveAttribute("aria-expanded", "false");
  await saveSidebarScreenshot(page, "desktop-content-folder-collapsed");
});

test("failed favorite writes keep the prior state and can be retried", async ({
  page,
}) => {
  const id = await openDocument(page);
  const button = page
    .getByRole("navigation", { name: "文件列表" })
    .getByRole("button", {
      name: "收藏 Inline writing",
      exact: true,
    });
  await page.route(`**/items/${id}/favorite`, (route) =>
    route.fulfill({
      status: 500,
      json: { error: { code: "TEST", message: "failure" } },
    }),
  );
  await button.click();
  await expect(
    page.getByText("收藏未更新，请确认网络和访问权限后重试。"),
  ).toBeVisible();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await page.unroute(`**/items/${id}/favorite`);
  await button.click();
  await expect(
    page
      .getByRole("navigation", { name: "文件列表" })
      .getByRole("button", { name: "取消收藏 Inline writing", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
