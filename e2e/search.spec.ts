import { expect, test, type Page } from "@playwright/test";

async function saveMoment(page: Page, text: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "写点什么" }).click();
  await page.getByRole("textbox", { name: "记录内容" }).fill(text);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

async function saveDiary(page: Page, body: string): Promise<string> {
  await page.goto("/diary/new");
  await page.getByRole("textbox", { name: "日记正文" }).fill(body);
  await page.getByRole("button", { name: "保存日记" }).click();
  await expect(page).toHaveURL(/\/diary\/[0-9a-f-]+$/);
  return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

async function search(page: Page, keyword: string): Promise<void> {
  const input = page.getByRole("searchbox", { name: "关键词" });
  await input.fill(keyword);
  await page.getByRole("button", { name: "搜索" }).click();
}

test.describe("Search real browser flow", () => {
  test("finds Moment and Diary text and can search again after refresh", async ({ page }) => {
    await saveMoment(page, "今天研究了 IndexedDB");
    await saveDiary(page, "今天重新整理数据库设计");
    await page.goto("/search");

    await search(page, "数据库");
    await expect(page.getByRole("article").filter({ hasText: "今天重新整理数据库设计" })).toBeVisible();
    await expect(page.getByText("今天研究了 IndexedDB", { exact: true })).toHaveCount(0);

    await search(page, "IndexedDB");
    await expect(page.getByRole("article").filter({ hasText: "今天研究了 IndexedDB" })).toBeVisible();
    await expect(page.getByText("今天重新整理数据库设计", { exact: true })).toHaveCount(0);

    await page.reload();
    await search(page, "IndexedDB");
    await expect(page.getByRole("article").filter({ hasText: "今天研究了 IndexedDB" })).toBeVisible();
  });

  test("returns an Append hit as its single parent Moment root", async ({ page }) => {
    await saveMoment(page, "下午开会");
    const article = page.getByRole("article").filter({ hasText: "下午开会" });
    await article.getByRole("button", { name: "追加" }).click();
    await article.getByRole("textbox", { name: "追加文字" }).fill("主要讨论了同步架构");
    await article.getByRole("button", { name: "保存追加" }).click();
    await page.goto("/search");

    await search(page, "同步架构");
    const result = page.getByRole("article").filter({ hasText: "下午开会" });
    await expect(result).toHaveCount(1);
    await expect(result.getByText("主要讨论了同步架构", { exact: true })).toBeVisible();
    await expect(result.locator(".timeline-append")).toHaveCount(1);
    await expect(page.locator(".search-result")).toHaveCount(1);
  });

  test("finds the updated Diary body and opens the correct Diary", async ({ page }) => {
    const diaryId = await saveDiary(page, "旧内容");
    await page.getByRole("button", { name: "编辑" }).click();
    await page.getByRole("textbox", { name: "日记正文" }).fill("旧内容和新的搜索关键词");
    await page.getByRole("button", { name: "保存日记" }).click();
    await page.goto("/search");

    await search(page, "新的搜索关键词");
    const diaryLink = page.getByRole("link", { name: /旧内容和新的搜索关键词/ });
    await expect(diaryLink).toHaveAttribute("href", `/diary/${diaryId}`);
    await diaryLink.click();
    await expect(page).toHaveURL(`/diary/${diaryId}`);
    await expect(page.getByText("旧内容和新的搜索关键词", { exact: true })).toBeVisible();
  });
});
