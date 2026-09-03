import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`stateful save buttons: ${colorScheme}, real persistence and original labels`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: colorScheme === "light" ? "reduce" : "no-preference" });
    await page.setViewportSize({ width: colorScheme === "light" ? 1440 : 390, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // The existing app has no favicon. Exclude only that known asset 404;
      // hydration, runtime, stylesheet, script, and other resource errors still fail.
      if (message.location().url === "http://127.0.0.1:3100/favicon.ico" && message.text().includes("404")) return;
      errors.push(`${message.text()} (${message.location().url})`);
    });
    await page.goto("/");
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    await page.getByRole("textbox", { name: "记录内容" }).fill("保存按钮的真实记录\n原文保持不变。");
    const save = page.getByRole("button", { name: "保存", exact: true });
    await expect(save).toHaveCSS("height", "44px");
    await expect(save).toHaveCSS("min-width", "104px");
    await expect(save).toHaveCSS("border-radius", "8px");
    await expect(save).toHaveCSS("font-weight", "700");
    await expect(save).toHaveCSS("border-top-style", "solid");
    const idleWidth = (await save.boundingBox())!.width;
    await page.screenshot({ path: testInfo.outputPath(`save-idle-${colorScheme}.png`), fullPage: true });
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(save).toHaveAttribute("data-phase", "done");
    await expect(save).toBeDisabled();
    await expect(save).toHaveAccessibleName("保存");
    await expect(save.locator("path")).toHaveAttribute("d", "M 3 8.5 L 6.5 12 L 13 4.5");
    await expect(save.locator("path")).toHaveAttribute("stroke-dasharray", "1 1");
    await expect(page.getByRole("article")).toContainText("原文保持不变。");
    await expect.poll(async () => (await save.boundingBox())!.width).toBeGreaterThan(idleWidth);
    await page.screenshot({ path: testInfo.outputPath(`save-done-${colorScheme}.png`), animations: "disabled", fullPage: true });
    await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);

    const article = page.getByRole("article");
    await article.getByRole("button", { name: "追加", exact: true }).click();
    await page.getByRole("textbox", { name: "追加文字" }).fill("后来补充的内容。");
    const append = page.getByRole("button", { name: "保存追加", exact: true });
    await append.click();
    await expect(append).toHaveAttribute("data-phase", "done");
    await expect(append).toHaveAccessibleName("保存追加");
    await expect(append).toBeDisabled();
    await expect(article.locator(".append-entry")).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: "追加文字" })).toHaveCount(0);
    await page.reload();
    await expect(article).toHaveCount(1);
    await expect(article.locator(".append-entry")).toHaveCount(1);

    await page.goto("/diary/new");
    await page.getByRole("textbox", { name: "日记正文" }).fill("可选标题的日记，也使用原来的保存文字。");
    const diary = page.getByRole("button", { name: "保存日记", exact: true });
    await diary.click();
    await expect(diary).toHaveAttribute("data-phase", "done");
    await expect(diary).toHaveAccessibleName("保存日记");
    await expect(diary).toBeDisabled();
    await expect(page).toHaveURL(/\/diary\/(?!new)[^/]+$/);
    await page.reload();
    await expect(page.getByRole("article")).toContainText("可选标题的日记");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
