import { expect, test, type Page } from "@playwright/test";

const dock = (page: Page) => page.locator("[data-desktop-dock]");
const trigger = (page: Page) => page.getByRole("button", { name: "显示主导航", exact: true });
const nav = (page: Page) => page.getByRole("navigation", { name: "主导航", exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    sessionStorage.setItem("life-visualization-demo", "off");
  });
});

test("desktop edge navigation opens smoothly without moving content and tolerates pointer return", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();
  await expect(dock(page)).toHaveAttribute("data-open", "false");
  await expect(dock(page).locator("aside")).toHaveAttribute("inert", "");
  await expect(nav(page)).toHaveCount(0);
  const originalBounds = await page.locator("main").boundingBox();

  // Ordinary reading near the margin must not open the drawer.
  await page.mouse.move(70, 400);
  await expect(dock(page)).toHaveAttribute("data-open", "false");
  const positions = dock(page).locator("aside").evaluate((element) => new Promise<number[]>((resolve) => {
    const samples: number[] = [];
    const start = performance.now();
    const sample = () => {
      samples.push(element.getBoundingClientRect().x);
      if (performance.now() - start < 650) requestAnimationFrame(sample);
      else resolve(samples);
    };
    sample();
  }));
  await page.mouse.move(16, 400);
  await expect(dock(page)).toHaveAttribute("data-open", "true");
  await expect(nav(page)).toBeVisible();
  const samples = await positions;
  expect(samples.some((x) => x < -20)).toBe(true);
  expect(samples.some((x) => x > -190 && x < -2)).toBe(true);
  await expect(dock(page).locator("aside")).toHaveCSS("opacity", "1");
  const openBounds = await page.locator("main").boundingBox();
  expect(openBounds!.x).toBeCloseTo(originalBounds!.x, 1);
  expect(openBounds!.width).toBeCloseTo(originalBounds!.width, 1);

  // The 12px inset around the rail remains part of the open pointer surface.
  // Observe every state change so a close/reopen flicker cannot pass a final-state check.
  const edgeStates = dock(page).evaluate((element) => new Promise<(string | null)[]>((resolve) => {
    const states = [element.getAttribute("data-open")];
    const observer = new MutationObserver(() => states.push(element.getAttribute("data-open")));
    observer.observe(element, { attributes: true, attributeFilter: ["data-open"] });
    setTimeout(() => { observer.disconnect(); resolve(states); }, 1800);
  }));
  await page.mouse.move(1, 450);
  await page.waitForTimeout(700);
  await expect(dock(page)).toHaveAttribute("data-open", "true");
  for (const [x, y] of [[20, 1], [20, 899], [10, 450]]) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(220);
    await expect(dock(page)).toHaveAttribute("data-open", "true");
  }
  expect((await edgeStates).every((state) => state === "true")).toBe(true);

  await nav(page).getByRole("link", { name: "日记", exact: true }).hover();
  await expect(dock(page)).toHaveAttribute("data-open", "true");
  await page.mouse.move(600, 400);
  // This deliberate short dwell exercises the grace period, rather than waiting for layout.
  await page.waitForTimeout(70);
  await page.mouse.move(120, 250);
  await page.waitForTimeout(230);
  await expect(dock(page)).toHaveAttribute("data-open", "true");
  await page.mouse.move(600, 400);
  await expect(dock(page)).toHaveAttribute("data-open", "false");
  await expect(dock(page).locator("aside")).toHaveAttribute("inert", "");
  await expect(nav(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("desktop navigation is keyboard reachable, closes with Escape and preserves native routes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到正文", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveAttribute("aria-controls", "desktop-navigation");
  await trigger(page).press("Enter");
  await expect(dock(page)).toHaveAttribute("data-open", "true");
  await expect(dock(page).getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dock(page)).toHaveAttribute("data-open", "false");
  await expect(trigger(page)).toBeFocused();
  await expect(dock(page).locator("aside")).toHaveAttribute("inert", "");
  await trigger(page).press("Enter");
  await nav(page).getByRole("link", { name: "日记", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/diary$/);
  await expect(page.getByRole("heading", { name: "日记", exact: true })).toBeVisible();
  await trigger(page).focus();
  await trigger(page).press("Enter");
  await expect(nav(page).locator('a[aria-current="page"]')).toHaveAttribute("href", "/diary");
  const movement = await dock(page).locator("aside").evaluate((element) => {
    const style = getComputedStyle(element);
    return { durations: style.transitionDuration.split(",").map((duration) => Number.parseFloat(duration)), running: element.getAnimations().filter((animation) => animation.playState === "running").length };
  });
  expect(movement.durations.every((duration) => duration <= 0.001)).toBe(true);
  expect(movement.running).toBe(0);
});

test("desktop edge cannot bypass Moment, Append or Diary draft protection", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容", exact: true }).fill("保留这条原始记录。");
  await page.mouse.move(16, 400);
  await expect(dock(page)).toBeHidden();
  await expect(trigger(page)).toHaveCount(0);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();
  await page.getByRole("article").getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("textbox", { name: "追加文字", exact: true }).fill("追加草稿仍在。");
  await page.mouse.move(16, 400);
  await expect(dock(page)).toBeHidden();
  await expect(trigger(page)).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "追加文字", exact: true })).toHaveValue("追加草稿仍在。");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.goto("/diary/new");
  await page.getByRole("textbox", { name: "日记正文", exact: true }).fill("日记草稿仍在。");
  await page.mouse.move(16, 400);
  await expect(dock(page)).toBeHidden();
  await expect(trigger(page)).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "返回日记", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "日记正文", exact: true })).toHaveValue("日记草稿仍在。");
});

test.describe("touch devices", () => {
  test.use({ hasTouch: true });

  test("drawer breakpoint preserves the existing mobile bar and touch route selection", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1100, 1099, 430, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      const mobile = page.getByRole("navigation", { name: "底部导航", exact: true });
      if (width >= 1100) {
        await expect(mobile).toHaveCount(0);
        await page.mouse.move(16, 400);
        await expect(dock(page)).toHaveAttribute("data-open", "true");
      } else {
        await expect(dock(page)).toBeHidden();
        await expect(trigger(page)).toHaveCount(0);
        await expect(mobile).toBeVisible();
        await expect(mobile.getByRole("link")).toHaveCount(4);
        await expect(mobile.getByRole("link")).toHaveText(["记录", "日记", "回看", "生活地图"]);
        await page.mouse.move(16, 400);
        await expect(dock(page)).toBeHidden();
        await mobile.getByRole("link", { name: "回看", exact: true }).tap();
        await expect(page).toHaveURL(/\/timeline$/);
        await expect(mobile.locator('a[aria-current="page"]')).toHaveAttribute("href", "/timeline");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
});
