import { expect, test, type Page } from "@playwright/test";

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("writing grows with content, restores keyboard focus, and keeps the last lines visible without CSS field-sizing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Exercise the JS path used by engines without content-sized form controls.
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS);
    CSS.supports = (...args: [string, string?]) => {
      if (args[0] === "field-sizing") return false;
      return args.length === 2 ? supports(args[0], args[1]!) : supports(args[0]);
    };
  });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到正文" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  const invitation = page.getByRole("button", { name: "写点什么", exact: true });
  await expect(invitation).toBeFocused();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "记录内容" });
  await expect(input).toBeFocused();
  await input.evaluate((element) => { element.style.setProperty("field-sizing", "fixed"); });
  const text = "风从窗边吹进来。\n".repeat(18) + "最后一句也要完整保留。";
  await input.fill(text);
  await expect.poll(() => input.evaluate((element) => element.clientHeight >= element.scrollHeight - 2)).toBe(true);
  await noOverflow(page);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(invitation).toBeFocused();
  await expect(page.getByRole("article").locator(":scope > p")).toHaveText(text);
  await expect(page.getByRole("textbox", { name: "记录内容" })).toHaveCount(0);
  const append = page.getByRole("button", { name: "追加", exact: true });
  await append.click();
  await expect(page.getByRole("textbox", { name: "追加文字" })).toBeFocused();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(append).toBeFocused();
});

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
    const invitation = await page.getByRole("button", { name: "写点什么", exact: true }).boundingBox();
    const recording = await page.locator(".quick-record").boundingBox();
    // The whole invitation row is a touch target, not only its lettering.
    expect(invitation!.width).toBeCloseTo(recording!.width, 0);
    const lifePortal = page.getByRole("button", { name: "生活脉络" });
    await expect(lifePortal).toHaveAttribute("aria-expanded", "false");
    await lifePortal.click();
    await expect(page.getByRole("link", { name: /时间线/ })).toHaveCSS("font-weight", "400");
    await expect(page.getByRole("link", { name: /生活地图/ })).toHaveAttribute("href", "/life");
    await page.getByRole("button", { name: "生活脉络" }).click();
    await expect(page.locator("main")).toHaveCSS("background-color", colorScheme === "light" ? "rgb(245, 245, 247)" : "rgb(21, 21, 23)");
    await page.screenshot({ path: testInfo.outputPath(`desktop-empty-${colorScheme}.png`), fullPage: true });

    const original = "傍晚去湖边走了走。\n风很轻，湖面像一面镜子。坐在长椅上发呆，听见树叶响动，心里也慢慢静了下来。";
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    const input = page.getByRole("textbox", { name: "记录内容" });
    await expect(input).toBeFocused();
    await expect(page.getByRole("heading", { name: "写点什么", exact: true })).toBeVisible();
    await expect(input).toHaveCSS("border-radius", "16px");
    await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCSS("font-weight", "700");
    await expect(page.getByRole("button", { name: "取消", exact: true })).toHaveCSS("font-weight", "400");
    await expect(page.getByRole("button", { name: "添加图片", exact: true })).toBeEnabled();
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
    await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeFocused();

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

test("life path progressively reveals every product destination without overflowing", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  for (const width of [320, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const trigger = page.getByRole("button", { name: "生活脉络" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();

    for (const destination of [
      ["时间线", "/timeline"],
      ["日历", "/calendar"],
      ["搜索", "/search"],
      ["日记", "/diary"],
      ["生活地图", "/life"],
    ] as const) {
      await expect(page.getByRole("link", { name: new RegExp(destination[0]) }))
        .toHaveAttribute("href", destination[1]);
    }

    await noOverflow(page);
    await targetsFit(page);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`life-path-${width}.png`), fullPage: true });
    }

    await page.getByRole("link", { name: /日历/ }).focus();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "生活脉络" })).toBeFocused();
  }
});
