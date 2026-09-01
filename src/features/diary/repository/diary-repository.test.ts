import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LifeDatabase, db } from "@/lib/db/client";

import { createDiary, getDiary, listDiaries } from "./diary-repository";

const firstTime = "2026-08-31T10:00:00.000Z";
const secondTime = "2026-08-31T11:00:00.000Z";

async function resetDatabase(): Promise<void> {
  if (db.isOpen()) {
    db.close();
  }
  await db.delete();
  await db.open();
}

beforeEach(resetDatabase);
afterEach(resetDatabase);

describe("Diary repository", () => {
  it("creates and reads a Diary with exact title and body", async () => {
    const created = await createDiary({
      id: "diary-1",
      title: "A day in review",
      body: "  The first line.\nThe second line.  ",
      createdAt: firstTime,
    });

    expect(created).toMatchObject({
      id: "diary-1",
      title: "A day in review",
      body: "  The first line.\nThe second line.  ",
      isFavorite: false,
      location: null,
      deletedAt: null,
    });
    await expect(getDiary(created.id)).resolves.toEqual(created);
  });

  it("allows zero, one, or many Diaries on the same day", async () => {
    await expect(listDiaries()).resolves.toEqual([]);
    await createDiary({ id: "diary-1", title: "One", body: "First", createdAt: firstTime });
    await createDiary({ id: "diary-2", title: "Two", body: "Second", createdAt: secondTime });

    await expect(listDiaries()).resolves.toHaveLength(2);
  });

  it("sorts by creation time descending with an ID tie-breaker", async () => {
    await createDiary({ id: "diary-a", title: "Earlier", body: "A", createdAt: firstTime });
    await createDiary({ id: "diary-c", title: "Later", body: "C", createdAt: secondTime });
    await createDiary({ id: "diary-b", title: "Same time", body: "B", createdAt: secondTime });

    await expect(listDiaries()).resolves.toEqual([
      expect.objectContaining({ id: "diary-c" }),
      expect.objectContaining({ id: "diary-b" }),
      expect.objectContaining({ id: "diary-a" }),
    ]);
  });

  it("preserves Diaries across a database re-instantiation", async () => {
    await createDiary({ id: "diary-1", title: "Persistent", body: "Still here" });
    db.close();

    const reopened = new LifeDatabase();
    await reopened.open();
    await expect(reopened.table("diaries").get("diary-1")).resolves.toMatchObject({
      title: "Persistent",
      body: "Still here",
    });
    reopened.close();
  });

  it("hides soft-deleted Diaries only when the default query is used", async () => {
    const diary = await createDiary({ id: "diary-1", title: "Deleted", body: "Recoverable" });
    const deletedAt = "2026-08-31T12:00:00.000Z";
    await db.diaries.put({ ...diary, deletedAt, updatedAt: deletedAt });

    await expect(listDiaries()).resolves.toEqual([]);
    await expect(listDiaries({ includeDeleted: true })).resolves.toEqual([
      expect.objectContaining({ id: diary.id, deletedAt }),
    ]);
  });

  it.each([
    ["title", "   ", "Body"],
    ["body", "Title", "  "],
  ])("rejects an empty Diary %s", async (_field, title, body) => {
    await expect(createDiary({ title, body })).rejects.toThrow(_field);
  });

  it("does not depend on Moments", async () => {
    await createDiary({ id: "diary-1", title: "Independent", body: "No Moment needed" });

    await expect(db.moments.toArray()).resolves.toEqual([]);
    await expect(getDiary("diary-1")).resolves.toMatchObject({ title: "Independent" });
  });
});
