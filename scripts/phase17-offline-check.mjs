import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto("http://127.0.0.1:3110/");
await page.waitForFunction(async () => {
  if (!("serviceWorker" in navigator)) return false;
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) return false;
  const pages = await caches.open("life-pwa-v2-pages");
  return (await pages.keys()).some((request) => new URL(request.url).pathname === "/");
}, null, { timeout: 30000 });
await context.setOffline(true);
await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
await page.getByRole("button", { name: "写点什么", exact: true }).waitFor({ timeout: 15000 });
console.log("offline cold start: ok");
await browser.close();
