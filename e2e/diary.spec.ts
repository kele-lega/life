import { expect, test } from "@playwright/test";

async function openDiary(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/diary");
  await page.getByRole("link", { name: "新建日记" }).click();
  await expect(page.getByRole("textbox", { name: "日记正文" })).toBeVisible();
}

test.describe("Diary real browser flow", () => {
  test("creates a body-only Diary and persists it through refresh", async ({ page }) => {
    await openDiary(page);
    await page.getByRole("textbox", { name: "日记正文" }).fill("一篇没有标题的长日记");
    await page.getByRole("button", { name: "保存日记" }).click();
    await expect(page.getByRole("article").getByText("一篇没有标题的长日记", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("article").getByText("一篇没有标题的长日记", { exact: true })).toBeVisible();
  });

  test("reopens a Diary, edits its body, and persists the result", async ({ page }) => {
    await openDiary(page);
    await page.getByRole("textbox", { name: "日记标题（可选）" }).fill("原始标题");
    await page.getByRole("textbox", { name: "日记正文" }).fill("原始正文");
    await page.getByRole("button", { name: "保存日记" }).click();
    const created = page.getByRole("article");
    await expect(created).toContainText("原始正文");
    const createdTime = await created.getByRole("time").getAttribute("datetime");
    await page.getByRole("button", { name: "编辑" }).click();
    await page.getByRole("textbox", { name: "日记正文" }).fill("修改后的正文");
    await page.getByRole("button", { name: "保存日记" }).click();
    await expect(page.getByText("修改后的正文", { exact: true })).toBeVisible();
    await expect(page.getByRole("time")).toHaveAttribute("datetime", createdTime ?? "");
    await page.reload();
    await expect(page.getByText("修改后的正文", { exact: true })).toBeVisible();
    await expect(page.getByRole("time")).toHaveAttribute("datetime", createdTime ?? "");
  });
});
