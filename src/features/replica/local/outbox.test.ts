// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { createMoment, createMomentWithAttachments, restoreMoment, softDeleteMoment } from "@/features/moment/repository/moment-repository";
import { ensureReplicaBackfill, pendingReplicaCount, listDueReplicaMutations, markReplicaRetry, replicaAttachmentRecord } from "./outbox";
import { replicaWrites } from "./outbox";

async function reset() {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
}

beforeEach(reset);
afterEach(reset);

describe("Dexie v7 replica outbox", () => {
  it("opens sidecar stores without changing business table names", async () => {
    expect(db.verno).toBe(7);
    expect(db.tables.map((table) => table.name)).toEqual([
      "moments",
      "momentAppends",
      "attachments",
      "diaries",
      "lifeEvents",
      "lifeExtractionJobs",
      "lifeEventProposals",
      "replicaMutations",
      "replicaState",
      "replicaBlobs",
    ]);
  });

  it("commits business rows and outbox in one transaction", async () => {
    const moment = await createMoment({ id: "m1", originalText: "hello", createdAt: "2026-09-15T00:00:00.000Z" });
    expect(moment.originalText).toBe("hello");
    expect(await pendingReplicaCount(db)).toBe(1);
    const mutation = await db.replicaMutations.toCollection().first();
    expect(mutation?.payload.ops).toEqual([
      expect.objectContaining({ entity: "moment", id: "m1" }),
    ]);
    expect(mutation?.payload.ops[0]?.record).not.toHaveProperty("blob");
  });

  it("rolls back the moment if the outbox write throws", async () => {
    await expect(db.transaction("rw", replicaWrites(db, db.moments), async () => {
      await db.moments.add({
        id: "m2",
        originalText: "will rollback",
        isFavorite: false,
        location: null,
        createdAt: "2026-09-15T00:00:00.000Z",
        updatedAt: "2026-09-15T00:00:00.000Z",
        deletedAt: null,
      });
      throw new Error("synthetic outbox failure");
    })).rejects.toThrow("synthetic outbox failure");
    expect(await db.moments.count()).toBe(0);
    expect(await db.replicaMutations.count()).toBe(0);
  });

  it("stores attachment metadata and sha256 without cloning the Blob into outbox", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await createMomentWithAttachments({
      id: "m3",
      originalText: "with image",
      createdAt: "2026-09-15T00:00:00.000Z",
      attachments: [{ id: "img-1", blob: new Blob([bytes], { type: "image/png" }), fileName: "a.png", mimeType: "image/png" }],
    });
    const stored = await db.attachments.get("img-1");
    expect(stored?.size).toBe(bytes.byteLength);
    expect(stored?.blob).toBeDefined();
    expect((await db.replicaBlobs.get("img-1"))?.byteLength).toBe(bytes.byteLength);
    const mutation = (await db.replicaMutations.toArray())[0];
    const attachmentOp = mutation.payload.ops.find((op) => op.entity === "attachment");
    expect(attachmentOp?.record).toMatchObject({ id: "img-1", fileName: "a.png" });
    expect(attachmentOp?.record).not.toHaveProperty("blob");
    expect(typeof attachmentOp?.record.sha256).toBe("string");
    expect(await db.replicaBlobs.get("img-1")).toMatchObject({ attachmentId: "img-1", status: "pending" });
  });

  it("enqueues delete and restore as explicit after-images", async () => {
    await createMoment({ id: "m4", originalText: "keep", createdAt: "2026-09-15T00:00:00.000Z" });
    await softDeleteMoment("m4", "2026-09-15T01:00:00.000Z");
    expect((await db.moments.get("m4"))?.deletedAt).toBe("2026-09-15T01:00:00.000Z");
    await restoreMoment("m4");
    expect((await db.moments.get("m4"))?.deletedAt).toBeNull();
    const momentOps = (await db.replicaMutations.toArray()).flatMap((row) => row.payload.ops).filter((op) => op.entity === "moment");
    expect(momentOps).toHaveLength(3);
    expect(momentOps.map((op) => op.record.deletedAt)).toEqual(expect.arrayContaining([null, "2026-09-15T01:00:00.000Z"]));
    expect(momentOps.filter((op) => op.record.deletedAt === null)).toHaveLength(2);
    expect(momentOps.filter((op) => op.record.deletedAt === "2026-09-15T01:00:00.000Z")).toHaveLength(1);
  });

  it("allocates causal sequence transactionally even when timestamps tie and retries an ordered prefix", async () => {
    await createMoment({ id: "ordered", originalText: "keep" });
    await softDeleteMoment("ordered", "2026-09-15T01:00:00.000Z");
    await restoreMoment("ordered");
    const rows = await listDueReplicaMutations(db);
    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.payload.ops[0].record.deletedAt)).toEqual([null, "2026-09-15T01:00:00.000Z", null]);
    await markReplicaRetry(db, rows[0].mutationId, "network", 3600_000);
    expect(await listDueReplicaMutations(db)).toEqual([]);
    expect((await listDueReplicaMutations(db, undefined, true)).map((row) => row.sequence)).toEqual([1, 2, 3]);
    await db.close(); await db.open();
    expect((await db.replicaState.get("current"))?.nextSequence).toBe(4);
  });

  it("does not burn a sequence when its business transaction rolls back", async () => {
    await createMoment({ id: "first", originalText: "first" });
    await expect(db.transaction("rw", replicaWrites(db, db.moments), async () => {
      await createMoment({ id: "abort", originalText: "rollback" });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    await createMoment({ id: "next", originalText: "next" });
    expect((await listDueReplicaMutations(db)).map((row) => row.sequence)).toEqual([1, 2]);
  });

  it("preserves an explicitly empty Blob type independently of attachment mimeType", async () => {
    await createMomentWithAttachments({ id: "typed", originalText: "image", attachments: [{ id: "image", blob: new Blob([new Uint8Array([1])]), mimeType: "image/png", fileName: "image.png" }] });
    const attachment = (await db.attachments.get("image"))!;
    expect(await replicaAttachmentRecord(attachment, db)).toMatchObject({ blobType: "", mimeType: "image/png" });
  });

  it("backfills existing v7 rows without rewriting business records", async () => {
    await db.moments.add({
      id: "legacy",
      originalText: "old",
      isFavorite: false,
      location: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      deletedAt: "2026-09-02T00:00:00.000Z",
    });
    await ensureReplicaBackfill(db);
    expect((await db.moments.get("legacy"))?.originalText).toBe("old");
    expect((await db.moments.get("legacy"))?.deletedAt).toBe("2026-09-02T00:00:00.000Z");
    expect(await pendingReplicaCount(db)).toBe(1);
    await ensureReplicaBackfill(db);
    expect(await pendingReplicaCount(db)).toBe(1);
  });
});
