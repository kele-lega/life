import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
];

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    if (message.location().url.endsWith("/favicon.ico") && message.text().includes("404")) return;
    // Motion intentionally emits this informational notice in development when reduce is tested.
    if (message.type() === "warning" && message.text() === "You have Reduced Motion enabled on your device. Animations may not appear as expected.. For more information and steps for solving, visit https://motion.dev/troubleshooting/reduced-motion-disabled") return;
    // Next Link prefetches destination CSS before navigation. Chrome reports unused preloads;
    // those advisories are distinct from failed resources, hydration and React warnings.
    if (message.type() === "warning" && /^The resource https?:\/\/[^\s]+\/_next\/static\/chunks\/[^\s]+\.css was preloaded using link preload but not used within a few seconds from the window's load event\. Please make sure it has an appropriate `as` value and it is preloaded intentionally\.$/.test(message.text())) return;
    errors.push(message.text());
  });
  return errors;
}

async function settle(page: Page) {
  // Inspect browser animations, not Motion's private state. Infinite saving feedback is separate.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    return target instanceof Element && target.closest("main") && animation.playState === "running"
      && animation.effect?.getTiming().iterations !== Infinity;
  }).length)).toBe(0);
}

async function fit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const target of await page.locator("main:visible button:visible, main:visible a:visible").evaluateAll((elements) => elements
    .filter((element) => !element.closest("[inert]"))
    .map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { label: element.textContent, width: Math.round(width * 1000) / 1000, height: Math.round(height * 1000) / 1000 };
    }))) {
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
}

async function saveMoment(page: Page, text: string) {
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容" }).fill(text);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();
}

async function seed(page: Page, count: number) {
  // Each test owns an empty, temporary browser profile. The application database schema is untouched.
  await page.goto("/");
  await expect(page.getByLabel("最近记录")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("life");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(["moments", "momentAppends", "diaries"], "readwrite");
    // Keep fixtures older than the record created later in the test at every time of day.
    const now = new Date(Date.now() - 60_000);
    const root = (id: string, offset: number) => {
      const createdAt = new Date(now.getTime() - offset * 60_000).toISOString();
      return { id, createdAt, updatedAt: createdAt, deletedAt: null, isFavorite: false, location: null };
    };
    for (let index = 0; index < count; index += 1) {
      transaction.objectStore("moments").put({ ...root(`motion-${index}`, index), originalText: `片段 ${index + 1}。\n风从窗边吹进来，想把这一刻留下。` });
    }
    if (count) transaction.objectStore("momentAppends").put({ ...root("motion-append", 0), momentId: "motion-0", text: "后来又想起，那天的风很轻。" });
    transaction.objectStore("diaries").put({ ...root("motion-diary", 2), title: "慢慢写下的一天", body: "今天绕了一段远路回家。\n\n一条熟悉的小路，一阵晚风，就已经值得记下来。" });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, count);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(count);
}

test("home enters once; saving only inserts new rows and preserves images and append drafts", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.setViewportSize(viewports[0]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const starts: string[] = [];
    Object.defineProperty(window, "motionStarts", { value: starts });
    document.addEventListener("animationstart", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const section = ["home-date", "quick-record", "recent-heading", "home-secondary-nav"].find((name) => target.classList.contains(name));
      if (section) starts.push(section);
    });
  });
  await page.goto("/");
  await expect(page.getByText("还没有留下片段。", { exact: true })).toBeVisible();
  await settle(page);
  const starts = () => page.evaluate(() => (window as Window & { motionStarts: string[] }).motionStarts);
  expect(await starts()).toEqual(["home-date", "quick-record", "recent-heading", "home-secondary-nav"]);

  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容" }).fill("原来的记忆");
  await page.getByLabel("选择图片").setInputFiles("e2e/fixtures/test-image.svg");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();
  const old = page.getByRole("article").filter({ has: page.locator("p", { hasText: "原来的记忆" }) });
  const row = await old.elementHandle();
  const photo = old.getByRole("img");
  const image = await photo.elementHandle();
  const source = await photo.getAttribute("src");
  await expect(photo).toHaveAttribute("data-loaded", "true");
  await old.getByRole("button", { name: "追加", exact: true }).click();
  await old.getByRole("textbox", { name: "追加文字" }).fill("尚未保存的补充");
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容" }).fill("刚刚保存的记忆");
  await settle(page);
  const samples = await row!.evaluate((element) => new Promise<{ opacity: number; connected: boolean; top: number; time: number }[]>((resolve) => {
    const frames: { opacity: number; connected: boolean; top: number; time: number }[] = [];
    const start = performance.now();
    document.querySelector<HTMLButtonElement>(".record-actions .stateful-button")!.click();
    const sample = () => {
      frames.push({ opacity: Number(getComputedStyle(element).opacity), connected: element.isConnected, top: element.getBoundingClientRect().top, time: performance.now() - start });
      if (performance.now() - start < 700) requestAnimationFrame(sample);
      else resolve(frames);
    };
    requestAnimationFrame(sample);
  }));
  expect(samples.every((frame) => frame.connected && frame.opacity === 1)).toBe(true);
  await testInfo.attach("existing-row-during-insert", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
  await expect(page.getByRole("article")).toHaveCount(2);
  expect(await row!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await image!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(photo).toHaveAttribute("src", source!);
  await expect(photo).toHaveAttribute("data-loaded", "true");
  await expect(old.getByRole("textbox", { name: "追加文字" })).toHaveValue("尚未保存的补充");
  await expect(old).toHaveCSS("opacity", "1");
  await expect(page.getByRole("article").first().locator(":scope > p")).toHaveText("刚刚保存的记忆");
  expect(await starts()).toHaveLength(4);

  const width = await photo.evaluate((element) => element.clientWidth);
  await photo.hover();
  await expect.poll(() => photo.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBeCloseTo(1.02, 2);
  expect(await photo.evaluate((element) => element.clientWidth)).toBe(width);
  await page.mouse.move(0, 0);
  await expect(photo).toHaveCSS("transform", "none");
  expect(errors).toEqual([]);
});

async function rapidToggle(page: Page, region: string, trigger: string, cancel: string) {
  await page.evaluate(async ({ region, trigger, cancel }) => {
    const pause = () => new Promise((resolve) => setTimeout(resolve, 65));
    const click = (selector: string) => {
      const button = document.querySelector<HTMLButtonElement>(`${region} ${selector}`);
      if (!button) throw new Error(`Missing rapid-toggle control: ${selector}`);
      button.click();
    };
    // Reverse well before the 420ms reveal finishes, bypassing Playwright's stability wait.
    for (let index = 0; index < 5; index += 1) {
      click(trigger);
      await pause();
      click(cancel);
      await pause();
    }
    click(trigger);
    await pause();
  }, { region, trigger, cancel });
}

test("rapidly reversed record and append editors keep focus, input and a single reveal", async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize(viewports[3]);
  await page.goto("/");
  await settle(page);
  await rapidToggle(page, ".quick-record", ".write-button", ".record-actions > button:first-child");
  const input = page.getByRole("textbox", { name: "记录内容" });
  await expect(input).toBeFocused();
  const draft = "快速打开后就能输入。\n".repeat(9);
  await input.fill(draft);
  await expect(page.locator(".quick-record .ui-reveal")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(input).toHaveValue(draft);
  await input.focus();
  await expect(input).toHaveCSS("outline-style", "solid");
  await expect.poll(() => input.evaluate((element) => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
  await fit(page);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeFocused();
  await expect(input).toHaveCount(0);

  await rapidToggle(page, ".moment-appends", ".append-trigger", ".append-actions > button:first-child");
  const append = page.getByRole("textbox", { name: "追加文字" });
  await expect(append).toBeFocused();
  await append.fill("第一段追加");
  await page.getByRole("button", { name: "保存追加", exact: true }).click();
  await expect(page.getByRole("button", { name: "追加", exact: true })).toBeFocused();
  const first = await page.locator(".append-entry").elementHandle();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await append.fill("第二段追加");
  await page.getByRole("button", { name: "保存追加", exact: true }).click();
  await expect(page.locator(".append-entry")).toHaveCount(2);
  expect(await first!.evaluate((element) => element.isConnected && getComputedStyle(element).opacity === "1")).toBe(true);
  await expect(append).toHaveCount(0);
  await expect(page.locator(".moment-appends .ui-reveal")).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`real save failure, loading and retry keep button size and input: ${reducedMotion}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    await page.getByRole("button", { name: "写点什么", exact: true }).click();
    const input = page.getByRole("textbox", { name: "记录内容" });
    await input.fill("失败也保留的文字\n再试一次。");
    const save = page.locator(".record-actions .stateful-button");
    const width = (await save.boundingBox())!.width;
    // Abort one actual IndexedDB write. This test-only patch restores itself immediately.
    await page.evaluate(() => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
        const request = key === undefined ? add.call(this, value) : add.call(this, value, key);
        if (this.name === "moments") {
          IDBObjectStore.prototype.add = add;
          this.transaction.abort();
        }
        return request;
      };
    });
    await save.click();
    await expect(page.locator(".record-panel").getByRole("alert")).toContainText("保存失败");
    await expect(input).toHaveValue("失败也保留的文字\n再试一次。");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(save).toBeEnabled();
    expect((await save.boundingBox())!.width).toBeCloseTo(width, 1);

    // A bounded concurrent transaction makes the real save wait, without delaying app code.
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("life");
        request.onsuccess = () => resolve(request.result);
      });
      const transaction = db.transaction("moments", "readwrite");
      const store = transaction.objectStore("moments");
      let held = true;
      Object.defineProperty(window, "releaseMotionLock", { value: () => { held = false; }, configurable: true });
      const deadline = performance.now() + 3000;
      const pump = () => {
        const request = store.get("motion-test-lock");
        request.onsuccess = () => { if (held && performance.now() < deadline) pump(); };
      };
      transaction.oncomplete = () => db.close();
      pump();
    });
    await save.click();
    await expect(save).toHaveAttribute("data-phase", "loading");
    await expect(save).toHaveAccessibleName("保存中…");
    await expect(save).toBeDisabled();
    await expect(save.locator('[role="status"]')).toHaveText("保存中…");
    await expect(save.locator(".stateful-button-spinner")).toHaveCSS("animation-name", reducedMotion === "reduce" ? "none" : "life-saving");
    expect((await save.boundingBox())!.width).toBeCloseTo(width, 1);
    await save.evaluate((button: HTMLButtonElement) => button.click());
    await page.evaluate(() => (window as Window & { releaseMotionLock: () => void }).releaseMotionLock());
    await expect(save).toHaveAttribute("data-phase", "done");
    await expect(save).toHaveAccessibleName("已保存");
    expect((await save.boundingBox())!.width).toBeCloseTo(width, 1);
    await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test("long recent lists finish entering promptly and retain order after another insert", async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await seed(page, 20);
  await expect(page.getByRole("article").last()).toHaveCSS("opacity", "1", { timeout: 1400 });
  const first = await page.getByRole("article").first().elementHandle();
  await saveMoment(page, "最新的片段");
  // This motion regression covers retained rows, not the repository's pre-existing limit behavior.
  await expect.poll(() => page.getByRole("article").count()).toBeGreaterThanOrEqual(20);
  await expect(page.getByRole("article").first().locator(":scope > p")).toHaveText("最新的片段");
  expect(await first!.evaluate((element) => element.isConnected)).toBe(true);
  await settle(page);
  const boxes = await page.locator(".moment-entry").evaluateAll((elements) => elements.map((element) => {
    const { top, bottom } = element.getBoundingClientRect();
    return { top, bottom };
  }));
  boxes.slice(1).forEach((box, index) => expect(box.top).toBeGreaterThanOrEqual(boxes[index].bottom));
  expect(errors).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const reducedMotion of ["reduce", "no-preference"] as const) {
    test(`motion and reading layout at all requested sizes: ${colorScheme}, ${reducedMotion}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const errors = watchErrors(page);
      await page.emulateMedia({ colorScheme, reducedMotion });
      await seed(page, 3);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await expect(page.getByRole("article")).toHaveCount(3);
        await settle(page);
        await fit(page);
        await expect(page.locator("body")).toHaveCSS("background-color", colorScheme === "dark" ? "rgb(21, 21, 23)" : "rgb(245, 245, 247)");
        const suffix = `${viewport.width}-${colorScheme}-${reducedMotion}`;
        await page.screenshot({ path: testInfo.outputPath(`motion-home-${suffix}.png`), fullPage: true });
        if (reducedMotion === "reduce") {
          await expect(page.locator(".quick-record")).toHaveCSS("animation-name", "none");
          await expect(page.getByRole("article").first()).toHaveCSS("transform", "none");
        }
        await page.getByRole("button", { name: "写点什么", exact: true }).click();
        const input = page.getByRole("textbox", { name: "记录内容" });
        await expect(input).toBeFocused();
        await input.fill("今天的风很轻，想起一些很久以前的事。\n写下来，留给以后的自己。");
        await settle(page);
        await expect.poll(() => page.locator(".quick-record .ui-reveal").evaluate((element) =>
          Math.abs(element.getBoundingClientRect().height - element.firstElementChild!.getBoundingClientRect().height),
        )).toBeLessThan(0.5);
        await fit(page);
        const field = (await input.boundingBox())!;
        const actions = (await page.locator(".record-actions").boundingBox())!;
        expect(actions.y).toBeGreaterThanOrEqual(field.y + field.height);
        await page.screenshot({ path: testInfo.outputPath(`motion-writing-${suffix}.png`), fullPage: true });
        page.once("dialog", (dialog) => dialog.accept());
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await expect(input).toHaveCount(0);

        for (const route of ["timeline", "calendar", "diary", "search"]) {
          await page.goto(`/${route}`);
          await expect(page.locator("main")).toBeVisible();
          if (route === "search") {
            await page.getByRole("searchbox").fill("片段");
            await page.getByRole("searchbox").press("Enter");
            await expect(page.locator(".search-result")).toHaveCount(3);
          }
          if (route === "calendar") {
            await page.locator('[data-has-records="true"]').first().click();
            await expect(page.locator(".timeline-entry")).toHaveCount(4);
          }
          await settle(page);
          await fit(page);
          await expect(page.locator(".motion-page")).toHaveCSS("transform", "none");
          if (reducedMotion === "reduce") await expect(page.locator(".motion-page")).toHaveCSS("animation-name", "none");
          if (viewport.width === 390 || viewport.width === 1440) {
            await page.screenshot({ path: testInfo.outputPath(`motion-${route}-${suffix}.png`), fullPage: true });
          }
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test("page boundaries keep same-route input and native back/forward navigation", async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await seed(page, 3);
  await page.getByRole("button", { name: "生活脉络" }).click();
  await page.getByRole("link", { name: /搜索/ }).click();
  const search = page.getByRole("searchbox");
  await search.fill("片段");
  await search.press("Enter");
  await expect(page.locator(".search-result")).toHaveCount(3);
  const input = await search.elementHandle();
  await page.evaluate(() => window.history.pushState(null, "", "#reading"));
  await page.goBack();
  await expect(search).toHaveValue("片段");
  expect(await input!.evaluate((element) => element.isConnected)).toBe(true);
  const link = page.getByRole("link", { name: "时间线", exact: true });
  await link.focus();
  await expect(link).toHaveCSS("outline-style", "solid");
  await expect(link).toHaveCSS("transform", "none");
  await link.press("Enter");
  await expect(page).toHaveURL(/\/timeline$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/search$/);
  await expect(search).toBeVisible();
  // Cross-route search restoration is not implemented by the existing app. No new cache is added.
  await search.fill("片段");
  await search.press("Enter");
  await expect(page.locator(".search-result")).toHaveCount(3);
  await page.goForward();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(page.locator("main:visible")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".timeline-entry")).toHaveCount(4);
  expect(errors).toEqual([]);
});
