import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("design/experience-refresh/sidebar");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }, colorScheme,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    await page.goto(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3180");
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    await page.getByRole("textbox", { name: "记录内容" }).fill("傍晚沿着河边走了一会儿。\n风很轻，路边的树开始有了秋天的颜色。");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("article").first()).toContainText("傍晚");
    await page.reload();
    await expect(page.getByRole("article").first()).toContainText("傍晚");
    await page.mouse.move(700, 650);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(output, `closed-${colorScheme}.png`) });
    await page.mouse.move(1, 450);
    await page.waitForTimeout(750);
    await expect(page.locator("[data-desktop-dock]")).toHaveAttribute("data-open", "true");
    await page.screenshot({ path: path.join(output, `open-${colorScheme}.png`) });
    const state = await context.storageState({ indexedDB: true });
    await context.close();

    const recording = await browser.newContext({
      viewport: { width: 1440, height: 900 }, colorScheme,
      reducedMotion: "no-preference", storageState: state,
      recordVideo: { dir: output, size: { width: 1440, height: 900 } },
    });
    const demo = await recording.newPage();
    await demo.goto(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3180");
    await expect(demo.getByRole("article").first()).toContainText("傍晚");
    await demo.mouse.move(700, 650);
    await demo.waitForTimeout(900);
    await demo.mouse.move(1, 450);
    await demo.waitForTimeout(1300);
    await demo.getByRole("link", { name: "日记", exact: true }).hover();
    await demo.waitForTimeout(700);
    await demo.mouse.move(700, 650);
    await demo.waitForTimeout(1000);
    await demo.mouse.move(16, 450);
    await demo.waitForTimeout(1100);
    await demo.mouse.move(700, 650);
    await demo.waitForTimeout(1100);
    const video = demo.video();
    await recording.close();
    await video.saveAs(path.join(output, `motion-${colorScheme}.webm`));
    await video.delete();
    console.log(`Captured desktop sidebar in ${colorScheme} mode`);
  }
} finally {
  await browser.close();
}
