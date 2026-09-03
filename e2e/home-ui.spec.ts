import { expect, test, type Page } from "@playwright/test";

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function targetsFit(page: Page) {
  const targets = await page.locator("main button:visible, main a:visible").evaluateAll((elements) =>
    elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { text: element.textContent, width, height };
    }),
  );
  for (const target of targets) {
    expect(target.width, `${target.text} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.text} height`).toBeGreaterThanOrEqual(44);
  }
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`homepage UI-1 ${colorScheme}: local recording, full text and responsive controls`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1024 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByText("还没有留下片段。", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "写点什么", exact: true })).toHaveCSS("font-weight", "700");
    const invitation = await page.getByRole("button", { name: "写点什么", exact: true }).boundingBox();
    const recording = await page.locator(".quick-record").boundingBox();
    expect(invitation!.x + invitation!.width / 2).toBeCloseTo(recording!.x + recording!.width / 2, 0);
    await expect(page.getByRole("link", { name: "时间线", exact: true })).toHaveCSS("font-weight", "400");
    await expect(page.locator("main")).toHaveCSS("background-color", colorScheme === "light" ? "rgb(250, 249, 246)" : "rgb(28, 29, 28)");
    await page.screenshot({ path: testInfo.outputPath(`desktop-empty-${colorScheme}.png`), fullPage: true });

    const original = "傍晚去湖边走了走。\n风很轻，湖面像一面镜子。坐在长椅上发呆，听见树叶响动，心里也慢慢静了下来。";
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    const input = page.getByRole("textbox", { name: "记录内容" });
    await expect(input).toBeFocused();
    await expect(page.getByRole("heading", { name: "写点什么", exact: true })).toHaveCSS("text-align", "center");
    await expect(input).toHaveCSS("border-radius", "12px");
    await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCSS("font-weight", "700");
    await expect(page.getByRole("button", { name: "取消", exact: true })).toHaveCSS("font-weight", "400");
    await expect(page.getByRole("button", { name: "添加图片", exact: true })).toHaveCSS("font-weight", "600");
    await input.fill(original);
    await page.getByRole("button", { name: "添加具体地点" }).click();
    await page.getByRole("textbox", { name: "具体地点" }).fill("湖边的小路");
    await page.getByLabel("选择图片").setInputFiles(["e2e/fixtures/test-image.svg", "e2e/fixtures/test-image.svg"]);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    const article = page.getByRole("article");
    await expect(article).toBeVisible();
    await expect(article.locator(":scope > p")).toHaveText(original);
    await article.getByRole("button", { name: "追加", exact: true }).click();
    await page.getByRole("textbox", { name: "追加文字" }).fill("刚才又看了一遍照片，想起那天晚上的风。\n有些片段，写下来就很好。");
    await page.getByRole("button", { name: "保存追加" }).click();
    await expect(article.locator(".append-entry")).toHaveCount(1);
    await page.reload();
    await expect(article.locator(".append-entry")).toHaveCount(1);
    await expect(article.getByRole("img")).toHaveCount(2);
    await expect(article.getByRole("img").first()).toHaveJSProperty("naturalWidth", 4);
    await page.screenshot({ path: testInfo.outputPath(`desktop-records-${colorScheme}.png`), fullPage: true });

    // Match the reference's expanded writing state without changing saved data.
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    await input.fill("今天的风很轻。");
    await page.screenshot({ path: testInfo.outputPath(`desktop-writing-${colorScheme}.png`), fullPage: true });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(input).toHaveCount(0);

    for (const width of [390, 430, 320, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page);
      await targetsFit(page);
      await page.screenshot({ path: testInfo.outputPath(`records-${width}-${colorScheme}.png`), fullPage: true });
      await expect(article.locator(":scope > p")).toHaveText(original);
      if (width < 768) {
        const textBox = await article.locator(":scope > p").boundingBox();
        const rowBox = await article.boundingBox();
        expect(textBox?.width).toBeCloseTo(rowBox!.width, 0);
      }
      if (width === 390) await page.screenshot({ path: testInfo.outputPath(`mobile-records-${colorScheme}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    await input.fill("长段落与长链接也不应该覆盖按钮。\n".repeat(12) + "https://example.test/" + "long".repeat(50));
    await page.getByRole("button", { name: "添加具体地点" }).click();
    await page.getByRole("textbox", { name: "具体地点" }).fill("一段很长的具体地点".repeat(10));
    await noOverflow(page);
    await targetsFit(page);
    await page.screenshot({ path: testInfo.outputPath(`mobile-writing-${colorScheme}.png`), fullPage: true });
    // Text-only zoom verifies reflow without changing the product stylesheet.
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await noOverflow(page);
    await targetsFit(page);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(input).not.toHaveValue("");
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    expect(errors).toEqual([]);
  });
}
