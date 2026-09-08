import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Explicit opt-in only. Synthetic data in a disposable browser profile; never part of npm test.
if (process.env.LIFE_RUN_REAL_EXTRACTION !== "1") throw new Error("Set LIFE_RUN_REAL_EXTRACTION=1 to authorize synthetic live API calls.");
const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3180";
const output = path.resolve("design/phase15");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const report = { date: new Date().toISOString(), base, syntheticOnly: true, cases: [], attempts: [], checks: {} };
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce", hasTouch: true });
const page = await context.newPage();
const posts = [];
page.on("request", (request) => {
  if (request.url().endsWith("/api/life-extraction") && request.method() === "POST") posts.push(request.postDataJSON());
});
await page.addInitScript(() => { Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined }); sessionStorage.setItem("life-visualization-demo", "off"); });

async function table(name) {
  return page.evaluate(async (name) => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open("life"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await new Promise((resolve, reject) => { const query = database.transaction(name).objectStore(name).getAll(); query.onsuccess = () => resolve(query.result); query.onerror = () => reject(query.error); });
    } finally { database.close(); }
  }, name);
}
async function openDialog() {
  await page.getByRole("button", { name: "整理", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "整理记录" });
  await expect(dialog.getByRole("button", { name: "开始整理", exact: true })).toBeEnabled();
  return dialog;
}
async function extract(dialog) {
  const before = await Promise.all(["moments", "diaries", "lifeExtractionJobs", "lifeEventProposals", "lifeEvents"].map(table));
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    const response = page.waitForResponse((response) => response.url().endsWith("/api/life-extraction") && response.request().method() === "POST", { timeout: 45_000 });
    await dialog.getByRole("button", { name: "开始整理", exact: true }).click();
    const result = await response;
    report.attempts.push({ case: report.cases.length + 1, attempt, httpStatus: result.status(), elapsedMs: Date.now() - started });
    await expect(dialog.getByRole("button", { name: "开始整理", exact: true })).toBeEnabled();
    if (result.status() === 504 && attempt === 1) {
      await expect(dialog.getByRole("alert")).toContainText("整理超时");
      expect(await Promise.all(["moments", "diaries", "lifeExtractionJobs", "lifeEventProposals", "lifeEvents"].map(table))).toEqual(before);
      report.checks.timeoutPreservesOriginalsAndWritesNothing = true;
      // QA explicitly clicks Retry once; the product itself never retries automatically.
      continue;
    }
    expect(result.status()).toBe(200);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    return result.request().postDataJSON();
  }
  throw new Error("Synthetic extraction did not complete after one explicit QA retry.");
}
try {
  await page.goto(base);
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  const momentText = "今天跑步30分钟。";
  await page.getByRole("textbox", { name: "记录内容" }).fill(momentText);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "记录内容" })).toHaveCount(0);
  const originalMoment = await table("moments");
  expect(posts).toHaveLength(0);
  let dialog = await openDialog();
  expect(posts).toHaveLength(0);
  const momentRequest = await extract(dialog);
  expect(momentRequest.text).toBe(momentText);
  const momentProposals = await table("lifeEventProposals");
  expect(momentProposals).toHaveLength(1);
  expect(momentProposals[0].candidate).toMatchObject({ name: "跑步", category: "activity", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1800 });
  expect(await table("lifeEvents")).toHaveLength(0);
  await page.screenshot({ path: path.join(output, "moment-pending-1440-light.png") });
  await dialog.getByRole("button", { name: "接受", exact: true }).click();
  await expect(dialog.getByText("已接受", { exact: true })).toBeVisible();
  expect((await table("lifeEvents"))[0].origin).toBe("ai");
  expect(await table("moments")).toEqual(originalMoment);
  const afterMomentRequests = posts.length;
  await dialog.getByRole("button", { name: "关闭整理" }).click();
  await page.reload();
  dialog = await openDialog();
  await expect(dialog.getByText("已接受", { exact: true })).toBeVisible();
  expect(posts).toHaveLength(afterMomentRequests);
  await dialog.getByRole("button", { name: "关闭整理" }).click();
  report.cases.push({ source: "moment", result: "passed", review: "accepted", proposals: 1, originalPreserved: true, refreshRestoredWithoutAI: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(base + "/diary/new");
  const title = "合成测试日记"; const body = "今天阅读40分钟。";
  await page.getByRole("textbox", { name: "日记标题（可选）" }).fill(title);
  await page.getByRole("textbox", { name: "日记正文" }).fill(body);
  await page.getByRole("button", { name: "保存日记", exact: true }).click();
  await expect(page).toHaveURL(/\/diary\/(?!new)[^/]+$/);
  const originalDiary = await table("diaries");
  dialog = await openDialog();
  const diaryRequest = await extract(dialog);
  expect(diaryRequest.text).toBe(title + "\n\n" + body);
  await expect(dialog.getByRole("article", { name: "阅读", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, "diary-pending-390-dark.png") });
  await dialog.getByRole("button", { name: "修正", exact: true }).click();
  await dialog.getByRole("textbox", { name: "修正名称" }).fill("阅读纸质书");
  await dialog.getByRole("button", { name: "保存修正" }).click();
  await expect(dialog.getByText("已修正", { exact: true })).toBeVisible();
  expect((await table("lifeEvents")).find((event) => event.name === "阅读纸质书").origin).toBe("manual");
  expect(await table("diaries")).toEqual(originalDiary);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(output, "diary-corrected-390-dark.png") });
  await dialog.getByRole("button", { name: "关闭整理" }).click();
  report.cases.push({ source: "diary", result: "passed", review: "corrected", originalPreserved: true });

  await page.goto(base);
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容" }).fill("最近好像做了点什么，可能以后去个地方。感觉忙了很久。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "记录内容" })).toHaveCount(0);
  dialog = await openDialog();
  await extract(dialog);
  await expect(dialog.getByRole("article")).toHaveCount(0);
  expect(await table("lifeEvents")).toHaveLength(2);
  report.cases.push({ source: "ambiguous-synthetic-moment", result: "passed", proposals: 0, noInventedFacts: true });
  const jobs = await table("lifeExtractionJobs");
  expect(jobs.every((job) => job.extractor.model === "gpt-5.6-terra" && job.input.kind === "record" && !Object.hasOwn(job.input, "text"))).toBe(true);
  report.provider = jobs[0].extractor.provider;
  report.model = jobs[0].extractor.model;
  report.checks = { ...report.checks, realRequests: posts.length, privatePayloadKeysExcluded: posts.every((post) => Object.keys(post).sort().join(",") === "context,descriptor,text"), originalRecordsUnmodified: true, proposalsPersistedLocally: true };
  await dialog.getByRole("button", { name: "关闭整理" }).click();
  await page.goto(base + "/life");
  await expect(page.getByRole("button", { name: /跑步，1 次事件/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /阅读纸质书，1 次事件/ })).toBeVisible();
  await page.screenshot({ path: path.join(output, "reviewed-map-390-dark.png") });
  report.checks.finalEventsReachExistingMap = true;
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.failure = error instanceof Error ? error.message.slice(0, 1800) : "Unknown failure";
  await page.screenshot({ path: path.join(output, "live-check-failure.png") });
  process.exitCode = 1;
} finally {
  await context.close(); await browser.close();
  await writeFile(path.join(output, "live-validation.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
