import { expect, test, type Page } from "@playwright/test";

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function waitForOfflineShell(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) return false;
    const cache = await caches.open("life-pwa-v1-pages");
    const keys = await cache.keys();
    return ["/", "/diary", "/diary/new", "/timeline", "/calendar", "/search", "/life"]
      .every((path) => keys.some((key) => new URL(key.url).pathname === path));
  }), { timeout: 30_000 }).toBe(true);
}

for (const width of [390, 430]) {
  test(`mobile writer uses the visible viewport and native browser media entry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: width === 390 ? "light" : "dark", reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "写点什么", exact: true }).click();

    const writer = page.locator(".quick-record[data-recording='true']");
    const bounds = await writer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeCloseTo(0, 0);
    expect(bounds!.width).toBeCloseTo(width, 0);
    expect(bounds!.height).toBeLessThanOrEqual(844);
    await expect(page.getByRole("navigation", { name: "底部导航" })).toBeHidden();
    await expect(page.getByLabel("拍摄照片")).toHaveAttribute("capture", "environment");
    await expect(page.getByRole("button", { name: "添加位置" })).toBeVisible();

    const targets = await writer.locator("button:visible").evaluateAll((buttons) => buttons.map((button) => {
      const { width: targetWidth, height } = button.getBoundingClientRect();
      return { targetWidth, height, label: button.textContent };
    }));
    for (const target of targets) {
      expect(target.targetWidth, `${target.label} width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
    }
    await expectNoOverflow(page);
  });
}

test("saved local photos open in a full-screen viewer and restore trigger focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容" }).fill("留下一张可以重新看见的照片");
  await page.getByLabel("选择图片").setInputFiles("e2e/fixtures/test-image.svg");
  await page.getByRole("button", { name: "保存", exact: true }).click();

  const trigger = page.getByRole("button", { name: "查看图片：test-image.svg" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "查看图片：test-image.svg" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: "test-image.svg" })).toBeVisible();
  await page.getByRole("button", { name: "关闭图片" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("installed shell records and recalls Moment, photo, Append and Diary while offline", async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    sessionStorage.setItem("life-visualization-demo", "off");
  });
  await page.goto("/");
  await waitForOfflineShell(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容" }).fill("飞行模式里的随笔");
  await page.getByLabel("选择图片").setInputFiles("e2e/fixtures/test-image.svg");
  await page.getByRole("button", { name: "添加位置" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const moment = page.getByRole("article").filter({ hasText: "飞行模式里的随笔" });
  await expect(moment).toBeVisible();
  await expect(moment.getByRole("img")).toHaveCount(1);

  await moment.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("textbox", { name: "追加文字" }).fill("飞行模式里的补充");
  await page.getByRole("button", { name: "保存追加" }).click();
  await expect(moment).toContainText("飞行模式里的补充");

  await context.setOffline(false);
  await page.goto("/diary/new");
  await context.setOffline(true);
  await page.getByRole("textbox", { name: "日记标题（可选）" }).fill("离线的一页");
  await page.getByRole("textbox", { name: "日记正文" }).fill("没有网络也可以完整写下这一页。");
  await page.getByRole("button", { name: "保存日记" }).click();
  await expect(page.getByRole("textbox", { name: "日记正文" })).toHaveCount(0);
  await context.setOffline(false);
  await page.goto("/diary");
  await expect(page.getByRole("heading", { name: "离线的一页" })).toBeVisible();
  await page.goto("/timeline");
  await expect(page.getByText("飞行模式里的随笔", { exact: true })).toBeVisible();
  await expect(page.getByText("飞行模式里的补充", { exact: true })).toBeVisible();
  await expectNoOverflow(page);
});
