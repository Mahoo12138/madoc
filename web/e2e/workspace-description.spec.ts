import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page) {
  const status = await (await page.request.get("/api/setup/status")).json();
  const auth = await page.request.post(
    status.initialized ? "/api/auth/sign-in" : "/api/setup/admin",
    {
      data: {
        ...(!status.initialized ? { name: "Owner" } : {}),
        email: "owner@example.test",
        password: "password123",
      },
    },
  );
  expect(auth.ok()).toBeTruthy();
  const { csrfToken } = await auth.json();
  const headers = {
    "x-madoc-csrf-token": csrfToken,
    Origin: new URL(test.info().project.use.baseURL!).origin,
  };
  const response = await page.request.post("/api/workspaces", {
    headers,
    data: { name: "介绍测试空间" },
  });
  expect(response.ok()).toBeTruthy();
  const workspace = (await response.json()) as { id: string; name: string };
  await page.goto(`/workspace/${workspace.id}`);
  await expect(page.getByRole("button", { name: "工作区菜单" })).toBeVisible();
  const csrfCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "madoc_csrf",
  );
  headers["x-madoc-csrf-token"] = csrfCookie!.value.split(".")[0];
  return { workspace, headers };
}

async function openInformation(page: Page) {
  await page.getByRole("button", { name: "工作区菜单" }).click();
  await page.getByRole("menuitem", { name: "管理", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "工作区信息", exact: true }),
  ).toBeVisible();
}

test("owner sets, cancels, updates and clears the persisted workspace description", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const { workspace } = await setup(page);
  await openInformation(page);
  const section = page.getByRole("region", { name: "工作区介绍", exact: true });
  await expect(section).toContainText("未设置介绍");
  await expect(
    page.getByRole("textbox", { name: "工作区介绍", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "编辑介绍" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑工作区介绍" });
  const input = dialog.getByRole("textbox", {
    name: "工作区介绍",
    exact: true,
  });
  const save = dialog.getByRole("button", { name: "保存介绍" });
  await expect(save).toBeDisabled();
  await input.fill("未保存的介绍");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("button", { name: "编辑介绍" })).toBeFocused();
  await page.getByRole("button", { name: "编辑介绍" }).click();
  await expect(input).toHaveValue("");
  const description = "项目文档与白板\n一起记录，共同成长 🌱";
  await input.fill(`  ${description}  `);
  await expect(dialog).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "/tmp/madoc-description-desktop-editor.png",
    animations: "disabled",
  });
  await save.click();
  await expect(dialog).not.toBeVisible();
  await expect(section).toContainText(description);
  await page.screenshot({
    path: "/tmp/madoc-description-desktop.png",
    animations: "disabled",
  });
  const stored = await (
    await page.request.get(`/api/workspaces/${workspace.id}`)
  ).json();
  expect(stored).toMatchObject({ name: workspace.name, description });
  const list = await (await page.request.get("/api/workspaces")).json();
  expect(
    list.find((entry: { id: string }) => entry.id === workspace.id).description,
  ).toBe(description);

  const otherPage = await context.newPage();
  await otherPage.goto(`/workspace/${workspace.id}`);
  await expect(
    otherPage.getByRole("button", { name: "工作区菜单" }),
  ).toContainText(description);
  await page.getByRole("button", { name: "编辑介绍" }).click();
  await expect(input).toHaveValue(description);
  await expect(save).toBeDisabled();
  await input.fill("更新后的工作区介绍");
  await save.click();
  await expect(
    otherPage.getByRole("button", { name: "工作区菜单" }),
  ).toContainText("更新后的工作区介绍");
  await page.reload();
  await expect(section).toContainText("更新后的工作区介绍");
  await page.getByRole("button", { name: "编辑介绍" }).click();
  await input.fill("   ");
  await save.click();
  await expect(section).toContainText("未设置介绍");
  await expect(
    otherPage.getByRole("button", { name: "工作区菜单" }),
  ).toContainText("未设置介绍");
  await otherPage.reload();
  await expect(
    otherPage.getByRole("button", { name: "工作区菜单" }),
  ).toContainText("未设置介绍");
  await otherPage.close();
  expect(errors).toEqual([]);
});

test("description failure retains the draft and retries without changing the name", async ({
  page,
}) => {
  const { workspace } = await setup(page);
  await openInformation(page);
  await page.getByRole("button", { name: "编辑介绍" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑工作区介绍" });
  const input = dialog.getByRole("textbox", {
    name: "工作区介绍",
    exact: true,
  });
  await page.route(`**/api/workspaces/${workspace.id}`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
        })
      : route.continue(),
  );
  await input.fill("失败后保留的介绍");
  await dialog.getByRole("button", { name: "保存介绍" }).click();
  await expect(dialog.getByRole("alert")).toContainText("操作未完成");
  await expect(input).toHaveValue("失败后保留的介绍");
  expect(
    await (await page.request.get(`/api/workspaces/${workspace.id}`)).json(),
  ).toMatchObject({ name: workspace.name, description: "" });
  await page.unroute(`**/api/workspaces/${workspace.id}`);
  await dialog.getByRole("button", { name: "保存介绍" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "工作区介绍", exact: true }),
  ).toContainText("失败后保留的介绍");
});

test("pending description save blocks duplicate submissions, closure and section changes", async ({
  page,
}) => {
  const { workspace } = await setup(page);
  await openInformation(page);
  await page.getByRole("button", { name: "编辑介绍" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑工作区介绍" });
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/workspaces/${workspace.id}`, async (route) => {
    if (route.request().method() === "PATCH") {
      requests += 1;
      await gate;
    }
    await route.continue();
  });
  await dialog
    .getByRole("textbox", { name: "工作区介绍", exact: true })
    .fill("正在保存的介绍");
  try {
    await dialog.getByRole("button", { name: "保存介绍" }).click();
    await expect.poll(() => requests).toBe(1);
    await expect(dialog.getByRole("textbox")).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "保存介绍" }),
    ).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "取消" })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "成员管理", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await dialog.locator("form").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.evaluate(() => {
      window.location.hash = "activity";
    });
    await expect(page).toHaveURL(`/workspace/${workspace.id}/manage#workspace`);
    expect(requests).toBe(1);
  } finally {
    release();
  }
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "工作区介绍", exact: true }),
  ).toContainText("正在保存的介绍");
});

test("description draft survives blocked navigation and is discarded only after confirmation", async ({
  page,
}) => {
  const { workspace } = await setup(page);
  await openInformation(page);
  await page.getByRole("button", { name: "编辑介绍" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑工作区介绍" });
  await dialog
    .getByRole("textbox", { name: "工作区介绍", exact: true })
    .fill("还在编辑的介绍");
  await page
    .locator('main[aria-label="工作区管理"] button')
    .filter({ hasText: "返回工作区" })
    .evaluate((button: HTMLButtonElement) => button.click());
  const guard = page.getByRole("dialog", { name: "放弃介绍修改？" });
  await expect(guard).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guard).not.toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveValue("还在编辑的介绍");
  await page
    .locator('main[aria-label="工作区管理"] button')
    .filter({ hasText: "返回工作区" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "继续编辑" }).click();
  await expect(dialog.getByRole("textbox")).toHaveValue("还在编辑的介绍");
  await page
    .locator('main[aria-label="工作区管理"] button')
    .filter({ hasText: "返回工作区" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await guard.getByRole("button", { name: "放弃并离开" }).click();
  await expect(page).toHaveURL(`/workspace/${workspace.id}`);
  expect(
    (await (await page.request.get(`/api/workspaces/${workspace.id}`)).json())
      .description,
  ).toBe("");
});

test("320px description editor validates Unicode length and wraps long saved text", async ({
  page,
}) => {
  const { workspace } = await setup(page);
  await page.setViewportSize({ width: 320, height: 760 });
  await page
    .getByRole("button", { name: "工作区更多操作", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "管理", exact: true }).click();
  await page.getByRole("button", { name: "编辑介绍" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑工作区介绍" });
  const input = dialog.getByRole("textbox", {
    name: "工作区介绍",
    exact: true,
  });
  const save = dialog.getByRole("button", { name: "保存介绍" });
  await input.fill("🌱".repeat(501));
  await expect(save).toBeDisabled();
  await expect(dialog).toContainText("介绍不能超过 500 字");
  const description = "🌱".repeat(500);
  await input.fill(description);
  await expect(save).toBeEnabled();
  await expect(dialog).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "/tmp/madoc-description-mobile-editor.png",
    animations: "disabled",
  });
  await save.click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "工作区介绍", exact: true }),
  ).toContainText(description);
  await page.reload();
  expect(
    (await (await page.request.get(`/api/workspaces/${workspace.id}`)).json())
      .description,
  ).toBe(description);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "/tmp/madoc-description-mobile.png",
    animations: "disabled",
  });
});

test("editor and viewer can read introductions but cannot change them through UI or REST", async ({
  page,
  browser,
}) => {
  const { workspace, headers } = await setup(page);
  expect(
    (
      await page.request.patch(`/api/workspaces/${workspace.id}`, {
        headers,
        data: { description: "只读成员可见的介绍" },
      })
    ).ok(),
  ).toBeTruthy();
  for (const role of ["editor", "viewer"] as const) {
    const inviteResponse = await page.request.post(
      `/api/workspaces/${workspace.id}/invites`,
      {
        headers,
        data: { email: `${role}-${workspace.id}@example.test`, role },
      },
    );
    expect(inviteResponse.ok()).toBeTruthy();
    const { token } = await inviteResponse.json();
    const member = await browser.newContext();
    const accept = await member.request.post(`/api/invites/${token}/accept`, {
      headers: { Origin: headers.Origin },
      data: { name: role, password: "password123" },
    });
    expect(accept.ok()).toBeTruthy();
    expect((await accept.json()).workspace.description).toBe(
      "只读成员可见的介绍",
    );
    const memberPage = await member.newPage();
    await memberPage.goto(`/workspace/${workspace.id}`);
    await expect(
      memberPage.getByRole("button", { name: "工作区菜单" }),
    ).toContainText("只读成员可见的介绍");
    await openInformation(memberPage);
    await expect(
      memberPage.getByRole("region", { name: "工作区介绍", exact: true }),
    ).toContainText("只读成员可见的介绍");
    await expect(
      memberPage.getByRole("button", { name: "编辑介绍" }),
    ).toHaveCount(0);
    const csrfCookie = (await member.cookies()).find(
      (cookie) => cookie.name === "madoc_csrf",
    );
    const denied = await member.request.patch(
      `/api/workspaces/${workspace.id}`,
      {
        headers: {
          ...headers,
          "x-madoc-csrf-token": csrfCookie!.value.split(".")[0],
        },
        data: { description: "越权修改" },
      },
    );
    expect(denied.status()).toBe(403);
    await member.close();
  }
  expect(
    (await (await page.request.get(`/api/workspaces/${workspace.id}`)).json())
      .description,
  ).toBe("只读成员可见的介绍");
});
