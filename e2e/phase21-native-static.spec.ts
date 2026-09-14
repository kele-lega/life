import { expect, test } from "@playwright/test";

test.describe("Phase 21 native static shell", () => {
  test("does not ship Next server routes", async ({ request }) => {
    expect((await request.get("/api/life-extraction")).status()).toBe(404);
    expect((await request.get("/api/cloud/account")).status()).toBe(404);
    expect((await request.get("/api/location/reverse?latitude=1&longitude=1")).status()).toBe(404);
    expect((await request.get("/diary/not-a-static-id")).status()).toBe(404);
  });

  test("records Moment image, Append and Diary offline and keeps Dexie after reload", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    await page.getByRole("textbox", { name: "记录内容" }).fill("原生壳里的随笔");
    await page.getByLabel("选择图片").setInputFiles("e2e/fixtures/test-image.svg");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    const moment = page.getByRole("article").filter({ hasText: "原生壳里的随笔" });
    await expect(moment).toBeVisible();
    await expect(moment.getByRole("img")).toHaveCount(1);

    await moment.getByRole("button", { name: "追加", exact: true }).click();
    await page.getByRole("textbox", { name: "追加文字" }).fill("原生壳里的补充");
    await page.getByRole("button", { name: "保存追加" }).click();
    await expect(moment).toContainText("原生壳里的补充");

    await page.reload();
    const restored = page.getByRole("article").filter({ hasText: "原生壳里的随笔" });
    await expect(restored).toBeVisible();
    await expect(restored.getByRole("img")).toHaveCount(1);
    await expect(restored).toContainText("原生壳里的补充");

    await page.goto("/diary/new/");
    await page.getByRole("textbox", { name: "日记标题（可选）" }).fill("原生日记");
    await page.getByRole("textbox", { name: "日记正文" }).fill("没有 Next 服务器也能写下这一页。");
    await page.getByRole("button", { name: "保存日记" }).click();
    await expect(page).toHaveURL(/\/diary\/open\/\?id=/);
    await expect(page.getByRole("heading", { name: "原生日记" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "原生日记" })).toBeVisible();
    await expect(page.getByText("没有 Next 服务器也能写下这一页。", { exact: true })).toBeVisible();

    await page.goto("/timeline/");
    await expect(page.getByText("原生壳里的随笔", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /原生日记/ })).toHaveAttribute("href", /\/diary\/open\/\?id=/);

    await page.goto("/calendar/");
    await expect(page.getByRole("navigation", { name: "底部导航" })).toBeVisible();
    await page.goto("/search/");
    await page.getByLabel("关键词").fill("原生壳里的随笔");
    await page.getByRole("button", { name: "搜索" }).click();
    await expect(page.getByText("原生壳里的随笔", { exact: true })).toBeVisible();
    await page.goto("/life/");
    await expect(page.getByRole("heading", { name: "生活如何形成" })).toBeVisible();
    await page.goto("/account/");
    await expect(page.getByRole("heading", { name: "账户与备份" })).toBeVisible();
  });
});
