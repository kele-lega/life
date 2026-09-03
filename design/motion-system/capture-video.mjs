import { chromium } from "@playwright/test";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";

// Run against the local production server. All records belong to disposable browser contexts.
const baseURL = process.env.LIFE_BASE_URL ?? "http://127.0.0.1:3101";
const folder = resolve("design/motion-system/production");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, colorScheme, reducedMotion: "no-preference",
      timezoneId: "Asia/Shanghai", recordVideo: { dir: folder, size: { width: 390, height: 844 } },
    });
    const page = await context.newPage();
    const video = page.video();
    await page.clock.setFixedTime(new Date("2026-09-03T10:30:00+08:00"));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition(_success, error) { error({ code: 1 }); } } });
    });
    await page.goto(baseURL);
    await page.getByText("还没有留下片段。", { exact: true }).waitFor();
    // Short pauses here make the actual transitions legible in the review recording.
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    await page.getByRole("textbox", { name: "记录内容" }).pressSequentially("今天的风很轻。\n写下来，留给以后的自己。", { delay: 65 });
    await page.waitForTimeout(450);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("button", { name: "写点什么", exact: true }).waitFor();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await page.getByRole("textbox", { name: "追加文字" }).pressSequentially("后来又想起，窗边还留着桂花香。", { delay: 55 });
    await page.getByRole("button", { name: "保存追加", exact: true }).click();
    await page.getByRole("button", { name: "追加", exact: true }).waitFor();
    await page.waitForTimeout(500);
    await page.clock.setFixedTime(new Date("2026-09-03T10:31:00+08:00"));
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    await page.getByRole("textbox", { name: "记录内容" }).pressSequentially("散步回来，天色已经暗了。", { delay: 65 });
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("button", { name: "写点什么", exact: true }).waitFor();
    await page.waitForTimeout(600);
    await page.getByRole("link", { name: "时间线", exact: true }).click();
    await page.waitForTimeout(850);
    await page.getByRole("link", { name: "返回首页", exact: true }).click();
    await page.locator(".moment-entry").first().waitFor();
    await page.waitForTimeout(800);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: resolve(folder, `home-390-${colorScheme}.png`), fullPage: true });
    await context.close();
    await rename(await video.path(), resolve(folder, `interaction-390-${colorScheme}.webm`));
  }
} finally {
  await browser.close();
}
console.log(`Production recordings: ${folder}`);
