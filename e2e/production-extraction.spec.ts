import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { LifeEventCandidate, LifeEventProposal, LifeExtractionJob } from "../src/features/life-intelligence/model/types";
import type { LifeEvent } from "../src/features/life-event/model/types";

const descriptor = { name: "openai-life-event", version: "1.0.0", schemaVersion: 1, provider: "openai", model: "gpt-5.6-terra" };
const limits = { textBytes: 65_536, requestBytes: 81_920, responseBytes: 131_072, candidates: 32, timeoutMs: 30_000 };
interface ExtractionPayload {
  text: string;
  context: { occurredOn: string; timeZone: string };
  descriptor: typeof descriptor;
}
interface RecordedCall { method: string; payload?: ExtractionPayload }

async function mockExtraction(context: BrowserContext, options: { failFirst?: boolean } = {}) {
  const calls: RecordedCall[] = [];
  let failed = false;
  await context.route("**/api/life-extraction", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      calls.push({ method });
      await route.fulfill({ json: { descriptor, limits } });
      return;
    }
    const payload = route.request().postDataJSON() as ExtractionPayload;
    calls.push({ method, payload });
    if (options.failFirst && !failed) {
      failed = true;
      await route.abort("failed");
      return;
    }
    const facts = [
      { name: "跑步", category: "activity", durationSeconds: 1800 },
      { name: "阅读", category: "learning", durationSeconds: 1800 },
      { name: "写作", category: "creation", durationSeconds: null },
    ] as const;
    const candidates = facts.filter(({ name }) => payload.text.includes(name)).map(({ name, category, durationSeconds }) => ({
      candidateKey: `fixture-${category}-${name}`,
      candidate: { category, name, ...payload.context, timePrecision: "day", startAt: null, endAt: null, durationSeconds } satisfies LifeEventCandidate,
      evidenceRanges: [{ start: payload.text.indexOf(name), end: payload.text.indexOf(name) + name.length }],
    }));
    await route.fulfill({ json: { candidates } });
  });
  return calls;
}

async function readTable<T = Record<string, unknown>>(page: Page, name: string): Promise<T[]> {
  return page.evaluate(async (table) => {
    const request = indexedDB.open("life");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const query = database.transaction(table, "readonly").objectStore(table).getAll();
    const records = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    database.close();
    return Promise.all(records.map(async (record) => record.blob instanceof Blob
      ? { ...record, blob: { type: record.blob.type, size: record.blob.size, bytes: Array.from(new Uint8Array(await record.blob.arrayBuffer())) } }
      : record));
  }, name) as Promise<T[]>;
}

async function originalSnapshot(page: Page) {
  const tables = ["moments", "momentAppends", "attachments", "diaries"];
  return Object.fromEntries(await Promise.all(tables.map(async (name) => [name, await readTable(page, name)])));
}

async function createMoment(page: Page, text: string, includePrivateMetadata = false) {
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容", exact: true }).fill(text);
  if (includePrivateMetadata) {
    await page.getByRole("button", { name: "添加具体地点", exact: true }).click();
    await page.getByRole("textbox", { name: "具体地点", exact: true }).fill("仅在本地保留的地点");
    await page.getByLabel("选择图片", { exact: true }).setInputFiles("e2e/fixtures/test-image.svg");
  }
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "记录内容", exact: true })).toHaveCount(0);
  return page.getByRole("main").getByRole("article").filter({ hasText: text });
}

async function openReview(page: Page, source: Locator) {
  const button = source.getByRole("button", { name: "整理", exact: true });
  await expect(button).toHaveAttribute("aria-haspopup", "dialog");
  await button.click();
  const dialog = page.getByRole("dialog", { name: "整理记录", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeReview(page: Page) {
  await page.getByRole("dialog", { name: "整理记录", exact: true }).getByRole("button", { name: "关闭整理", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "整理记录", exact: true })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    sessionStorage.setItem("life-visualization-demo", "off");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("explicit Moment extraction sends only the original text and persists all three review outcomes", async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await mockExtraction(context);
  await page.goto("/");
  const text = "晚上跑步三十分钟。\n随后阅读半小时，回家写作。";
  const article = await createMoment(page, text, true);
  await article.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("textbox", { name: "追加文字", exact: true }).fill("这段追加的私人内容不发送。");
  await page.getByRole("button", { name: "保存追加", exact: true }).click();
  await expect(article.locator(".append-entry")).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "追加文字", exact: true })).toHaveCount(0);
  const originals = await originalSnapshot(page);
  expect(calls).toEqual([]);

  const dialog = await openReview(page, article);
  await expect(dialog.getByRole("button", { name: "开始整理", exact: true })).toBeEnabled();
  expect(calls).toEqual([]);
  await dialog.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect(dialog.getByRole("article")).toHaveCount(3);
  expect(calls.map(({ method }) => method)).toEqual(["GET", "POST"]);
  const payload = calls.find(({ method }) => method === "POST")!.payload!;
  expect(Object.keys(payload).sort()).toEqual(["context", "descriptor", "text"]);
  expect(Object.keys(payload.context).sort()).toEqual(["occurredOn", "timeZone"]);
  expect(payload.text).toBe(text);
  expect(payload.descriptor).toEqual(descriptor);
  expect(JSON.stringify(payload)).not.toContain("仅在本地保留的地点");
  expect(JSON.stringify(payload)).not.toContain("这段追加的私人内容");
  expect(JSON.stringify(payload)).not.toContain("test-image.svg");
  const moment = (await readTable(page, "moments"))[0];
  expect(JSON.stringify(payload)).not.toContain(moment.id);
  const expectedContext = await page.evaluate((createdAt) => {
    const date = new Date(createdAt);
    return { occurredOn: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  }, moment.createdAt as string);
  expect(payload.context).toEqual(expectedContext);
  await expect(dialog.getByRole("article", { name: "跑步", exact: true }).getByLabel("原文证据")).toContainText("跑步");
  expect(await readTable(page, "lifeEvents")).toHaveLength(0);

  const running = dialog.getByRole("article", { name: "跑步", exact: true });
  await running.getByRole("button", { name: "拒绝", exact: true }).click();
  await expect(running.getByText("已拒绝", { exact: true })).toBeVisible();
  expect(await readTable(page, "lifeEvents")).toHaveLength(0);
  const reading = dialog.getByRole("article", { name: "阅读", exact: true });
  await reading.getByRole("button", { name: "接受", exact: true }).click();
  await expect(reading.getByText("已接受", { exact: true })).toBeVisible();
  await dialog.getByRole("article", { name: "写作", exact: true }).getByRole("button", { name: "修正", exact: true }).click();
  await dialog.getByRole("textbox", { name: "修正名称", exact: true }).fill("写随笔");
  await dialog.getByLabel("持续时间（秒，可留空）", { exact: true }).fill("600");
  await dialog.getByRole("button", { name: "保存修正", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "写随笔", exact: true }).getByText("已修正", { exact: true })).toBeVisible();

  const proposals = await readTable<LifeEventProposal>(page, "lifeEventProposals");
  const events = await readTable<LifeEvent>(page, "lifeEvents");
  const jobs = await readTable<LifeExtractionJob>(page, "lifeExtractionJobs");
  expect(jobs).toHaveLength(1);
  expect(jobs[0].input).toEqual({ kind: "record", source: expect.objectContaining({ type: "moment", id: moment.id, contentFingerprint: expect.any(String) }) });
  expect(jobs[0].extractor).toEqual(descriptor);
  expect(events).toHaveLength(2);
  for (const [name, origin, status] of [["阅读", "ai", "accepted"], ["写随笔", "manual", "corrected"]] as const) {
    const event = events.find((value) => value.name === name)!;
    expect(event).toMatchObject({ origin, source: { type: "moment", id: moment.id }, extractionProposalId: expect.any(String) });
    expect(proposals.find((proposal) => proposal.id === event.extractionProposalId)).toMatchObject({ status, materializedLifeEventId: event.id });
  }
  expect(events.find((event) => event.name === "写随笔")?.durationSeconds).toBe(600);
  expect(await originalSnapshot(page)).toEqual(originals);
  expect(calls).toHaveLength(2);
  await closeReview(page);
  await expect(article.getByRole("button", { name: "整理", exact: true })).toBeFocused();
  await page.reload();
  const restored = await openReview(page, article);
  await expect(restored.getByText("已拒绝", { exact: true })).toBeVisible();
  await expect(restored.getByText("已接受", { exact: true })).toBeVisible();
  await expect(restored.getByText("已修正", { exact: true })).toBeVisible();
  expect(calls).toHaveLength(2);
  await closeReview(page);

  for (const route of ["/timeline", "/calendar", "/search"]) {
    await page.goto(route);
    if (route === "/calendar") await page.locator('[data-has-records="true"]').click();
    if (route === "/search") {
      await page.getByRole("searchbox").fill("跑步");
      await page.getByRole("searchbox").press("Enter");
    }
    const existingReview = await openReview(page, page.getByRole("main").getByRole("article").first());
    await expect(existingReview.getByText("已接受", { exact: true })).toBeVisible();
    expect(calls).toHaveLength(2);
    await closeReview(page);
  }
  expect(await originalSnapshot(page)).toEqual(originals);
});

test("Diary source changes block stale acceptance while preserving rejection and exact source assembly", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const calls = await mockExtraction(context);
  await page.goto("/diary/new");
  await expect(page.getByRole("button", { name: "整理", exact: true })).toHaveCount(0);
  const title = "散步后的一页";
  const body = "今天阅读半小时。\n\n留下原始换行和 🙂 表情。";
  await page.getByRole("textbox", { name: "日记标题（可选）", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "日记正文", exact: true }).fill(body);
  await page.getByRole("button", { name: "保存日记", exact: true }).click();
  await expect(page).toHaveURL(/\/diary\/(?!new)[^/]+$/);
  const diaryUrl = page.url();
  const diaryBefore = (await readTable(page, "diaries"))[0];
  expect(calls).toHaveLength(0);
  const dialog = await openReview(page, page.getByRole("main"));
  expect(calls).toHaveLength(0);
  await dialog.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "阅读", exact: true })).toBeVisible();
  expect(calls[1].payload?.text).toBe(`${title}\n\n${body}`);
  expect(await readTable(page, "diaries")).toEqual([diaryBefore]);
  expect(await readTable(page, "lifeEvents")).toHaveLength(0);
  await dialog.getByRole("button", { name: "修正", exact: true }).click();
  await dialog.getByRole("textbox", { name: "修正名称", exact: true }).fill("阅读纸质书");

  const editor = await context.newPage();
  await editor.goto(diaryUrl);
  await editor.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(editor.getByRole("button", { name: "整理", exact: true })).toHaveCount(0);
  await editor.getByRole("textbox", { name: "日记正文", exact: true }).fill("后来核对过，今天没有阅读。这个版本由我亲自修改。");
  await editor.getByRole("button", { name: "保存日记", exact: true }).click();
  await expect(editor.getByRole("article")).toContainText("这个版本由我亲自修改。");
  await editor.close();
  await page.bringToFront();
  // The open correction must notice a changed source without trapping the draft.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialog.getByRole("button", { name: "保存修正", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "取消修正", exact: true })).toBeEnabled();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "取消修正", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "拒绝", exact: true })).toBeFocused();
  // Reopening also restores current validity from the shared local database.
  await closeReview(page);
  const staleDialog = await openReview(page, page.getByRole("main"));
  await expect(staleDialog.getByText(/原记录已变化/)).toBeVisible();
  const stale = staleDialog.getByRole("article", { name: "阅读", exact: true });
  await expect(stale.getByRole("button", { name: "接受", exact: true })).toBeDisabled();
  await expect(stale.getByRole("button", { name: "修正", exact: true })).toBeDisabled();
  await expect(stale.getByLabel("原文证据")).toHaveCount(0);
  await stale.getByRole("button", { name: "拒绝", exact: true }).click();
  await expect(stale.getByText("已拒绝", { exact: true })).toBeVisible();
  expect(await readTable(page, "lifeEvents")).toHaveLength(0);
  const diaryAfter = (await readTable(page, "diaries"))[0];
  expect(diaryAfter).toMatchObject({ id: diaryBefore.id, createdAt: diaryBefore.createdAt, title, body: "后来核对过，今天没有阅读。这个版本由我亲自修改。" });
  expect(calls).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("offline saving and reviewing stored proposals do not contact the AI service", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await mockExtraction(context);
  await page.goto("/");
  const original = "下午阅读半小时。";
  const article = await createMoment(page, original);
  const dialog = await openReview(page, article);
  await dialog.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "阅读", exact: true })).toBeVisible();
  await closeReview(page);
  const requestCount = calls.length;
  await context.setOffline(true);
  try {
    await createMoment(page, "断网时仍然可以写下新的原始片段。");
    const localReview = await openReview(page, article);
    await localReview.getByRole("article", { name: "阅读", exact: true }).getByRole("button", { name: "接受", exact: true }).click();
    await expect(localReview.getByText("已接受", { exact: true })).toBeVisible();
    expect(await readTable(page, "moments")).toHaveLength(2);
    expect(await readTable(page, "lifeEvents")).toHaveLength(1);
    expect(calls).toHaveLength(requestCount);
  } finally {
    await context.setOffline(false);
  }
});

test("failed explicit extraction retains the record and only a user retry creates pending proposals", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await mockExtraction(context, { failFirst: true });
  await page.goto("/");
  const article = await createMoment(page, "在公园跑步三十分钟。");
  const originals = await originalSnapshot(page);
  const dialog = await openReview(page, article);
  await dialog.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(await readTable(page, "lifeExtractionJobs")).toHaveLength(0);
  expect(await readTable(page, "lifeEventProposals")).toHaveLength(0);
  expect(await readTable(page, "lifeEvents")).toHaveLength(0);
  expect(await originalSnapshot(page)).toEqual(originals);
  expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
  await dialog.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "跑步", exact: true })).toBeVisible();
  expect(calls.filter(({ method }) => method === "POST")).toHaveLength(2);
  expect(await readTable(page, "lifeEventProposals")).toHaveLength(1);
  expect(await readTable(page, "lifeEvents")).toHaveLength(0);
  expect(await originalSnapshot(page)).toEqual(originals);
});

test("keyboard dismissal protects unsaved corrections and restores the trigger focus", async ({ page, context }) => {
  const calls = await mockExtraction(context);
  await page.goto("/");
  const article = await createMoment(page, "今天阅读半小时。");
  const trigger = article.getByRole("button", { name: "整理", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "整理记录", exact: true });
  await expect(dialog.getByRole("button", { name: "开始整理", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "开始整理", exact: true }).click();
  await dialog.getByRole("button", { name: "修正", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "修正名称", exact: true })).toBeFocused();
  await dialog.getByRole("textbox", { name: "修正名称", exact: true }).fill("阅读纸质书");
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "修正名称", exact: true })).toHaveValue("阅读纸质书");
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(calls).toHaveLength(2);
  expect(await readTable(page, "lifeEvents")).toHaveLength(0);
  expect((await readTable<LifeEventProposal>(page, "lifeEventProposals"))[0].status).toBe("pending");
});
