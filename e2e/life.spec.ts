import { expect, test } from "@playwright/test";

const originalText = "真实浏览器第一行\n真实浏览器第二行";

async function openRecorder(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "写点什么" }).click();
  await expect(page.getByRole("textbox", { name: "记录内容" })).toBeVisible();
}

async function saveText(page: import("@playwright/test").Page, text: string): Promise<void> {
  await openRecorder(page);
  await page.getByRole("textbox", { name: "记录内容" }).fill(text);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

test.describe("real browser local-first baseline", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions([], { origin: "http://127.0.0.1:3100" });
  });

  test("persists multiline text through refresh and IndexedDB", async ({ page }) => {
    await page.goto("/");
    await saveText(page, originalText);
    await page.reload();
    await expect(page.getByText(originalText, { exact: true })).toBeVisible();
  });

  test("persists one image Blob and restores it after refresh", async ({ page }) => {
    await page.goto("/");
    await openRecorder(page);
    await page.getByRole("textbox", { name: "记录内容" }).fill("真实 Blob 图片");
    await page.getByLabel("选择图片").setInputFiles("e2e/fixtures/test-image.svg");
    await expect(page.getByRole("img", { name: "test-image.svg" })).toBeVisible();
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("img", { name: "test-image.svg" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("img", { name: "test-image.svg" })).toBeVisible();
    await expect(page.getByRole("img", { name: "test-image.svg" })).toHaveAttribute("src", /^blob:/);
  });

  test("persists multiple images without mixing owners", async ({ page }) => {
    await page.goto("/");
    await openRecorder(page);
    await page.getByRole("textbox", { name: "记录内容" }).fill("多图记录");
    await page.getByLabel("选择图片").setInputFiles([
      { name: "first.png", mimeType: "image/png", buffer: Buffer.from("first") },
      { name: "second.png", mimeType: "image/png", buffer: Buffer.from("second") },
    ]);
    await page.getByRole("button", { name: "保存" }).click();
    const article = page.getByRole("article").filter({ hasText: "多图记录" });
    await expect(article.getByRole("img")).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole("article").filter({ hasText: "多图记录" }).getByRole("img")).toHaveCount(2);
  });

  test("persists and restores a MomentAppend without changing original text", async ({ page }) => {
    await page.goto("/");
    await saveText(page, "原始 Moment");
    const article = page.getByRole("article").filter({ hasText: "原始 Moment" });
    await article.getByRole("button", { name: "追加" }).click();
    await article.getByRole("textbox", { name: "追加文字" }).fill("后来补充");
    await article.getByRole("button", { name: "保存追加" }).click();
    await expect(article.getByText("原始 Moment", { exact: true })).toBeVisible();
    await expect(article.getByText("后来补充", { exact: true })).toBeVisible();
    await page.reload();
    const restored = page.getByRole("article").filter({ hasText: "原始 Moment" });
    await expect(restored.getByText("原始 Moment", { exact: true })).toBeVisible();
    await expect(restored.getByText("后来补充", { exact: true })).toBeVisible();
  });

  test("stores mocked geolocation city and keeps coordinates hidden", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:3100" });
    await context.setGeolocation({ latitude: 31.2304, longitude: 121.4737 });
    await page.route("**/api/location/reverse**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ city: "上海" }) });
    });
    await page.goto("/");
    await openRecorder(page);
    await expect(page.getByText("上海")).toBeVisible();
    await page.getByRole("textbox", { name: "记录内容" }).fill("带城市");
    await page.getByRole("button", { name: "保存" }).click();
    const article = page.getByRole("article").filter({ hasText: "带城市" });
    await expect(article).toContainText("上海");
    await expect(article).not.toContainText("31.2304");
    await expect(article).not.toContainText("121.4737");
  });

  test("allows saving when geolocation is denied and supports exact manual placeName", async ({ page }) => {
    await page.goto("/");
    await openRecorder(page);
    await page.getByRole("button", { name: "添加具体地点" }).click();
    await page.getByRole("textbox", { name: "记录内容" }).fill("无定位也能保存");
    const place = "  家附近咖啡馆  ";
    await page.getByRole("textbox", { name: "具体地点" }).fill(place);
    await page.getByRole("button", { name: "保存" }).click();
    const article = page.getByRole("article").filter({ hasText: "无定位也能保存" });
    await expect(article).toContainText(place);
    await expect(article).not.toContainText("上海");
  });

  test("restores a mixed set of text, image, and append records", async ({ page }) => {
    await page.goto("/");
    await saveText(page, "综合文字 Moment");
    await saveText(page, "综合追加 Moment");
    const appendArticle = page.getByRole("article").filter({ hasText: "综合追加 Moment" });
    await appendArticle.getByRole("button", { name: "追加" }).click();
    await appendArticle.getByRole("textbox", { name: "追加文字" }).fill("综合追加内容");
    await appendArticle.getByRole("button", { name: "保存追加" }).click();
    await page.reload();
    await expect(page.getByText("综合文字 Moment", { exact: true })).toBeVisible();
    await expect(page.getByText("综合追加内容", { exact: true })).toBeVisible();
  });
});
