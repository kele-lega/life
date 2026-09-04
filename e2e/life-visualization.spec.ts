import { expect, test } from "@playwright/test";

function naturalDate(daysAgo: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("Life Map grows from real LifeEvents and supports lens and record exploration", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => window.sessionStorage.setItem("life-visualization-demo", "off"));
  await page.goto("/life");
  await expect(page.getByText("地图还在等待新的足迹。")).toBeVisible();

  const groups = [
    { category: "learning", name: "阅读", count: 16, duration: 2400 },
    { category: "activity", name: "工作", count: 12, duration: 3300 },
    { category: "activity", name: "健身", count: 9, duration: 3600 },
    { category: "creation", name: "摄影", count: 8, duration: 4200 },
    { category: "activity", name: "旅行", count: 7, duration: 5400 },
    { category: "creation", name: "音乐", count: 6, duration: 2700 },
    { category: "place", name: "家", count: 3, duration: 1800 },
    { category: "place", name: "公司", count: 3, duration: 2700 },
    { category: "place", name: "咖啡馆", count: 2, duration: 2400 },
    { category: "place", name: "健身房", count: 2, duration: 3600 },
    { category: "place", name: "户外", count: 2, duration: 4500 },
    { category: "place", name: "旅行城市", count: 2, duration: 6000 },
  ];
  let recordIndex = 0;
  const fixtures = groups.flatMap((group, groupIndex) => Array.from({ length: group.count }, (_, groupEventIndex) => {
    const index = recordIndex++;
    const daysAgo = (groupIndex * 3 + groupEventIndex * 2) % 29;
    const durationSeconds = group.name === "阅读" && groupEventIndex === 2 ? null : group.duration + groupEventIndex * 60;
    return {
      id: `30000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
      origin: "manual",
      source: null,
      category: group.category,
      name: group.name,
      occurredOn: naturalDate(daysAgo),
      timeZone: "Asia/Shanghai",
      timePrecision: "day",
      startAt: null,
      endAt: null,
      durationSeconds,
      metadata: {},
      createdAt: `${naturalDate(daysAgo)}T04:00:00.000Z`,
      updatedAt: `${naturalDate(daysAgo)}T04:00:00.000Z`,
      deletedAt: null,
    };
  }));

  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("life");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("lifeEvents", "readwrite");
      for (const record of records) transaction.objectStore("lifeEvents").add(record);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, fixtures);

  await page.reload();
  await expect(page.getByRole("button", { name: "阅读，16 次事件" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "阅读，16 次事件" }).hover();
  const inspector = page.getByRole("complementary", { name: "生活地图详情" });
  await expect(inspector.getByRole("heading", { name: "阅读" })).toBeVisible();
  await expect(inspector.getByText("16 次", { exact: true })).toBeVisible();
  await page.waitForTimeout(180);
  await expect(page.getByRole("button", { name: "工作，12 次事件" })).toHaveCSS("opacity", "0.24");
  await page.addStyleTag({ content: "nextjs-portal, .skip-link { display: none !important; }" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "design/life-visualization/implementation-1280.png" });
  await page.locator("h1").hover();
  await expect(inspector).toHaveCount(0);

  await page.getByRole("tab", { name: "地点" }).click();
  await expect(page.getByRole("tab", { name: "地点" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "家，3 次事件" })).toBeVisible();
  await expect(page.getByRole("button", { name: "公司，3 次事件" })).toBeVisible();

  await page.getByRole("button", { name: "家，3 次事件" }).hover();
  await expect(page.getByRole("complementary", { name: "生活地图详情" }).getByRole("heading", { name: "家" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "来源" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "LifeEvent" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "活动" }).click();
  await page.getByRole("button", { name: "阅读，16 次事件" }).click();
  await expect(inspector.getByRole("heading", { name: "阅读" })).toBeVisible();
  await page.waitForTimeout(350);
  await page.locator("h1").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "design/life-visualization/implementation-390.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Life Map stays operable at 320px and honors reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => window.sessionStorage.setItem("life-visualization-demo", "off"));
  await page.goto("/life");
  await expect(page.getByRole("heading", { name: "生活视角切换" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "生活观察角度" })).toBeVisible();
  await page.getByRole("tab", { name: "主题" }).focus();
  await expect(page.getByRole("tab", { name: "主题" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("development Demo Data reveals the complete map without IndexedDB fixtures", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/life");
  await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /项目开发，/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /阅读，/ })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "其他生活观察角度" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "来源" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "LifeEvent" })).toHaveCount(0);
  await page.getByRole("button", { name: /阅读，/ }).hover();
  await expect(page.getByRole("complementary", { name: "生活地图详情" }).getByRole("heading", { name: "阅读" })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal, .skip-link { display: none !important; }" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(180);
  await page.screenshot({ path: "design/life-visualization/demo-desktop-1280.png" });
  await page.locator("h1").hover();
  await expect(page.getByRole("complementary", { name: "生活地图详情" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
  await page.locator("h1").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "design/life-visualization/demo-mobile-390.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
