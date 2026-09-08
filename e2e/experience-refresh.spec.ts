import { expect, test, type Page } from "@playwright/test";

test.use({ hasTouch: true });

async function prepareIsolatedBrowser(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("life-visualization-demo", "off");
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  });
}

async function seedReadingContent(page: Page) {
  await prepareIsolatedBrowser(page);
  await page.goto("/");
  await expect(page.getByText("还没有留下片段。", { exact: true })).toBeVisible();
  // Fixtures live only in this test's fresh Playwright context, never a personal profile.
  await page.evaluate(async () => {
    const request = indexedDB.open("life");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(["moments", "diaries"], "readwrite");
    const now = new Date().toISOString();
    const base = () => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null, isFavorite: false, location: null });
    for (let index = 0; index < 3; index++) {
      transaction.objectStore("moments").add({ ...base(), originalText: `河边的第 ${index + 1} 个片段。\n${"风经过树梢，继续向前走。\n".repeat(12)}留在页面最后的一句话。` });
    }
    transaction.objectStore("diaries").add({ ...base(), title: "慢慢回望", body: "在河边坐了一会儿。\n\n".repeat(14) + "这一页已经写完。" });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function expectEndOfContentClearOfTabs(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  const bottomNav = page.getByRole("navigation", { name: "底部导航", exact: true });
  const navBounds = await bottomNav.boundingBox();
  expect(navBounds).not.toBeNull();
  // The last visible content/action must remain fully above the fixed bar at scroll end.
  const contentBottom = await page.locator("main p:visible, main button:visible, main a:visible").evaluateAll((elements) => Math.max(...elements
    .filter((element) => !element.closest("[inert], [aria-hidden='true'], .visually-hidden"))
    .map((element) => element.getBoundingClientRect().bottom)));
  expect(contentBottom).toBeLessThanOrEqual(navBounds!.y + 1);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`experience shell: routes, touch targets and unobscured reading in ${colorScheme}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await seedReadingContent(page);

    for (const width of [390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ["/", "/diary", "/timeline", "/calendar", "/search", "/life"]) {
        await page.goto(route);
        if (route === "/" || route === "/timeline") await expect(page.getByRole("article").first()).toContainText("河边");
        if (route === "/diary") await expect(page.getByRole("heading", { name: "慢慢回望" })).toBeVisible();
        if (route === "/calendar") {
          await page.locator('[data-has-records="true"]').click();
          await expect(page.getByRole("article").first()).toContainText("河边");
        }
        if (route === "/search") {
          await page.getByRole("searchbox").fill("河边");
          await page.getByRole("button", { name: "搜索", exact: true }).click();
          await expect(page.locator("mark").first()).toHaveText("河边");
        }
        if (route === "/life") await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
        await expectNoHorizontalOverflow(page);

        const mobile = width < 1100;
        const readingBounds = await page.locator("main").boundingBox();
        if (!mobile) {
          await page.mouse.move(16, 400);
          await expect(page.locator("[data-desktop-dock]")).toHaveAttribute("data-open", "true");
        }
        const nav = page.getByRole("navigation", { name: mobile ? "底部导航" : "主导航", exact: true });
        await expect(nav).toBeVisible();
        const activeRoute = mobile && ["/calendar", "/search"].includes(route) ? "/timeline" : route;
        await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("href", activeRoute);
        const targets = await nav.getByRole("link").evaluateAll((links) => links.map((link) => {
          const { width, height } = link.getBoundingClientRect();
          return { label: link.textContent, width, height };
        }));
        for (const target of targets) {
          expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
          expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
        }
        if (mobile) await expectEndOfContentClearOfTabs(page);
        else {
          const openBounds = await page.locator("main").boundingBox();
          expect(openBounds!.x).toBeCloseTo(readingBounds!.x, 1);
          expect(openBounds!.width).toBeCloseTo(readingBounds!.width, 1);
          await page.mouse.move(width / 2, 400);
          await expect(page.locator("[data-desktop-dock]")).toHaveAttribute("data-open", "false");
        }
      }
      if (width >= 1100) {
        await page.mouse.move(16, 400);
        await expect(page.locator("[data-desktop-dock]")).toHaveAttribute("data-open", "true");
      }
      const nav = page.getByRole("navigation", { name: width < 1100 ? "底部导航" : "主导航", exact: true });
      await nav.getByRole("link", { name: "记录", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("mobile recording keeps drafts isolated from navigation, preserves photos and restores focus", async ({ page }) => {
  test.setTimeout(60_000);
  await prepareIsolatedBrowser(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 660 });
    await page.goto("/");
    const navigation = page.getByRole("navigation", { name: "底部导航", exact: true });
    const invitation = page.getByRole("button", { name: "写点什么", exact: true });
    await invitation.tap();
    const input = page.getByRole("textbox", { name: "记录内容", exact: true });
    await expect(input).toBeFocused();
    await expect(navigation).toBeHidden();
    // Validation is visible and leaves the existing writer open.
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("请输入文字后再保存。");
    await expect(navigation).toBeHidden();
    const original = `${width}px 留下的原始文字。\n${"最后几行也需要舒服地写完。\n".repeat(10)}`;
    await input.fill(original);
    await page.getByLabel("选择图片", { exact: true }).setInputFiles("e2e/fixtures/test-image.svg");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(input).toHaveValue(original);
    await expect(page.getByRole("main").getByRole("img")).toHaveCount(width === 390 ? 1 : 2);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(invitation).toBeFocused();
    await expect(navigation).toBeVisible();

    const article = page.getByRole("article").filter({ hasText: `${width}px 留下的原始文字。` });
    await expect(article.locator(":scope > p")).toHaveText(original);
    await expect(article.getByRole("img")).toHaveJSProperty("naturalWidth", 4);
    const append = article.getByRole("button", { name: "追加", exact: true });
    await append.click();
    await expect(page.getByRole("textbox", { name: "追加文字" })).toBeFocused();
    await expect(navigation).toBeHidden();
    await page.getByRole("textbox", { name: "追加文字" }).fill("补充的这一句有自己的时间。");
    await page.getByRole("button", { name: "保存追加", exact: true }).click();
    await expect(append).toBeFocused();
    await expect(navigation).toBeVisible();
    await page.reload();
    await expect(article.locator(":scope > p")).toHaveText(original);
    await expect(article.locator(".append-entry")).toHaveCount(1);
    await expect(article.getByRole("img")).toHaveJSProperty("naturalWidth", 4);
    await expectEndOfContentClearOfTabs(page);
  }
});

test("Diary writing hides shell exits, preserves return confirmation and reading identity", async ({ page }) => {
  await prepareIsolatedBrowser(page);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 660 });
  await page.goto("/diary/new");
  const navigation = page.getByRole("navigation", { name: "底部导航", exact: true });
  const body = page.getByRole("textbox", { name: "日记正文", exact: true });
  await expect(body).toBeFocused();
  await expect(navigation).toBeHidden();
  const text = "这是没有保存的长篇日记。\n\n".repeat(16) + "结尾保持原样。";
  await body.fill(text);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "返回日记", exact: true }).click();
  await expect(body).toHaveValue(text);
  await expect(page).toHaveURL(/\/diary\/new$/);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "保存日记", exact: true }).click();
  await expect(page).toHaveURL(/\/diary\/(?!new)[^/]+$/);
  const persistedUrl = page.url();
  await expect(page.getByRole("article")).toContainText(text);
  await expect(navigation).toBeVisible();
  await expect(navigation.locator('a[aria-current="page"]')).toHaveAttribute("href", "/diary");
  await expectEndOfContentClearOfTabs(page);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(navigation).toBeHidden();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("button", { name: "编辑", exact: true })).toBeFocused();
  await expect(page).toHaveURL(persistedUrl);
  await expect(navigation).toBeVisible();
});
