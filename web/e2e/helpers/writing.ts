import { expect, type Page } from "@playwright/test";

export async function openDocument(page: Page, markdown = "") {
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
    Origin: "http://127.0.0.1:3100",
  };
  const workspace = await (
    await page.request.post("/api/workspaces", {
      headers,
      data: { name: "Writing regression" },
    })
  ).json();
  const item = await (
    await page.request.post(`/api/workspaces/${workspace.id}/items`, {
      headers,
      data: { type: "markdown", title: "Inline writing", parentId: null },
    })
  ).json();
  if (markdown) {
    const reset = await page.request.put(`/api/items/${item.id}/markdown`, {
      headers,
      data: { snapshot: "", markdown },
    });
    expect(reset.ok()).toBeTruthy();
  }
  await page.goto(`/workspace/${workspace.id}/${item.id}`);
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  return item.id as string;
}

export async function openOutline(page: Page) {
  const outline = page.getByRole("navigation", { name: "文档大纲" });
  if (await outline.isVisible()) return outline;
  const reveal = page.getByRole("button", { name: "显示大纲" });
  if (await reveal.isVisible()) {
    await reveal.click();
    return outline;
  }
  const drawer = page.getByRole("dialog");
  if (!(await drawer.isVisible()))
    await page.getByRole("button", { name: "打开内容导航" }).click();
  await page.getByRole("dialog").getByRole("tab", { name: "大纲" }).click();
  return outline;
}

export async function showFiles(page: Page) {
  const files = page.getByRole("navigation", { name: "文件列表" });
  if (await files.isVisible()) return files;
  await page.getByRole("dialog").getByRole("tab", { name: "文件" }).click();
  return files;
}
