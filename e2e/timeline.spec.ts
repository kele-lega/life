import { expect, test } from "@playwright/test";

async function saveMoment(page: import("@playwright/test").Page, text: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "写点什么" }).click();
  await page.getByRole("textbox", { name: "记录内容" }).fill(text);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

async function saveDiary(
  page: import("@playwright/test").Page,
  body: string,
  title = "",
): Promise<void> {
  await page.goto("/diary/new");
  if (title) await page.getByRole("textbox", { name: "日记标题" }).fill(title);
  await page.getByRole("textbox", { name: "日记正文" }).fill(body);
  await page.getByRole("button", { name: "保存日记" }).click();
  await expect(page).toHaveURL(/\/diary\/[0-9a-f-]+$/);
  await expect(page.getByText(body, { exact: true })).toBeVisible();
}

test.describe("Timeline real browser flow", () => {
  test("orders mixed Moment and Diary roots by their real creation times", async ({ page }) => {
    await saveMoment(page, "Timeline Moment A");
    await page.waitForTimeout(20);
    await saveDiary(page, "Timeline Diary A");
    await page.waitForTimeout(20);
    await saveMoment(page, "Timeline Moment B");

    await page.goto("/timeline");
    const entries = page.locator(".timeline-entry");
    await expect(entries).toHaveCount(3);
    await expect(entries.nth(0)).toContainText("Timeline Moment B");
    await expect(entries.nth(1)).toContainText("Timeline Diary A");
    await expect(entries.nth(2)).toContainText("Timeline Moment A");
    await page.reload();
    await expect(page.locator(".timeline-entry").nth(0)).toContainText("Timeline Moment B");
    await expect(page.locator(".timeline-entry").nth(1)).toContainText("Timeline Diary A");
    await expect(page.locator(".timeline-entry").nth(2)).toContainText("Timeline Moment A");
  });

  test("restores Moment images and Appends with a Diary", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "写点什么" }).click();
    await page.getByRole("textbox", { name: "记录内容" }).fill("Timeline complete Moment");
    await page.getByLabel("选择图片").setInputFiles([
      { name: "timeline-first.png", mimeType: "image/png", buffer: Buffer.from("first") },
      { name: "timeline-second.png", mimeType: "image/png", buffer: Buffer.from("second") },
    ]);
    await page.getByRole("button", { name: "保存" }).click();
    const article = page.getByRole("article").filter({ hasText: "Timeline complete Moment" });
    await expect(article.getByRole("img")).toHaveCount(2);
    await article.getByRole("button", { name: "追加" }).click();
    await article.getByRole("textbox", { name: "追加文字" }).fill("Timeline nested Append");
    await article.getByRole("button", { name: "保存追加" }).click();
    await saveDiary(page, "Timeline complete Diary");
    await page.goto("/timeline");

    const timelineArticle = page.getByRole("article").filter({ hasText: "Timeline complete Moment" });
    await expect(timelineArticle.getByText("Timeline complete Moment", { exact: true })).toBeVisible();
    await expect(timelineArticle.getByRole("img")).toHaveCount(2);
    await expect(timelineArticle.getByText("Timeline nested Append", { exact: true })).toBeVisible();
    await expect(timelineArticle.locator(".timeline-append")).toHaveCount(1);
    await expect(page.getByText("Timeline complete Diary", { exact: true })).toBeVisible();
    await page.reload();
    const restored = page.getByRole("article").filter({ hasText: "Timeline complete Moment" });
    await expect(restored.getByRole("img")).toHaveCount(2);
    await expect(restored.getByText("Timeline nested Append", { exact: true })).toBeVisible();
    await expect(page.getByText("Timeline complete Diary", { exact: true })).toBeVisible();
  });

  test("opens the correct existing Diary from Timeline", async ({ page }) => {
    await saveDiary(page, "Diary navigation body", "Diary navigation title");
    const diaryId = new URL(page.url()).pathname.split("/").at(-1);
    expect(diaryId).toBeTruthy();

    await page.goto("/timeline");
    await page.getByRole("link", { name: /Diary navigation title/ }).click();

    await expect(page).toHaveURL(`/diary/${diaryId}`);
    await expect(page.getByText("Diary navigation title", { exact: true })).toBeVisible();
    await expect(page.getByText("Diary navigation body", { exact: true })).toBeVisible();
  });
});
