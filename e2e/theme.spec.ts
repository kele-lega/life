import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`shared ${colorScheme} theme follows navigation and system changes`, async ({ page }, testInfo) => {
    const surface = colorScheme === "dark" ? "rgb(28, 29, 28)" : "rgb(250, 249, 246)";
    const ink = colorScheme === "dark" ? "rgb(231, 229, 223)" : "rgb(37, 38, 33)";
    await page.emulateMedia({ colorScheme });
    for (const route of ["/", "/timeline", "/calendar", "/diary", "/search", "/diary/new"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toHaveCSS("background-color", surface);
      await expect(page.locator("body")).toHaveCSS("color", ink);
      await expect(page.locator("html")).toHaveCSS("color-scheme", colorScheme);
      for (const field of await page.getByRole("textbox").all()) {
        await expect(field).toHaveCSS("background-color", surface);
        await expect(field).toHaveCSS("color", ink);
      }
      if (route === "/calendar") {
        const day = page.locator(".calendar-day").first();
        await day.click();
        await expect(day).toHaveAttribute("aria-pressed", "true");
        await expect(day).toHaveCSS("background-color", colorScheme === "dark" ? "rgb(179, 78, 67)" : "rgb(167, 47, 38)");
        await expect(day).toHaveCSS("color", "rgb(255, 255, 255)");
      }
      await page.screenshot({ path: testInfo.outputPath(`${route.replaceAll("/", "_") || "home"}.png`), fullPage: true });
    }

    const body = page.getByRole("textbox", { name: "日记正文" });
    await body.fill("切换主题后，写下的内容仍然保留。");
    await page.getByRole("button", { name: "保存日记" }).click();
    await expect(page.getByRole("article")).toContainText("切换主题后，写下的内容仍然保留。");
    await page.reload();
    await expect(page.locator("body")).toHaveCSS("background-color", surface);
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await expect(body).toHaveCSS("background-color", surface);
    await page.emulateMedia({ colorScheme: colorScheme === "dark" ? "light" : "dark" });
    await expect(body).not.toHaveCSS("background-color", surface);
    await expect(body).toHaveValue("切换主题后，写下的内容仍然保留。");
  });
}
