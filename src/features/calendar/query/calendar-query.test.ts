import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDiary, updateDiaryContent } from "@/features/diary/repository/diary-repository";
import {
  createMoment,
  createMomentAppend,
  createMomentWithAttachments,
} from "@/features/moment/repository/moment-repository";
import { db } from "@/lib/db/client";

import { queryCalendarDay, queryCalendarMonth } from "./calendar-query";

function localTimestamp(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour).toISOString();
}

async function resetDatabase(): Promise<void> {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
}

beforeEach(resetDatabase);
afterEach(resetDatabase);

describe("Calendar query", () => {
  it("returns an empty month without querying days one by one", async () => {
    await expect(queryCalendarMonth(2026, 9)).resolves.toEqual({
      year: 2026,
      month: 9,
      recordedDateKeys: [],
    });
  });

  it("unions active Moment and Diary roots by local date", async () => {
    await createMoment({ id: "moment-one", originalText: "Moment", createdAt: localTimestamp(2026, 9, 1, 0) });
    await createDiary({ id: "diary-one", body: "Diary", createdAt: localTimestamp(2026, 9, 1, 20) });
    await createMoment({ id: "moment-end", originalText: "Month end", createdAt: localTimestamp(2026, 9, 30, 23) });
    const deletedMoment = await createMoment({ id: "moment-deleted", originalText: "Deleted", createdAt: localTimestamp(2026, 9, 4) });
    const deletedDiary = await createDiary({ id: "diary-deleted", body: "Deleted", createdAt: localTimestamp(2026, 9, 5) });
    await db.moments.put({ ...deletedMoment, deletedAt: localTimestamp(2026, 9, 6) });
    await db.diaries.put({ ...deletedDiary, deletedAt: localTimestamp(2026, 9, 6) });
    await createMomentAppend("moment-one", {
      id: "append-later",
      text: "Append on another day",
      createdAt: localTimestamp(2026, 9, 3),
    });

    const month = await queryCalendarMonth(2026, 9);

    expect(month.recordedDateKeys).toEqual(["2026-09-01", "2026-09-30"]);
    expect(month.recordedDateKeys).not.toContain("2026-09-03");
    expect(month.recordedDateKeys).not.toContain("2026-09-04");
    expect(month.recordedDateKeys).not.toContain("2026-09-05");
  });

  it("hydrates one local day in stable root order with Moment children", async () => {
    await createMomentWithAttachments({
      id: "moment-day",
      originalText: "Exact Moment text",
      createdAt: localTimestamp(2026, 9, 8, 9),
      location: { city: "上海", placeName: "静安寺", latitude: null, longitude: null },
      attachments: [{
        id: "image-day",
        blob: new Blob(["image"], { type: "image/png" }),
        fileName: "day.png",
        mimeType: "image/png",
      }],
    });
    await createMomentAppend("moment-day", {
      id: "append-day",
      text: "Nested Append",
      createdAt: localTimestamp(2026, 9, 9, 8),
    });
    await createDiary({
      id: "diary-day",
      body: "Untitled Diary",
      createdAt: localTimestamp(2026, 9, 8, 10),
    });

    const result = await queryCalendarDay("2026-09-08");

    expect(result.items.map((item) => `${item.type}:${item.id}`)).toEqual([
      "diary:diary-day",
      "moment:moment-day",
    ]);
    const moment = result.items.find((item) => item.type === "moment");
    expect(moment).toMatchObject({
      moment: { originalText: "Exact Moment text", location: { city: "上海", placeName: "静安寺" } },
      appends: [{ id: "append-day", text: "Nested Append" }],
      attachments: [{ id: "image-day", ownerId: "moment-day" }],
    });
  });

  it("keeps an edited Diary on its original createdAt date", async () => {
    await createDiary({
      id: "old-diary",
      body: "Original",
      createdAt: localTimestamp(2026, 8, 31, 20),
    });
    await updateDiaryContent("old-diary", { body: "Edited later" });

    await expect(queryCalendarDay("2026-08-31")).resolves.toMatchObject({
      items: [{ type: "diary", id: "old-diary", diary: { body: "Edited later" } }],
    });
    await expect(queryCalendarMonth(2026, 9)).resolves.toMatchObject({ recordedDateKeys: [] });
  });
});
