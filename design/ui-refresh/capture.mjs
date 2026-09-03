import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Isolated test browser only. Never touches a user's browser profile or records.
const stage = process.argv[2] ?? "before";
const route = process.argv[3];
const baseURL = process.env.LIFE_BASE_URL ?? "http://127.0.0.1:3100";
const folder = resolve("design/ui-refresh", stage);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({ colorScheme, reducedMotion: "reduce", timezoneId: "Asia/Shanghai" });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date("2026-09-03T10:30:00+08:00"));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition(_success, error) { error({ code: 1 }); } } });
    });
    await page.goto(baseURL);
    await page.getByText("还没有留下片段。", { exact: true }).waitFor();
    await page.evaluate(async () => {
      const request = indexedDB.open("life");
      const db = await new Promise((done, fail) => { request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error); });
      const transaction = db.transaction(["moments", "momentAppends", "diaries"], "readwrite");
      const root = (id, createdAt) => ({ id, createdAt, updatedAt: createdAt, deletedAt: null, isFavorite: false, location: null });
      transaction.objectStore("moments").put({ ...root("sample-morning", "2026-09-03T01:42:00.000Z"), originalText: "早上推开窗，闻到了桂花的味道。\n楼下那棵树，好像是一夜之间开了。" });
      transaction.objectStore("moments").put({ ...root("sample-walk", "2026-09-02T10:18:00.000Z"), originalText: "傍晚沿着湖边走了一会儿。\n风吹过来的时候，水面像揉皱的纸。没有拍照，想把这一刻记在这里。", location: { city: "杭州", placeName: "湖边", latitude: null, longitude: null } });
      transaction.objectStore("moments").put({ ...root("sample-book", "2026-09-02T05:06:00.000Z"), originalText: "翻到一本旧书，里面还夹着去年秋天捡的叶子。" });
      transaction.objectStore("momentAppends").put({ ...root("sample-append", "2026-09-02T14:36:00.000Z"), momentId: "sample-walk", text: "回家后才发现，鞋子里进了一小粒沙。" });
      transaction.objectStore("diaries").put({ ...root("sample-diary", "2026-09-01T12:00:00.000Z"), title: "把日子过慢一点", body: "最近想把日子过慢一点。\n\n今天绕了一段远路回家。街角的花店还开着，店主在门口修剪枝叶。我们点了点头，什么也没说。\n\n好像也不需要发生特别的事。一条熟悉的小路，一阵晚风，就已经值得记下来。" });
      await new Promise((done, fail) => { transaction.oncomplete = done; transaction.onerror = () => fail(transaction.error); });
      db.close();
    });
    await page.reload();
    await page.getByText("回家后才发现，鞋子里进了一小粒沙。", { exact: true }).waitFor();
    if (!route) for (const width of [320, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.screenshot({ path: resolve(folder, `home-${width}-${colorScheme}.png`), fullPage: true });
      await page.getByRole("button", { name: "写点什么", exact: true }).click();
      await page.getByRole("textbox", { name: "记录内容" }).fill("今天的风很轻，想起一些很久以前的事。\n写下来，留给以后的自己。");
      await page.screenshot({ path: resolve(folder, `writing-${width}-${colorScheme}.png`), fullPage: true });
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "取消", exact: true }).click();
      await page.getByRole("button", { name: "写点什么", exact: true }).waitFor();
    }
    if (route) {
      await page.goto(`${baseURL}/${route}`);
      if (route === "timeline") await page.locator(".timeline-entry").first().waitFor();
      if (route === "diary") await page.locator(".diary-entry").first().waitFor();
      if (route === "diary/new") await page.getByRole("textbox", { name: "日记正文" }).fill("最近想把日子过慢一点。\n\n今天绕了一段远路回家。街角的花店还开着，店主在门口修剪枝叶。我们点了点头，什么也没说。\n\n好像也不需要发生特别的事。一条熟悉的小路，一阵晚风，就已经值得记下来。");
      if (route === "calendar") {
        await page.getByRole("button", { name: "2026 年 9 月 2 日，有记录", exact: true }).click();
        await page.locator(".timeline-entry").first().waitFor();
      }
      if (route === "search") {
        await page.getByRole("searchbox").fill("风");
        await page.getByRole("button", { name: "搜索", exact: true }).click();
        await page.locator(".search-result").first().waitFor();
      }
      for (const width of [320, 390, 430, 768, 1440]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        await page.mouse.move(0, 0);
        await page.screenshot({ path: resolve(folder, `${route.replaceAll("/", "-")}-${width}-${colorScheme}.png`), fullPage: true });
      }
    }
    if (stage === "before") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      for (const route of ["timeline", "diary", "diary/new", "calendar", "search"]) {
        await page.goto(`${baseURL}/${route}`);
        await page.locator("main").waitFor();
        await page.screenshot({ path: resolve(folder, `${route.replaceAll("/", "-")}-${colorScheme}.png`), fullPage: true });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`Screenshots: ${folder}`);
