import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("design/phase17a", { recursive: true });
const baseUrl = process.env.PHASE17_BASE_URL ?? "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "chrome" });
for (const { width, color } of [{ width: 390, color: "light" }, { width: 430, color: "dark" }]) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: color, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined }));
  await page.goto(`${baseUrl}/`);
  await page.getByRole("button", { name: "写点什么", exact: true }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `design/phase17a/home-${width}-${color}.png` });
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容" }).fill("傍晚走到河边，风从树叶间穿过来。\n想把这一刻安静地留下。");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `design/phase17a/writer-${width}-${color}.png` });
  await context.close();
}
await browser.close();
