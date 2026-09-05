import { expect, test } from "@playwright/test";

test("Life Intelligence lab persists review and materialized LifeEvent across refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab/life-extraction");

  await expect(page.getByLabel("实验数据说明")).toContainText("接受或修正后会创建真实 LifeEvent，并影响 Life Map");
  await page.getByRole("button", { name: "提取候选" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);

  const reading = page.getByRole("article", { name: "阅读" });
  await reading.getByRole("button", { name: "Accept" }).click();
  await expect(reading.getByText("已接受")).toBeVisible();
  await expect(reading.getByRole("region", { name: "最终 LifeEvent：阅读" })).toContainText("ai");

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(async () => (await indexedDB.databases()).some((database) => database.name === "life"))).toBe(true);
  expect(await page.evaluate(async () => {
    const request = indexedDB.open("life");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = [...database.objectStoreNames];
    database.close();
    return names;
  })).toEqual(expect.arrayContaining(["lifeExtractionJobs", "lifeEventProposals", "lifeEvents"]));

  await page.reload();
  await expect(page.getByRole("status")).toContainText("已恢复 3 个候选及其审核状态");
  await expect(page.getByRole("article")).toHaveCount(3);
  const restoredReading = page.getByRole("article", { name: "阅读" });
  await expect(restoredReading.getByText("已接受")).toBeVisible();
  await expect(restoredReading.getByRole("region", { name: "最终 LifeEvent：阅读" })).toContainText("ai");
});
