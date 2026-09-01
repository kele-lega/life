import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LifeDatabase, db } from "@/lib/db/client";

import { createAttachment, listMomentAttachments, softDeleteAttachment } from "./attachment-repository";

async function resetDatabase(): Promise<void> {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
}

beforeEach(resetDatabase);
afterEach(resetDatabase);

describe("Attachment repository", () => {
  it("creates, reads, and soft-deletes a Moment image attachment", async () => {
    const blob = new Blob(["image-bytes"], { type: "image/png" });
    const created = await createAttachment({
      id: "attachment-1",
      ownerId: "moment-1",
      blob,
      fileName: "photo.png",
      mimeType: "image/png",
    });

    const [stored] = await listMomentAttachments("moment-1");
    expect(stored).toMatchObject({
      id: "attachment-1",
      ownerType: "moment",
      ownerId: "moment-1",
      mimeType: "image/png",
      size: blob.size,
    });
    expect(stored.blob).toBeDefined();
    expect(stored.size).toBe(blob.size);
    expect(stored.mimeType).toBe("image/png");

    await softDeleteAttachment(created.id, "2026-09-01T12:00:00.000Z");
    await expect(listMomentAttachments("moment-1")).resolves.toEqual([]);
    await expect(listMomentAttachments("moment-1", { includeDeleted: true })).resolves.toHaveLength(1);
  });

  it("reads attachment metadata and binary content after the database is re-instantiated", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" });
    await createAttachment({
      id: "persistent-attachment",
      ownerId: "moment-1",
      blob,
      fileName: "persistent.webp",
      mimeType: "image/webp",
    });
    db.close();

    const reopened = new LifeDatabase();
    await reopened.open();
    const stored = await reopened.attachments.get("persistent-attachment");

    expect(stored).toMatchObject({
      ownerType: "moment",
      ownerId: "moment-1",
      fileName: "persistent.webp",
      mimeType: "image/webp",
      size: blob.size,
    });
    expect(stored?.blob).toBeDefined();
    reopened.close();
  });

  it.each(["text/plain", "application/pdf"])("rejects non-image MIME type %s", async (mimeType) => {
    await expect(
      createAttachment({
        ownerId: "moment-1",
        blob: new Blob(["not-image"], { type: mimeType }),
        fileName: "file.bin",
        mimeType,
      }),
    ).rejects.toThrow("must be an image");
  });
});
