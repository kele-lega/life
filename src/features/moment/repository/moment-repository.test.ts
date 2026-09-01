import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LifeDatabase, db } from "@/lib/db/client";

import * as repository from "./moment-repository";

import {
  createMoment,
  createMomentAppend,
  createMomentWithAttachments,
  getMoment,
  listMomentAppends,
  listMoments,
  listRecentMoments,
  restoreMoment,
  softDeleteMoment,
  softDeleteMomentAppend,
  updateMomentMetadata,
} from "./moment-repository";

const firstTime = "2026-08-31T10:00:00.000Z";
const secondTime = "2026-08-31T11:00:00.000Z";

async function resetDatabase(): Promise<void> {
  if (db.isOpen()) {
    db.close();
  }
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(async () => {
  await resetDatabase();
});

describe("Moment repository", () => {
  it("creates and reads a Moment", async () => {
    const created = await createMoment({
      id: "moment-1",
      originalText: "A first thought",
      createdAt: firstTime,
    });

    await expect(getMoment(created.id)).resolves.toEqual(created);
  });

  it("reads records after the database is re-instantiated", async () => {
    await createMoment({ id: "moment-1", originalText: "Persistent", createdAt: firstTime });
    db.close();

    const reopened = new LifeDatabase();
    await reopened.open();
    await expect(reopened.moments.get("moment-1")).resolves.toMatchObject({
      originalText: "Persistent",
    });
    reopened.close();
  });

  it("sorts Moments by createdAt descending with a stable ID tie-breaker", async () => {
    await createMoment({ id: "moment-a", originalText: "Earlier", createdAt: firstTime });
    await createMoment({ id: "moment-c", originalText: "Later", createdAt: secondTime });
    await createMoment({ id: "moment-b", originalText: "Same time", createdAt: secondTime });

    await expect(listMoments()).resolves.toEqual([
      expect.objectContaining({ id: "moment-c" }),
      expect.objectContaining({ id: "moment-b" }),
      expect.objectContaining({ id: "moment-a" }),
    ]);
  });

  it("lists only the requested number of newest active Moments", async () => {
    await createMoment({ id: "moment-a", originalText: "Earlier", createdAt: firstTime });
    await createMoment({ id: "moment-b", originalText: "Middle", createdAt: secondTime });
    await createMoment({
      id: "moment-c",
      originalText: "Latest",
      createdAt: "2026-08-31T12:00:00.000Z",
    });
    await softDeleteMoment("moment-b", "2026-08-31T13:00:00.000Z");

    await expect(listRecentMoments(2)).resolves.toEqual([
      expect.objectContaining({ id: "moment-c" }),
      expect.objectContaining({ id: "moment-a" }),
    ]);
  });

  it.each([0, -1, 1.5])("rejects invalid recent Moment limit %s", async (limit) => {
    await expect(listRecentMoments(limit)).rejects.toThrow("positive integer");
  });

  it("does not expose an originalText update API", () => {
    expect(Object.keys(repository)).not.toContain("updateMoment");
    expect(Object.keys(repository)).not.toContain("updateMomentOriginalText");
  });

  it("updates restricted metadata without changing originalText", async () => {
    await createMoment({ id: "moment-1", originalText: "Immutable", createdAt: firstTime });

    await updateMomentMetadata("moment-1", { isFavorite: true });

    await expect(getMoment("moment-1")).resolves.toMatchObject({
      originalText: "Immutable",
      isFavorite: true,
    });
  });

  it("hides soft-deleted Moments by default and lists them in the recycle bin query", async () => {
    await createMoment({ id: "moment-1", originalText: "Deleted", createdAt: firstTime });
    await softDeleteMoment("moment-1", secondTime);

    await expect(listMoments()).resolves.toEqual([]);
    await expect(listMoments({ includeDeleted: true })).resolves.toEqual([
      expect.objectContaining({ id: "moment-1", deletedAt: secondTime }),
    ]);
  });

  it("restores a deleted Moment", async () => {
    await createMoment({ id: "moment-1", originalText: "Restorable", createdAt: firstTime });
    await softDeleteMoment("moment-1", secondTime);

    const restored = await restoreMoment("moment-1");

    expect(restored.deletedAt).toBeNull();
    await expect(listMoments()).resolves.toHaveLength(1);
  });

  it("saves a Moment and all image attachments in one transaction", async () => {
    const firstBlob = new Blob(["one"], { type: "image/jpeg" });
    const secondBlob = new Blob(["two"], { type: "image/webp" });

    const moment = await createMomentWithAttachments({
      id: "moment-with-images",
      originalText: "Text with images",
      createdAt: firstTime,
      attachments: [
        { id: "attachment-1", blob: firstBlob, fileName: "one.jpg", mimeType: "image/jpeg" },
        { id: "attachment-2", blob: secondBlob, fileName: "two.webp", mimeType: "image/webp" },
      ],
    });

    expect(moment.originalText).toBe("Text with images");
    const attachments = await db.attachments.where("ownerId").equals(moment.id).toArray();
    expect(attachments).toHaveLength(2);
    expect(new Set(attachments.map((attachment) => attachment.id))).toEqual(
      new Set(["attachment-1", "attachment-2"]),
    );
    expect(attachments[0].blob).toBeDefined();
    expect(attachments[1].blob).toBeDefined();
    expect(attachments[0].size).toBe(firstBlob.size);
    expect(attachments[1].size).toBe(secondBlob.size);
  });

  it("rolls back the Moment when an attachment write fails", async () => {
    vi.spyOn(db.attachments, "bulkAdd").mockRejectedValueOnce(new Error("quota"));

    await expect(
      createMomentWithAttachments({
        id: "failed-moment",
        originalText: "Must roll back",
        attachments: [{ id: "failed-attachment", blob: new Blob(["x"], { type: "image/png" }), fileName: "x.png", mimeType: "image/png" }],
      }),
    ).rejects.toThrow("quota");
    expect(await getMoment("failed-moment")).toBeUndefined();
    expect(await db.attachments.get("failed-attachment")).toBeUndefined();
  });

  it("rejects empty text and missing Moment operations", async () => {
    await expect(createMoment({ originalText: "   " })).rejects.toThrow("originalText");
    await expect(updateMomentMetadata("missing", { isFavorite: true })).rejects.toThrow(
      "Moment not found",
    );
    await expect(softDeleteMoment("missing")).rejects.toThrow("Moment not found");
  });

  it("soft-deletes attachments when their Moment is soft-deleted", async () => {
    const moment = await createMomentWithAttachments({
      id: "deletable-moment",
      originalText: "Delete with attachment",
      attachments: [
        {
          id: "deletable-attachment",
          blob: new Blob(["x"], { type: "image/png" }),
          fileName: "x.png",
          mimeType: "image/png",
        },
      ],
    });
    await softDeleteMoment(moment.id, secondTime);

    expect(await db.attachments.get("deletable-attachment")).toMatchObject({ deletedAt: secondTime });
    await restoreMoment(moment.id);
    expect(await db.attachments.get("deletable-attachment")).toMatchObject({ deletedAt: null });
  });
});

describe("MomentAppend repository", () => {
  it("creates multiple independently identified Appends in createdAt order", async () => {
    await createMoment({ id: "moment-1", originalText: "Original", createdAt: firstTime });

    const later = await createMomentAppend("moment-1", {
      id: "append-2",
      text: "Second addition",
      createdAt: secondTime,
    });
    const earlier = await createMomentAppend("moment-1", {
      id: "append-1",
      text: "First addition",
      createdAt: firstTime,
    });

    expect(later.id).not.toBe(earlier.id);
    await expect(listMomentAppends("moment-1")).resolves.toEqual([earlier, later]);
    await expect(getMoment("moment-1")).resolves.toMatchObject({ originalText: "Original" });
  });

  it("preserves exact Append text and orders equal timestamps by ID", async () => {
    await createMoment({ id: "moment-1", originalText: "Original stays exact", createdAt: firstTime });
    const exactText = "  第一行\n第二行  ";
    await createMomentAppend("moment-1", {
      id: "append-z",
      text: exactText,
      createdAt: secondTime,
    });
    await createMomentAppend("moment-1", {
      id: "append-a",
      text: "Same time, earlier ID",
      createdAt: secondTime,
    });

    const appends = await listMomentAppends("moment-1");

    expect(appends.map((append) => append.id)).toEqual(["append-a", "append-z"]);
    expect(appends[1].text).toBe(exactText);
    await expect(getMoment("moment-1")).resolves.toMatchObject({
      originalText: "Original stays exact",
    });
  });

  it("keeps Appends isolated by Moment", async () => {
    await createMoment({ id: "moment-1", originalText: "First", createdAt: firstTime });
    await createMoment({ id: "moment-2", originalText: "Second", createdAt: firstTime });
    await createMomentAppend("moment-1", { id: "append-1", text: "For first" });
    await createMomentAppend("moment-2", { id: "append-2", text: "For second" });

    await expect(listMomentAppends("moment-1")).resolves.toEqual([
      expect.objectContaining({ id: "append-1", momentId: "moment-1" }),
    ]);
  });

  it("soft-deletes an Append without deleting its Moment", async () => {
    await createMoment({ id: "moment-1", originalText: "Original", createdAt: firstTime });
    await createMomentAppend("moment-1", {
      id: "append-1",
      text: "Addition",
      createdAt: secondTime,
    });

    await softDeleteMomentAppend("append-1", "2026-08-31T12:00:00.000Z");

    await expect(listMomentAppends("moment-1")).resolves.toEqual([]);
    await expect(listMomentAppends("moment-1", { includeDeleted: true })).resolves.toHaveLength(1);
    await expect(getMoment("moment-1")).resolves.toMatchObject({ originalText: "Original" });
  });

  it("rejects Appends for a missing or deleted Moment", async () => {
    await expect(
      createMomentAppend("missing", { text: "Cannot attach", createdAt: firstTime }),
    ).rejects.toThrow("missing or deleted Moment");

    await createMoment({ id: "moment-1", originalText: "Original", createdAt: firstTime });
    await softDeleteMoment("moment-1", secondTime);
    await expect(
      createMomentAppend("moment-1", { text: "Cannot attach", createdAt: secondTime }),
    ).rejects.toThrow("missing or deleted Moment");
  });
});
