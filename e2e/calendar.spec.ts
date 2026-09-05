import { expect, test, type Page } from "@playwright/test";

interface RootSeed {
  id: string;
  text: string;
  createdAt: string;
}

function localTimestamp(year: number, month: number, day: number, hour: number): string {
  return new Date(year, month - 1, day, hour).toISOString();
}

function dateLabel(year: number, month: number, day: number, suffix = ""): string {
  return `${year} 年 ${month} 月 ${day} 日${suffix}`;
}

function recordedDateLabel(now: Date, day: number): string {
  return dateLabel(
    now.getFullYear(),
    now.getMonth() + 1,
    day,
    `${now.getDate() === day ? "，今天" : ""}，有记录`,
  );
}

async function seedRoots(
  page: Page,
  moments: RootSeed[],
  diaries: RootSeed[],
): Promise<void> {
  await page.goto("/");
  await expect(page.getByLabel("最近记录")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(async ({ moments: momentSeeds, diaries: diarySeeds }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("life");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["moments", "diaries"], "readwrite");
      const momentStore = transaction.objectStore("moments");
      const diaryStore = transaction.objectStore("diaries");
      for (const seed of momentSeeds) {
        momentStore.put({
          id: seed.id,
          originalText: seed.text,
          isFavorite: false,
          location: null,
          createdAt: seed.createdAt,
          updatedAt: seed.createdAt,
          deletedAt: null,
        });
      }
      for (const seed of diarySeeds) {
        diaryStore.put({
          id: seed.id,
          title: "",
          body: seed.text,
          isFavorite: false,
          location: null,
          createdAt: seed.createdAt,
          updatedAt: seed.createdAt,
          deletedAt: null,
        });
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { moments, diaries });
}

test.describe("Calendar real browser flow", () => {
  test("marks local dates containing Moment or Diary roots and restores after refresh", async ({ page }) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    await seedRoots(
      page,
      [{ id: "calendar-moment-status", text: "Status Moment", createdAt: localTimestamp(year, month, 2, 9) }],
      [{ id: "calendar-diary-status", text: "Status Diary", createdAt: localTimestamp(year, month, 4, 18) }],
    );

    await page.getByRole("button", { name: "生活脉络" }).click();
    await page.getByRole("link", { name: /日历/ }).click();
    await expect(page.getByRole("button", { name: recordedDateLabel(now, 2) }))
      .toHaveAttribute("data-has-records", "true");
    await expect(page.getByRole("button", { name: recordedDateLabel(now, 4) }))
      .toHaveAttribute("data-has-records", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: recordedDateLabel(now, 2) }))
      .toHaveAttribute("data-has-records", "true");
    await expect(page.getByRole("button", { name: recordedDateLabel(now, 4) }))
      .toHaveAttribute("data-has-records", "true");
  });

  test("filters one selected day between all, Moments, and Diaries", async ({ page }) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = 6;
    await seedRoots(
      page,
      [{ id: "calendar-filter-moment", text: "Filter Moment", createdAt: localTimestamp(year, month, day, 9) }],
      [{ id: "calendar-filter-diary", text: "Filter Diary", createdAt: localTimestamp(year, month, day, 10) }],
    );

    await page.goto("/calendar");
    await page.getByRole("button", { name: recordedDateLabel(now, day) }).click();
    const detail = page.getByRole("region", { name: `${dateLabel(year, month, day)}的记录` });
    await expect(detail.getByText("Filter Moment", { exact: true })).toBeVisible();
    await expect(detail.getByText("Filter Diary", { exact: true })).toBeVisible();

    await detail.getByRole("button", { name: "随笔" }).click();
    await expect(detail.getByText("Filter Moment", { exact: true })).toBeVisible();
    await expect(detail.getByText("Filter Diary", { exact: true })).toHaveCount(0);

    await detail.getByRole("button", { name: "日记" }).click();
    await expect(detail.getByText("Filter Moment", { exact: true })).toHaveCount(0);
    await expect(detail.getByText("Filter Diary", { exact: true })).toBeVisible();
  });

  test("restores selected historical content from IndexedDB after refresh", async ({ page }) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = 8;
    await seedRoots(
      page,
      [{ id: "calendar-persisted-moment", text: "Persisted Calendar Moment", createdAt: localTimestamp(year, month, day, 11) }],
      [],
    );

    await page.goto("/calendar");
    const date = page.getByRole("button", { name: recordedDateLabel(now, day) });
    await date.click();
    await expect(page.getByText("Persisted Calendar Moment", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: recordedDateLabel(now, day) }).click();
    await expect(page.getByText("Persisted Calendar Moment", { exact: true })).toBeVisible();
  });
});
