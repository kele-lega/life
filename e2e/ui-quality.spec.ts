import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`all pages reflow with readable targets and reduced motion: ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    await page.getByRole("textbox", { name: "记录内容" }).fill("晚风吹过来。\n" + "原文与长链接都需要完整保留。".repeat(12));
    await page.getByLabel("选择图片").setInputFiles("e2e/fixtures/test-image.svg");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();
    await page.goto("/diary/new");
    await page.getByRole("textbox", { name: "日记标题（可选）" }).fill("想记住的一段晚风");
    await page.getByRole("textbox", { name: "日记正文" }).fill("正文保留换行。\n\n" + "一段稍长的记录。".repeat(60));
    await page.getByRole("button", { name: "保存日记", exact: true }).click();
    await expect(page).toHaveURL(/\/diary\/(?!new)[^/]+$/);
    const diaryPath = new URL(page.url()).pathname;

    for (const route of ["/", "/timeline", "/calendar", "/diary", diaryPath, "/diary/new", "/search"]) {
      await page.goto(route);
      if (route === "/calendar") {
        await page.locator('[data-has-records="true"]').first().click();
        const days = page.locator(".calendar-day");
        await days.first().focus();
        await page.keyboard.press("ArrowRight");
        await expect(days.nth(1)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(days.nth(1)).toHaveAttribute("aria-pressed", "true");
      }
      if (route === "/search") {
        await page.getByRole("searchbox").fill("晚风");
        await page.getByRole("button", { name: "搜索", exact: true }).click();
        await expect(page.locator("mark").first()).toHaveText("晚风");
      }
      if (route === "/timeline" || route === "/") await expect(page.getByRole("article").first()).toBeVisible();
      await expect(page.locator("main")).toHaveCSS("animation-name", "none");
      for (const width of [320, 390, 430, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}`).toBe(true);
        const targets = await page.locator("main button:visible, main a:visible").evaluateAll((nodes) => nodes.map((node) => {
          const { width, height } = node.getBoundingClientRect();
          return { label: node.textContent, width, height };
        }));
        for (const target of targets) {
          expect(target.width, `${route} ${width} ${target.label}`).toBeGreaterThanOrEqual(44);
          expect(target.height, `${route} ${width} ${target.label}`).toBeGreaterThanOrEqual(44);
        }
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}, 200% type`).toBe(true);
        await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      }
    }
  });
}
