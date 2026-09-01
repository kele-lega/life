import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LifeDatabase, db } from "@/lib/db/client";

import { createDiary, getDiary, listDiaries, updateDiaryContent } from "./diary-repository";

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

  it("allows a Diary without a title and preserves exact body input", async () => {
    const created = await createDiary({ id: "untitled", body: "  Body only\n  " });

    expect(created.title).toBe("");
    expect(created.body).toBe("  Body only\n  ");
  });

  it("rejects only blank body content", async () => {
    await expect(createDiary({ title: "Optional", body: "   " })).rejects.toThrow("body");
  });

  it("updates only content while preserving identity and creation metadata", async () => {
    const created = await createDiary({
      id: "diary-edit",
      title: "Original title",
      body: "Original body",
      createdAt: firstTime,
    });
    const updated = await updateDiaryContent("diary-edit", {
      title: "  New title  ",
      body: "  New body\n  ",
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: "  New title  ",
      body: "  New body\n  ",
      createdAt: firstTime,
      deletedAt: null,
      location: null,
    });
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it("allows clearing an existing title without changing the body rule", async () => {
    await createDiary({ id: "diary-title", title: "Title", body: "Body" });

    const updated = await updateDiaryContent("diary-title", { body: "Body remains" });

    expect(updated.title).toBe("");
  });

  it("does not update missing or deleted Diaries", async () => {
    await expect(updateDiaryContent("missing", { body: "Body" })).rejects.toThrow("missing or deleted");
    const diary = await createDiary({ id: "deleted", body: "Body" });
    const deletedAt = "2026-08-31T12:00:00.000Z";
    await db.diaries.put({ ...diary, deletedAt, updatedAt: deletedAt });
    await expect(updateDiaryContent("deleted", { body: "New body" })).rejects.toThrow("missing or deleted");
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

  it("rejects blank Diary body", async () => {
    await expect(createDiary({ body: "   " })).rejects.toThrow("body");
  });

  it("does not depend on Moments", async () => {
    await createDiary({ id: "diary-1", title: "Independent", body: "No Moment needed" });

    await expect(db.moments.toArray()).resolves.toEqual([]);
    await expect(getDiary("diary-1")).resolves.toMatchObject({ title: "Independent" });
  });
});
