import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

test.use({ hasTouch: true });

// All fixtures live in Playwright's disposable browser context, never a personal profile.
async function seedReviewRecords(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("life-visualization-demo", "off"));
  await page.goto("/");
  await expect(page.getByText("还没有留下片段。", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("life");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stamp = (days: number, hour = 16) => {
      const date = new Date(); date.setDate(date.getDate() - days); date.setHours(hour, 20, 0, 0);
      return date.toISOString();
    };
    const base = (days: number, hour?: number) => ({ id: crypto.randomUUID(), createdAt: stamp(days, hour), updatedAt: stamp(days, hour), deletedAt: null });
    const transaction = database.transaction(["moments", "momentAppends", "diaries", "lifeEvents"], "readwrite");
    const first = { ...base(0), originalText: "傍晚沿着河边走了一会儿。\n风很轻，路边的树开始有了秋天的颜色。", isFavorite: false, location: { city: "上海", placeName: "滨江步道", latitude: null, longitude: null } };
    transaction.objectStore("moments").add(first);
    transaction.objectStore("moments").add({ ...base(0, 10), originalText: "读到一句很喜欢的话，停下来想了很久。\n有些答案，似乎要留给时间。", isFavorite: false, location: null });
    transaction.objectStore("moments").add({ ...base(1), originalText: "和朋友在熟悉的咖啡馆坐了一下午。聊近况，也聊那些还没有开始的计划。", isFavorite: false, location: null });
    transaction.objectStore("momentAppends").add({ ...base(0, 18), momentId: first.id, text: "回家路上买了一束花，放在窗边。" });
    transaction.objectStore("diaries").add({ ...base(1, 21), title: "把日子过慢一点", body: "今天把手机留在了包里，沿着河边慢慢走。\n\n经过那家开了很久的书店，进去翻了几页书。店里安静得能听见纸张的声音。\n\n这些小事未必特别，但我想把它们记下来。以后再翻到时，还能想起今天的风。", isFavorite: false, location: null });
    const groups = [
      ["activity", "散步", 14], ["learning", "阅读", 12], ["creation", "设计产品", 10],
      ["activity", "跑步", 8], ["creation", "写作", 7], ["place", "滨江步道", 6], ["place", "咖啡馆", 5],
    ] as const;
    groups.forEach(([category, name, count], groupIndex) => {
      for (let index = 0; index < count; index++) {
        const days = (index * 3 + groupIndex) % 28;
        const date = new Date(stamp(days));
        const occurredOn = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        transaction.objectStore("lifeEvents").add({ ...base(days), origin: "manual", source: null, category, name, occurredOn, timeZone: "Asia/Shanghai", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1800 + index * 300, metadata: {} });
      }
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`iOS UI: six routes, map keyboard and touch, ${colorScheme}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await seedReviewRecords(page);
    const capture = async (name: string, width: number) => {
      const file = `${name}-${width}-${colorScheme}.png`;
      await page.screenshot({ path: process.env.LIFE_UI_SCREENSHOTS ? path.join(process.env.LIFE_UI_SCREENSHOTS, file) : testInfo.outputPath(file), fullPage: true });
    };
    for (const width of [1440, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/diary", "/timeline", "/calendar", "/search", "/life"]) {
        await page.goto(route);
        if (route === "/") await expect(page.getByRole("article").first()).toContainText("傍晚");
        if (route === "/diary") await expect(page.getByRole("heading", { name: "把日子过慢一点" })).toBeVisible();
        if (route === "/calendar") {
          await page.locator('[data-has-records="true"]').last().click();
          await expect(page.getByRole("group", { name: "记录类型" })).toBeVisible();
        }
        if (route === "/search") {
          await page.getByRole("searchbox").fill("河边");
          await page.getByRole("button", { name: "搜索", exact: true }).click();
          await expect(page.locator("mark").first()).toHaveText("河边");
        }
        if (route === "/life") await expect(page.getByRole("button", { name: "散步，14 次事件" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width}`).toBe(true);
        await capture(route.slice(1) || "home", width);
        if (route === "/") {
          await page.getByRole("button", { name: "写点什么", exact: true }).click();
          await page.getByRole("textbox", { name: "记录内容" }).fill("窗外开始下雨了。\n先记下这一刻，其他的慢慢再说。");
          await capture("home-writing", width);
          page.once("dialog", (dialog) => dialog.accept());
          await page.getByRole("button", { name: "取消", exact: true }).click();
        }
        if (route === "/diary") {
          await page.getByRole("link", { name: /把日子过慢一点/ }).click();
          await expect(page.getByRole("article")).toBeVisible();
          await capture("diary-reading", width);
          await page.getByRole("button", { name: "编辑", exact: true }).click();
          await expect(page.getByRole("textbox", { name: "日记正文" })).toBeVisible();
          await capture("diary-writing", width);
          await page.getByRole("button", { name: "取消", exact: true }).click();
        }
      }
      const activities = page.getByRole("tab", { name: "活动", exact: true });
      await activities.focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab", { name: "地点", exact: true })).toBeFocused();
      await expect(page.getByRole("tabpanel")).toHaveAccessibleName("地点生活地图");
      await page.keyboard.press("End");
      await expect(page.getByRole("tab", { name: "主题", exact: true })).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Home");
      await expect(activities).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "散步，14 次事件" }).tap({ force: true });
      await expect(page.getByRole("complementary", { name: "生活地图详情" })).toBeVisible();
      const bounds = await page.getByRole("complementary", { name: "生活地图详情" }).boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("complementary", { name: "生活地图详情" })).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}
