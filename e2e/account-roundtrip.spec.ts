import { expect, test } from "@playwright/test";
import {
  ACCOUNT_IDS, AccountRoundtripCloud, ENTITY_TABLE, LOGIN_ERROR, activeDatabaseName,
  assertNoStoredPassword, claimAndUpload, createMoment, expectSynced, login, logout,
  readDatabase, readOriginals, reconnect, replicaSection,
} from "./account-roundtrip-helpers";

// Isolated context per case; route every API/object request after document reload.
// Traces are disabled because request/action recordings would retain login inputs.
test.use({ serviceWorkers: "block", trace: "off", actionTimeout: 15_000, navigationTimeout: 30_000 });

test.describe("Life Account + Cloud Data Roundtrip", () => {
  test.describe.configure({ mode: "default", timeout: 90_000 });
  let cloud: AccountRoundtripCloud;

  test.beforeEach(async ({ page, context, baseURL }) => {
    cloud = new AccountRoundtripCloud();
    await cloud.install(context, baseURL!);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
      sessionStorage.setItem("life-visualization-demo", "off");
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
  });
  test.afterEach(() => {
    expect(cloud.unexpectedRequests).toEqual([]);
    expect(cloud.aiRequests).toEqual([]);
  });

  test("generic login errors, empty credentials, and offline saves remain local until an explicit claim", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    cloud.online = false;
    await createMoment(page, "登录前离线写下的原文 👩🏽‍🚀\n第二行保持原样。", true);
    const beforeLogin = await readOriginals(page);
    await reconnect(page, context, cloud);
    await page.goto("/account");
    await expect(page.getByLabel("用户名", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "password");

    for (const username of ["kele", "unregistered-fixture-user"]) {
      await page.getByLabel("用户名", { exact: true }).fill(username);
      await page.getByLabel("密码", { exact: true }).fill("invalid-fixture-credential");
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(LOGIN_ERROR);
      await expect(page.getByRole("heading", { name: "我的账户", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "登录", exact: true })).toBeEnabled();
    }
    await page.reload();
    await login(page, cloud);
    expect(await readOriginals(page)).toEqual(beforeLogin);
    await assertNoStoredPassword(page, cloud);
    await page.reload();
    await expect(page.getByRole("heading", { name: "我的账户", exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(replicaSection(page).getByRole("status", { name: "同步状态" })).toHaveText("已保存本机");
    expect((await readDatabase(page)).replicaState[0].accountId).toBeNull();
    expect(cloud.calls.filter((call) => ["writers/register", "mutations", "attachments/uploads"].includes(call.path))).toEqual([]);

    await page.getByRole("button", { name: "立即上传", exact: true }).click();
    await expect(page.getByRole("heading", { name: "将这份生活库上传到 kele", exact: true })).toBeVisible();
    expect(cloud.users.kele.commitSeq).toBe(0);
    await page.getByRole("button", { name: "暂不上传", exact: true }).click();
    expect((await readDatabase(page)).replicaState[0].accountId).toBeNull();
    await claimAndUpload(page);
    await expectSynced(page);
    expect(cloud.rows("kele", "moment")[0].originalText).toBe(beforeLogin.moments[0].originalText);
    expect(cloud.users.kele.objects.size).toBe(1);
    expect(await readOriginals(page)).toEqual(beforeLogin);
    expect((await readDatabase(page)).replicaState[0].accountId).toBe(ACCOUNT_IDS.kele);
  });

  test("a lost cloud receipt keeps its mutation durable across reload and retry deduplicates the commit", async ({ page }) => {
    await page.goto("/");
    await createMoment(page, "回执丢失也只有一条记录", true);
    const originals = await readOriginals(page);
    await page.goto("/account");
    await login(page, cloud);
    cloud.dropNextMutationReply = true;
    await claimAndUpload(page);
    await expect(replicaSection(page).getByRole("status", { name: "同步状态" })).toHaveText("同步失败");
    await expect(page.getByRole("button", { name: "重试上传", exact: true })).toBeEnabled();
    expect(cloud.users.kele.mutations.size).toBe(1);
    const committedSeq = cloud.users.kele.commitSeq;
    const pending = (await readDatabase(page)).replicaMutations.filter((row) => row.status === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].lastError).not.toBeNull();

    // App assets remain reachable; cloud API is unavailable while the durable
    // pending mutation and original Blob are read back from a new document.
    cloud.online = false;
    await page.reload();
    await expect(page.getByRole("heading", { name: "我的账户", exact: true })).toBeVisible();
    expect(await readOriginals(page)).toEqual(originals);
    const reopened = (await readDatabase(page)).replicaMutations.filter((row) => row.status === "pending");
    expect(reopened.map((row) => [row.mutationId, row.payloadSha256, row.payload])).toEqual(pending.map((row) => [row.mutationId, row.payloadSha256, row.payload]));
    cloud.online = true;
    await page.getByRole("button", { name: "刷新云状态", exact: true }).click();
    await page.getByRole("button", { name: "重试上传", exact: true }).click();
    await expectSynced(page);
    expect(cloud.users.kele.commitSeq).toBe(committedSeq);
    expect(cloud.users.kele.mutations.size).toBe(1);
    expect(cloud.calls.filter((call) => call.path === "mutations" && call.mutationId === pending[0].mutationId).length).toBeGreaterThanOrEqual(2);
    expect(cloud.rows("kele", "moment")).toHaveLength(1);
    expect(cloud.rows("kele", "attachment")).toHaveLength(1);
    expect((await readDatabase(page)).replicaMutations.every((row) => row.status === "acked")).toBe(true);
    expect(await readOriginals(page)).toEqual(originals);
  });

  test("a claimed account stays logged in while offline and reconnect drains later saves without another claim", async ({ page, context }) => {
    await page.goto("/");
    await createMoment(page, "联网时先保存的一条");
    await page.goto("/account");
    await login(page, cloud);
    await claimAndUpload(page);
    await expectSynced(page);
    await page.getByRole("link", { name: "返回记录", exact: true }).click();
    await expect(page.getByRole("button", { name: "写点什么", exact: true })).toBeVisible();
    cloud.online = false;
    await context.setOffline(true);
    await createMoment(page, "已登录时断网也能保存", true);
    const offline = await readDatabase(page);
    expect(offline.replicaMutations.some((row) => row.status === "pending")).toBe(true);
    expect(cloud.rows("kele", "moment")).toHaveLength(1);
    const control = await readDatabase(page, "life-control");
    expect(control.settings[0].account).toMatchObject({ id: ACCOUNT_IDS.kele, username: "kele" });

    // A real online event drives the runtime; no wait for the 30-second timer.
    await reconnect(page, context, cloud);
    await expect.poll(() => cloud.rows("kele", "moment").length, { timeout: 15_000 }).toBe(2);
    await expect.poll(async () => (await readDatabase(page)).replicaMutations.filter((row) => row.status === "pending").length).toBe(0);
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "我的账户", exact: true })).toBeVisible();
    await expectSynced(page);
    await expect(page.getByRole("button", { name: "确认并上传", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "我的账户", exact: true })).toBeVisible();
    await assertNoStoredPassword(page, cloud);
    await page.getByRole("link", { name: "返回记录", exact: true }).click();
    const saved = page.getByRole("article").filter({ hasText: "已登录时断网也能保存" });
    await expect(saved).toBeVisible();
    await expect(saved.getByRole("img")).toHaveCount(1);
  });

  test("logout and B login cannot show or upload A's pending records; A login selects its bound library", async ({ page }) => {
    await page.goto("/");
    await createMoment(page, "kele 独有的原文和图片", true);
    await page.goto("/account");
    await login(page, cloud);
    await claimAndUpload(page);
    await expectSynced(page);
    const accountADatabase = await activeDatabaseName(page);
    cloud.rejectMutations = true;
    await page.getByRole("link", { name: "返回记录", exact: true }).click();
    await createMoment(page, "kele 尚未上传的本机记录");
    await page.goto("/account");
    const accountAOriginals = await readOriginals(page);
    expect((await readDatabase(page)).replicaMutations.some((row) => row.status === "pending")).toBe(true);
    await logout(page);
    const guestDatabase = await activeDatabaseName(page);
    expect(guestDatabase).not.toBe(accountADatabase);
    await login(page, cloud, "wzj");
    expect(await activeDatabaseName(page)).toBe(guestDatabase);
    await page.getByRole("link", { name: "返回记录", exact: true }).click();
    await expect(page.getByText("kele 独有的原文和图片", { exact: true })).toHaveCount(0);
    await expect(page.getByText("kele 尚未上传的本机记录", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("article")).toHaveCount(0);
    await createMoment(page, "wzj 自己的原文和图片", true);
    await page.goto("/account");
    cloud.rejectMutations = false;
    await claimAndUpload(page, "wzj");
    await expectSynced(page);
    expect(cloud.rows("wzj", "moment").map((row) => row.originalText)).toEqual(["wzj 自己的原文和图片"]);
    const accountAImageIds = new Set(accountAOriginals.attachments.map((row) => row.id));
    expect(cloud.rows("wzj", "attachment").some((row) => accountAImageIds.has(row.id))).toBe(false);
    expect([...cloud.users.wzj.objects.values()].every((object) => object.objectKey.includes(ACCOUNT_IDS.wzj))).toBe(true);
    expect(await readOriginals(page, accountADatabase)).toEqual(accountAOriginals);
    expect(cloud.rows("kele", "moment")).toHaveLength(1);

    await logout(page);
    await login(page, cloud, "kele");
    expect(await activeDatabaseName(page)).toBe(accountADatabase);
    await page.getByRole("link", { name: "返回记录", exact: true }).click();
    await expect(page.getByRole("article").filter({ hasText: "kele 独有的原文和图片" })).toBeVisible();
    await expect(page.getByRole("article").filter({ hasText: "kele 尚未上传的本机记录" })).toBeVisible();
    await expect(page.getByText("wzj 自己的原文和图片", { exact: true })).toHaveCount(0);
    expect(await readOriginals(page)).toEqual(accountAOriginals);
    await page.goto("/account");
    await page.getByRole("button", { name: /^(立即上传|重试上传)$/ }).click();
    await expectSynced(page);
    expect(cloud.rows("kele", "moment")).toHaveLength(2);
    expect(cloud.rows("wzj", "moment")).toHaveLength(1);
    await assertNoStoredPassword(page, cloud);
  });

  test("all seven entities and exact image bytes restore into an isolated library, then switch only on confirmation", async ({ page }) => {
    await page.goto("/");
    const momentText = "云端往返原文 👩🏽‍🚀 é\n第二行与尾部空格  ";
    const article = await createMoment(page, momentText, true);
    await article.getByRole("button", { name: "追加", exact: true }).click();
    await page.getByRole("textbox", { name: "追加文字", exact: true }).fill("追加保持原样\n也保留自己的时间。");
    await page.getByRole("button", { name: "保存追加", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "追加文字", exact: true })).toHaveCount(0);
    await page.goto("/diary/new");
    await page.getByRole("textbox", { name: "日记标题（可选）" }).fill("往返测试的独立日记");
    await page.getByRole("textbox", { name: "日记正文" }).fill("日记全文\n\n末尾保留两个空格  ");
    await page.getByRole("button", { name: "保存日记", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "日记正文" })).toHaveCount(0);
    // Existing local Fake Lab creates valid Job/Proposal/Event links with no AI request.
    await page.goto("/lab/life-extraction");
    await page.getByRole("button", { name: "提取候选", exact: true }).click();
    const reading = page.getByRole("article", { name: "阅读", exact: true });
    await reading.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(reading.getByText("已接受", { exact: true })).toBeVisible();
    const originalDatabase = await activeDatabaseName(page);
    const originals = await readOriginals(page);
    for (const table of Object.values(ENTITY_TABLE)) expect(originals[table].length, table).toBeGreaterThan(0);
    await page.goto("/account");
    await login(page, cloud);
    await claimAndUpload(page);
    await expectSynced(page);
    for (const [entity, table] of Object.entries(ENTITY_TABLE)) {
      expect(cloud.rows("kele", entity as keyof typeof ENTITY_TABLE).length, table).toBe(originals[table].length);
    }
    const snapshotCommit = cloud.users.kele.commitSeq;
    const originalWriter = cloud.users.kele.writerId;
    await page.getByRole("button", { name: "从云端恢复/同步", exact: true }).click();
    await expect(page.getByRole("button", { name: "确认切换到恢复的生活库", exact: true })).toBeEnabled();
    expect(await activeDatabaseName(page)).toBe(originalDatabase);
    expect(await readOriginals(page, originalDatabase)).toEqual(originals);
    expect(cloud.promotions).toEqual([]);
    const previewLibraries = (await readDatabase(page, "life-control")).libraries.filter((row) => row.restoredFrom === `replica:${snapshotCommit}`);
    expect(previewLibraries).toHaveLength(1);
    expect(await readOriginals(page, String(previewLibraries[0].databaseName))).toEqual(originals);
    await page.getByRole("button", { name: "保留当前生活库", exact: true }).click();
    await expect(page.getByRole("button", { name: "确认切换到恢复的生活库", exact: true })).toHaveCount(0);
    expect(await activeDatabaseName(page)).toBe(originalDatabase);
    expect(cloud.promotions).toEqual([]);

    await page.getByRole("button", { name: "从云端恢复/同步", exact: true }).click();
    await expect(page.getByRole("button", { name: "确认切换到恢复的生活库", exact: true })).toBeEnabled();
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "确认切换到恢复的生活库", exact: true }).click(),
    ]);
    await expect(page.getByRole("heading", { name: "我的账户", exact: true })).toBeVisible();
    const restoredDatabase = await activeDatabaseName(page);
    expect(restoredDatabase).toMatch(/^life-restore-/);
    expect(restoredDatabase).not.toBe(originalDatabase);
    expect(await readOriginals(page, restoredDatabase)).toEqual(originals);
    expect(await readOriginals(page, originalDatabase)).toEqual(originals);
    expect(cloud.promotions).toEqual([{ username: "kele", expectedCommitSeq: snapshotCommit }]);
    expect(cloud.users.kele.writerId).not.toBe(originalWriter);
    expect(cloud.users.kele.epoch).toBe(2);
    const restoredState = await readDatabase(page);
    expect(restoredState.replicaMutations).toEqual([]);
    expect(restoredState.replicaBlobs.every((row) => row.status === "verified")).toBe(true);
    await page.getByRole("link", { name: "返回记录", exact: true }).click();
    const restoredMoment = page.getByRole("article").filter({ hasText: "云端往返原文" });
    await expect(restoredMoment).toContainText("追加保持原样");
    const image = restoredMoment.getByRole("img", { name: "test-image.svg", exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await page.goto("/diary");
    await expect(page.getByRole("heading", { name: "往返测试的独立日记", exact: true })).toBeVisible();
  });

  for (const fault of ["corrupt", "missing"] as const) {
    test(`${fault} cloud image aborts restore without a switch action or any original-library change`, async ({ page }) => {
      await page.goto("/");
      await createMoment(page, "图片校验失败时原库保持完整", true);
      const originals = await readOriginals(page);
      const originalDatabase = await activeDatabaseName(page);
      await page.goto("/account");
      await login(page, cloud);
      await claimAndUpload(page);
      await expectSynced(page);
      const librariesBefore = (await readDatabase(page, "life-control")).libraries;
      const databasesBefore = await page.evaluate(async () => (await indexedDB.databases()).map((entry) => entry.name).sort());
      cloud.downloadFault = fault;
      await page.getByRole("button", { name: "从云端恢复/同步", exact: true }).click();
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      await expect(page.getByRole("button", { name: "从云端恢复/同步", exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: "确认切换到恢复的生活库", exact: true })).toHaveCount(0);
      expect(await activeDatabaseName(page)).toBe(originalDatabase);
      expect(await readOriginals(page)).toEqual(originals);
      expect((await readDatabase(page, "life-control")).libraries).toEqual(librariesBefore);
      expect(await page.evaluate(async () => (await indexedDB.databases()).map((entry) => entry.name).sort())).toEqual(databasesBefore);
      expect(cloud.promotions).toEqual([]);
    });
  }

  test("390px dark account login, claim and synced state fit the viewport", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");
    await createMoment(page, "手机深色模式里的生活片段", true);
    await page.goto("/account");
    await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await login(page, cloud);
    await page.getByRole("button", { name: "立即上传", exact: true }).click();
    await expect(page.getByRole("heading", { name: "将这份生活库上传到 kele", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("account-390-dark-claim.png"), fullPage: true });
    await page.getByRole("button", { name: "确认并上传", exact: true }).click();
    await expectSynced(page);
    await expect(replicaSection(page)).toContainText("1 条随笔 · 0 条追加 · 0 篇日记 · 1 张图片");
    await expect(replicaSection(page)).toContainText("2 条数据 · 1 张原图");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("account-390-dark-synced.png"), fullPage: true });
  });
});
