import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { createHash } from "node:crypto";
import { encodeJson, type BackupManifest } from "../src/features/cloud-backup/shared/format";

async function createMoment(page: Page, text: string, image = false) {
  await page.goto("/");
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容", exact: true }).fill(text);
  if (image) await page.getByLabel("选择图片", { exact: true }).setInputFiles("e2e/fixtures/test-image.svg");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "记录内容", exact: true })).toHaveCount(0);
  await expect(page.getByRole("article").filter({ hasText: text })).toBeVisible();
}

async function readLibrary(page: Page, name = "life") {
  return page.evaluate(async (databaseName) => {
    const request = indexedDB.open(databaseName);
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const result: Record<string, unknown[]> = {};
    for (const name of Array.from(database.objectStoreNames)) {
      if (["replicaMutations", "replicaState", "replicaBlobs"].includes(name)) continue;
      const get = database.transaction(name).objectStore(name).getAll();
      const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => { get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
      result[name] = await Promise.all(rows.map(async (row) => row.blob instanceof Blob ? { ...row, blob: { type: row.blob.type, bytes: Array.from(new Uint8Array(await row.blob.arrayBuffer())) } } : row));
    }
    database.close(); return result;
  }, name);
}

async function mockAccounts(context: BrowserContext) {
  let account: { id: string; email: string } | null = null;
  await context.route("**/api/cloud/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/account")) return route.fulfill({ json: { configured: true, account } });
    if (path.endsWith("/backups")) return route.fulfill({ json: { backups: [] } });
    if (path.endsWith("/verify")) {
      const email = route.request().postDataJSON().email;
      account = { id: email.startsWith("a") ? "00000000-0000-4000-8000-00000000000a" : "00000000-0000-4000-8000-00000000000b", email };
      return route.fulfill({ json: { account } });
    }
    if (path.endsWith("/logout")) account = null;
    return route.fulfill({ json: { ok: true } });
  });
}
async function login(page: Page, email: string) {
  await page.getByLabel("邮箱地址").fill(email);
  await page.getByRole("button", { name: "发送验证码", exact: true }).click();
  await page.getByLabel("邮件验证码").fill("123456");
  await page.getByRole("button", { name: "验证并登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的账户", exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined }); sessionStorage.setItem("life-visualization-demo", "off"); });
});

test("library bootstrap reports a busy tab instead of hanging on the loading state", async ({ page, context }) => {
  const holder = await context.newPage();
  // Keep the holder on the same origin without mounting LibraryBoundary, so
  // the exclusive lock is acquired before the page under test boots.
  await holder.goto("/icon.svg");
  await holder.evaluate(() => {
    const state = window as typeof window & { releaseLifeLock?: () => void };
    void navigator.locks.request("life-library-context", { mode: "exclusive" }, async () => {
      await new Promise<void>((resolve) => { state.releaseLifeLock = resolve; });
    });
  });
  await holder.waitForTimeout(100);

  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新打开", exact: true })).toBeVisible();

  await holder.evaluate(() => (window as typeof window & { releaseLifeLock?: () => void }).releaseLifeLock?.());
  await holder.close();
});

test("exports original text/images, restores to an isolated library, and keeps the original", async ({ page }, info) => {
  const aiCalls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/life-extraction")) aiCalls.push(request.url()); });
  await createMoment(page, "完整导出 👩🏽‍🚀\n保留原始内容", true);
  const before = await readLibrary(page);
  await page.getByRole("link", { name: "账户与备份", exact: true }).click();
  await page.getByRole("button", { name: "导出 .life.zip", exact: true }).click();
  const link = page.getByRole("link", { name: /^下载 Life-/ });
  await expect(link).toBeVisible();
  const downloaded = page.waitForEvent("download"); await link.click();
  const file = info.outputPath("roundtrip.life.zip"); await (await downloaded).saveAs(file);
  await page.getByLabel("选择 Life 备份文件").setInputFiles(file);
  await expect(page.getByRole("heading", { name: "恢复预览" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("account-restore-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "恢复到独立生活库", exact: true }).click();
  await expect(page.getByRole("button", { name: "打开恢复后的生活库" })).toBeVisible();
  expect(await readLibrary(page)).toEqual(before);
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "打开恢复后的生活库" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "本机保留的生活库" })).toBeVisible();
  const name = await page.evaluate(() => localStorage.getItem("life-library-bootstrap-v1"));
  expect(name).toMatch(/^life-restore-/);
  expect(await readLibrary(page, name!)).toEqual(before);
  await page.getByRole("link", { name: "返回记录", exact: true }).click();
  await expect(page.getByRole("article").filter({ hasText: "完整导出" })).toBeVisible();
  expect(aiCalls).toEqual([]);
});

test("corrupt archive never changes the current library", async ({ page }) => {
  await createMoment(page, "原库必须保留"); const before = await readLibrary(page);
  await page.goto("/account");
  await page.getByLabel("选择 Life 备份文件").setInputFiles({ name: "broken.life.zip", mimeType: "application/zip", buffer: Buffer.from("not a valid archive") });
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  expect(await readLibrary(page)).toEqual(before);
  await expect(page.getByRole("button", { name: "恢复到独立生活库", exact: true })).toHaveCount(0);
});

test("account switching preserves the first account library and isolates new anonymous data", async ({ page, context }) => {
  await mockAccounts(context);
  await createMoment(page, "属于账户 A 的记录");
  await page.goto("/account"); await login(page, "a@example.test");
  await page.getByRole("button", { name: "将本机生活库绑定到此账户" }).click();
  await expect(page.getByRole("button", { name: "备份现在", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "退出登录并保留本机库" }).click();
  await expect(page.getByRole("heading", { name: "邮箱登录", exact: true })).toBeVisible();
  await login(page, "b@example.test");
  await page.getByRole("link", { name: "返回记录", exact: true }).click();
  await expect(page.getByText("属于账户 A 的记录", { exact: true })).toHaveCount(0);
  await expect(page.getByText("还没有留下片段。", { exact: true })).toBeVisible();
  expect((await readLibrary(page)).moments).toHaveLength(1);
  await page.goto("/account"); await page.getByRole("button", { name: "退出登录并保留本机库" }).click();
  await expect(page.getByRole("heading", { name: "邮箱登录", exact: true })).toBeVisible();
  await login(page, "a@example.test");
  await page.getByRole("button", { name: "打开此库", exact: true }).first().click();
  await page.getByRole("link", { name: "返回记录", exact: true }).click();
  await expect(page.getByRole("article").filter({ hasText: "属于账户 A 的记录" })).toBeVisible();
});

test("another tab prevents account switching rather than discarding an open draft", async ({ page, context }) => {
  await mockAccounts(context);
  await page.goto("/account");
  const second = await context.newPage(); await second.goto("/");
  await second.getByRole("button", { name: "写点什么", exact: true }).click();
  await second.getByRole("textbox", { name: "记录内容", exact: true }).fill("另一标签页尚未保存");
  await page.getByLabel("邮箱地址").fill("a@example.test");
  await page.getByRole("button", { name: "发送验证码", exact: true }).click();
  await page.getByLabel("邮件验证码").fill("123456");
  await page.getByRole("button", { name: "验证并登录", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("关闭其他 Life 标签页");
  await expect(second.getByRole("textbox", { name: "记录内容", exact: true })).toHaveValue("另一标签页尚未保存");
  await second.close();
});

test("cloud retry uses the original frozen snapshot and reports a verified completion", async ({ page, context }, info) => {
  let account: { id: string; email: string } | null = null;
  let saved: { id: string; manifest: BackupManifest; status: string } | null = null;
  let failUpload = true;
  const createdIds = new Set<string>();
  const parts = new Map<string, Buffer>();
  const acknowledged = new Set<string>();
  const ai: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/life-extraction")) ai.push(request.url()); });
  await context.route("https://objects.invalid/**", async (route) => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "PUT, GET", "access-control-allow-headers": "content-type" } });
    if (failUpload) { failUpload = false; return route.abort("failed"); }
    parts.set(key, route.request().postDataBuffer()!);
    return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" } });
  });
  await context.route("**/api/cloud/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/cloud/", "");
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    if (path === "account") return route.fulfill({ json: { configured: true, account } });
    if (path === "auth/email/start" || path === "libraries/bind") return route.fulfill({ json: { ok: true } });
    if (path === "auth/email/verify") { account = { id: "00000000-0000-4000-8000-00000000000a", email: body.email }; return route.fulfill({ json: { account } }); }
    if (path === "backups" && route.request().method() === "POST") {
      createdIds.add(body.id); saved ??= { id: body.id, manifest: body.manifest, status: "uploading" };
      return route.fulfill({ json: { id: saved.id, manifestSha256: createHash("sha256").update(encodeJson(saved.manifest)).digest("hex") } });
    }
    if (path === "backups") return route.fulfill({ json: { backups: saved ? [{ id: saved.id, libraryId: saved.manifest.libraryId, capturedAt: saved.manifest.capturedAt, completedAt: saved.status === "complete" ? new Date().toISOString() : null, status: saved.status, totalBytes: 1024 }] : [], nextCursor: null, latestForLibrary: saved?.status === "complete" ? saved.manifest.capturedAt : null } });
    if (path.endsWith("/uploads")) {
      const key = JSON.stringify([body.path, body.index]);
      return route.fulfill({ json: acknowledged.has(key) ? { verified: true } : { verified: false, url: `https://objects.invalid/${encodeURIComponent(key)}`, headers: {} } });
    }
    if (path.endsWith("/ack")) { acknowledged.add(JSON.stringify([body.path, body.index])); return route.fulfill({ json: { ok: true } }); }
    if (path.endsWith("/finalize")) { saved!.status = "verifying"; return route.fulfill({ json: { status: "verifying" } }); }
    if (path.endsWith("/verify")) { saved!.status = "complete"; return route.fulfill({ json: { status: "complete" } }); }
    return route.fulfill({ json: { status: saved!.status, completedAt: saved!.status === "complete" ? new Date().toISOString() : null } });
  });
  await createMoment(page, "备份捕获时的原文", true);
  await page.goto("/account"); await login(page, "a@example.test");
  await page.getByRole("button", { name: "将本机生活库绑定到此账户" }).click();
  await page.getByRole("button", { name: "备份现在", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("中断");
  await createMoment(page, "备份之后的新记录");
  await page.goto("/account");
  await page.getByRole("button", { name: "重试备份", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("已完成备份");
  expect(createdIds.size).toBe(1);
  const momentBytes = [...parts.entries()].find(([key]) => key.includes("records/moments/"))![1];
  expect(momentBytes.toString()).toContain("备份捕获时的原文");
  expect(momentBytes.toString()).not.toContain("备份之后的新记录");
  expect((await readLibrary(page)).moments).toHaveLength(2);
  expect((await readLibrary(page, "life-control")).files).toHaveLength(0);
  expect(ai).toEqual([]);
  await expect(page.getByRole("button", { name: "重试备份", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("account-backup-complete-mocked.png"), fullPage: true });
});

for (const width of [390, 430, 1440]) for (const colorScheme of ["light", "dark"] as const) {
  test(`account surface ${width}px ${colorScheme} remains readable and usable offline`, async ({ page, context }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/account"); await expect(page.getByRole("heading", { name: "账户与备份" })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: "导出 .life.zip", exact: true }).click();
    await expect(page.getByRole("link", { name: /^下载 Life-/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`account-${width}-${colorScheme}.png`), fullPage: true });
    await context.setOffline(false);
  });
}
