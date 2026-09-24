import { expect, test } from "@playwright/test";
import { openDocument, openOutline, showFiles } from "./helpers/writing";

const markdown =
  "# 第一章\n\n介绍。\n\n### 小节\n\n细节。\n\n##### 深层\n\n正文。\n\n## 同级小节\n\n正文。\n\n# 第二章\n\n## 小节\n\n结束。";

test("nested folds preserve child state, keyboard controls, tab state and mobile state", async ({
  page,
}) => {
  const id = await openDocument(page, markdown);
  await openOutline(page);
  const outline = page.getByRole("navigation", { name: "文档大纲" });
  const stateBefore = await (
    await page.request.get(`/api/items/${id}/markdown`)
  ).json();
  const scrollBefore = await page.evaluate(() => scrollY);
  await outline.getByRole("button", { name: "折叠 小节", exact: true }).click();
  await expect(
    outline.getByRole("button", { name: "深层，5 级标题" }),
  ).toBeHidden();
  await expect(
    outline.getByRole("button", { name: "同级小节，2 级标题" }),
  ).toBeVisible();
  await outline.getByRole("button", { name: "折叠 第一章" }).click();
  await expect(
    outline.getByRole("button", { name: "小节，3 级标题" }),
  ).toBeHidden();
  await expect(
    outline.getByRole("button", { name: "小节，2 级标题" }),
  ).toBeVisible();
  await outline.getByRole("button", { name: "展开 第一章" }).press("Enter");
  await expect(
    outline.getByRole("button", { name: "展开 小节", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    outline.getByRole("button", { name: "深层，5 级标题" }),
  ).toBeHidden();
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  expect(
    await (await page.request.get(`/api/items/${id}/markdown`)).json(),
  ).toEqual(stateBefore);
  await showFiles(page);
  await openOutline(page);
  await expect(
    outline.getByRole("button", { name: "展开 小节", exact: true }),
  ).toBeVisible();
  await outline.getByRole("button", { name: "全部折叠", exact: true }).click();
  await expect(outline.getByRole("button", { name: /级标题/ })).toHaveCount(2);
  await expect(
    outline.getByRole("button", { name: "全部折叠", exact: true }),
  ).toBeDisabled();
  await outline.getByRole("button", { name: "全部展开", exact: true }).click();
  await expect(outline.getByRole("button", { name: /级标题/ })).toHaveCount(6);
  await expect(
    outline.getByRole("button", { name: "全部展开", exact: true }),
  ).toBeDisabled();
  await outline.getByRole("button", { name: "折叠 第一章" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开内容导航" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("tab", { name: "大纲" }).click();
  await expect(
    drawer.getByRole("button", { name: "展开 第一章" }),
  ).toHaveAttribute("aria-expanded", "false");
  await drawer.getByRole("button", { name: "展开 第一章" }).click();
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "深层，5 级标题" }),
  ).toBeVisible();
  await expect(drawer).toHaveCSS("opacity", "1");
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.x))
    .toBe(0);
  await page.screenshot({
    path: "../.impeccable/review/outline-collapse-mobile.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    outline.getByRole("button", { name: "折叠 第一章" }),
  ).toBeVisible();
  await outline.getByRole("button", { name: "折叠 小节", exact: true }).click();
  await page.screenshot({
    path: "../.impeccable/review/outline-collapse-desktop.png",
  });
});

test("folds follow remote heading shifts and renames while remaining local to each view", async ({
  page,
  context,
}) => {
  await openDocument(page, markdown);
  await openOutline(page);
  const outline = page.getByRole("navigation", { name: "文档大纲" });
  await outline.getByRole("button", { name: "折叠 小节", exact: true }).click();
  const remote = await context.newPage();
  await remote.goto(page.url());
  await expect(remote.locator(".ProseMirror h1").first()).toHaveText("第一章");
  await remote.locator(".ProseMirror h1").first().click();
  await remote.keyboard.press("Home");
  await remote.keyboard.type("新增");
  await expect(
    outline.getByRole("button", { name: "新增第一章，1 级标题" }),
  ).toBeVisible();
  await expect(
    outline.getByRole("button", { name: "展开 小节", exact: true }),
  ).toBeVisible();
  await remote.locator(".ProseMirror h3").click();
  await remote.keyboard.press("Home");
  await remote.keyboard.type("改名");
  await expect(
    outline.getByRole("button", { name: "展开 改名小节", exact: true }),
  ).toBeVisible();
  await expect(
    outline.getByRole("button", { name: "深层，5 级标题" }),
  ).toBeHidden();
  await openOutline(remote);
  await expect(
    remote.getByRole("button", { name: "深层，5 级标题" }),
  ).toBeVisible();
  await remote.locator(".ProseMirror").evaluate((editor) => {
    (editor as HTMLElement).focus();
    const range = document.createRange();
    range.setStartBefore(editor.querySelector("h3")!);
    range.setEndBefore(editor.querySelectorAll("h1")[1]);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await remote.keyboard.press("Backspace");
  await expect(
    outline.getByRole("button", { name: "展开 改名小节", exact: true }),
  ).toHaveCount(0);
  await expect(
    outline.getByRole("button", { name: "折叠 第二章", exact: true }),
  ).toBeVisible();
  await expect(
    outline.getByRole("button", { name: "小节，2 级标题" }),
  ).toBeVisible();
  await remote.close();
});

test("a collapsed ancestor indicates the current section without automatically expanding", async ({
  page,
}) => {
  await openDocument(
    page,
    "# 父标题\n\n" +
      "正文。\n\n".repeat(25) +
      "## 子标题\n\n" +
      "正文。\n\n".repeat(25),
  );
  await openOutline(page);
  await page.getByRole("button", { name: "子标题，2 级标题" }).click();
  await page.getByRole("button", { name: "折叠 父标题" }).click();
  const parent = page.getByRole("button", {
    name: "父标题，1 级标题，包含当前章节",
  });
  await expect(parent).toBeVisible();
  await expect(parent.locator("..")).toHaveAttribute("data-active", "true");
  await expect(
    page.getByRole("button", { name: "子标题，2 级标题" }),
  ).toBeHidden();
  await parent.click();
  await expect(
    page.getByRole("button", { name: "父标题，1 级标题", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await expect(page.getByRole("button", { name: "展开 父标题" })).toBeVisible();
});
