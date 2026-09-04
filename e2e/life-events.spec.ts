import { expect, test } from "@playwright/test";

test("manual lab events persist across refresh, allow same names and remain isolated", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab/life-events");
  await expect(page.getByText("还没有事件。", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("日期", { exact: true }).fill("2026-09-03");
  await page.getByLabel("名称", { exact: true }).fill("  阅读  ");
  await page.getByLabel("持续时间（分钟，可选）").fill("30");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已从本地读取");
  await page.getByLabel("名称", { exact: true }).fill("  阅读  ");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("1800 秒", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("life"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const tx = database.transaction(["lifeEvents", "moments", "momentAppends", "diaries"]);
      const all = (store: string) => new Promise<unknown[]>((resolve) => { const request = tx.objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); });
      return await Promise.all([all("lifeEvents"), all("moments"), all("momentAppends"), all("diaries")]);
    } finally { database.close(); }
  });
  expect(stored[0]).toHaveLength(2);
  expect(stored[0][0]).toMatchObject({ name: "  阅读  ", occurredOn: "2026-09-03", timePrecision: "day", startAt: null, endAt: null, origin: "manual", source: null });
  expect(stored.slice(1)).toEqual([[], [], []]);
});

test("real Chromium upgrades v4 originals and image Blob when opening the lab", async ({ page }) => {
  // Seed only this test context's origin before loading application code.
  await page.route("**/lab/life-events", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>Migration fixture</body></html>" }));
  await page.goto("/lab/life-events");
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("life", 40); // Dexie v4 maps to native IDB version 40.
      request.onupgradeneeded = () => {
        for (const name of ["moments", "momentAppends", "diaries", "attachments"]) {
          const store = request.result.createObjectStore(name, { keyPath: "id" });
          for (const key of ["createdAt", "updatedAt", "deletedAt"]) store.createIndex(key, key);
          if (name === "moments" || name === "diaries") store.createIndex("isFavorite", "isFavorite");
          if (name === "momentAppends") store.createIndex("momentId", "momentId");
          if (name === "attachments") { store.createIndex("ownerId", "ownerId"); store.createIndex("[ownerType+ownerId]", ["ownerType", "ownerId"]); }
        }
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const time = "2026-09-01T10:00:00.000Z";
    const common = { createdAt: time, updatedAt: time, deletedAt: null };
    const tx = database.transaction(["moments", "momentAppends", "diaries", "attachments"], "readwrite");
    tx.objectStore("moments").add({ ...common, id: "m", originalText: "  原文\n不变  ", location: null, isFavorite: false });
    tx.objectStore("momentAppends").add({ ...common, id: "a", momentId: "m", text: "补充" });
    tx.objectStore("diaries").add({ ...common, id: "d", title: "", body: "日记原文", location: null, isFavorite: false });
    tx.objectStore("attachments").add({ ...common, id: "image", ownerType: "moment", ownerId: "m", kind: "image", blob: new Blob([new Uint8Array([0, 255, 1, 128])], { type: "image/png" }), fileName: "original.png", mimeType: "image/png", size: 4, width: null, height: null });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    database.close();
  });
  await page.unroute("**/lab/life-events");
  await page.reload();
  await expect(page.getByText("还没有事件。", { exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open("life"); request.onsuccess = () => resolve(request.result); });
    const tx = database.transaction(["moments", "momentAppends", "diaries", "attachments", "lifeEvents"]);
    const get = (store: string, id: string) => new Promise<Record<string, unknown>>((resolve) => { const request = tx.objectStore(store).get(id); request.onsuccess = () => resolve(request.result); });
    const [moment, append, diary, image] = await Promise.all([get("moments", "m"), get("momentAppends", "a"), get("diaries", "d"), get("attachments", "image")]);
    const bytes = [...new Uint8Array(await (image.blob as Blob).arrayBuffer())];
    const version = database.version;
    database.close();
    return { moment, append, diary, bytes, version };
  });
  expect(result.version).toBe(50);
  expect(result.moment).toMatchObject({ originalText: "  原文\n不变  ", updatedAt: "2026-09-01T10:00:00.000Z" });
  expect(result.append).toMatchObject({ momentId: "m", text: "补充" });
  expect(result.diary).toMatchObject({ title: "", body: "日记原文" });
  expect(result.bytes).toEqual([0, 255, 1, 128]);
});
