import Dexie from "dexie";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, describe, expect, it } from "vitest";

import type { Attachment } from "@/features/attachment/model/types";
import type { LifeEvent } from "@/features/life-event/model/types";
import type { Moment } from "@/features/moment/model/types";

import { LifeDatabase, db } from "./client";

const schemas = {
  1: {},
  2: {
    moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
    momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
  },
  3: {
    moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
    momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
    attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt",
  },
  4: {
    moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
    momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
    attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt",
    diaries: "id, createdAt, updatedAt, deletedAt, isFavorite",
  },
  5: {
    moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
    momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
    attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt",
    diaries: "id, createdAt, updatedAt, deletedAt, isFavorite",
    lifeEvents: "id, [occurredOn+id], [source.type+source.id]",
  },
} as const;

const timestamp = "2026-09-01T10:00:00.000Z";
const lifecycle = { createdAt: timestamp, updatedAt: timestamp, deletedAt: null };

function lifeEvent(id: string, fields: Partial<LifeEvent> = {}): LifeEvent {
  return {
    ...lifecycle,
    id,
    origin: "manual",
    source: null,
    category: "learning",
    name: "阅读",
    occurredOn: "2026-09-01",
    timeZone: "Asia/Shanghai",
    timePrecision: "day",
    startAt: null,
    endAt: null,
    durationSeconds: 1_800,
    metadata: {},
    ...fields,
  };
}

afterEach(async () => {
  if (db.isOpen()) db.close();
  await db.delete();
});

describe("LifeDatabase", () => {
  it("opens with the Dexie v6 persistence schema", async () => {
    await db.open();

    expect(db.name).toBe("life");
    expect(db.verno).toBe(6);
    expect(db.tables.map((table) => table.name)).toEqual([
      "moments",
      "momentAppends",
      "attachments",
      "diaries",
      "lifeEvents",
      "lifeExtractionJobs",
      "lifeEventProposals",
    ]);
    expect(db.lifeEvents.schema.idxByName.extractionProposalId).toMatchObject({ unique: true });
    expect(db.lifeExtractionJobs.schema.idxByName.requestKey).toMatchObject({ unique: true });
    expect(db.lifeEventProposals.schema.idxByName["[jobId+candidateKey]"]).toMatchObject({
      unique: true,
      compound: true,
    });
  });

  it.each([1, 2, 3, 4] as const)("upgrades v%s directly to v6 without fabricating intelligence data", async (version) => {
    const databaseName = `life-v${version}-direct-v6-test`;
    const legacy = new Dexie(databaseName);
    legacy.version(version).stores(schemas[version]);
    const upgraded = new LifeDatabase(databaseName);
    try {
      await legacy.open();
      if (version >= 2) {
        await legacy.table("moments").add({
          ...lifecycle,
          id: "legacy-moment",
          originalText: "Created before Life Intelligence existed",
          location: null,
          isFavorite: false,
        });
        await legacy.table("momentAppends").add({
          ...lifecycle,
          id: "legacy-append",
          momentId: "legacy-moment",
          text: "原始追加",
        });
      }
      if (version >= 3) {
        const blob = new NodeBlob([new Uint8Array([1, 2, 3])], { type: "image/png" });
        await legacy.table("attachments").add({
          ...lifecycle,
          id: "legacy-image",
          ownerType: "moment",
          ownerId: "legacy-moment",
          kind: "image",
          blob,
          fileName: "原图.png",
          mimeType: blob.type,
          size: blob.size,
          width: null,
          height: null,
        });
      }
      if (version >= 4) {
        await legacy.table("diaries").add({
          ...lifecycle,
          id: "legacy-diary",
          title: "旧日记",
          body: "原始正文",
          location: null,
          isFavorite: false,
        });
      }
      legacy.close();

      await upgraded.open();
      expect(upgraded.verno).toBe(6);
      if (version >= 2) {
        await expect(upgraded.moments.get("legacy-moment")).resolves.toMatchObject({ originalText: "Created before Life Intelligence existed" });
        await expect(upgraded.momentAppends.get("legacy-append")).resolves.toMatchObject({ text: "原始追加" });
      }
      if (version >= 3) {
        const stored = (await upgraded.attachments.get("legacy-image")) as Attachment;
        expect(new Uint8Array(await stored.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
      }
      if (version >= 4) await expect(upgraded.diaries.get("legacy-diary")).resolves.toMatchObject({ body: "原始正文" });
      await expect(upgraded.lifeEvents.toArray()).resolves.toEqual([]);
      await expect(upgraded.lifeExtractionJobs.toArray()).resolves.toEqual([]);
      await expect(upgraded.lifeEventProposals.toArray()).resolves.toEqual([]);
    } finally {
      legacy.close();
      upgraded.close();
      await Dexie.delete(databaseName);
    }
  });

  it("upgrades v5 to v6 without changing originals, tombstones, indexes or Blob bytes", async () => {
    const name = "life-v5-intelligence-migration-test";
    const legacy = new Dexie(name);
    legacy.version(5).stores(schemas[5]);
    const upgraded = new LifeDatabase(name);
    try {
      await legacy.open();
      const moment: Moment = { ...lifecycle, id: "legacy-m", originalText: "  原文\n不改变  ", location: null, isFavorite: false };
      const append = { ...lifecycle, id: "legacy-a", momentId: moment.id, text: "补充", deletedAt: timestamp };
      const diary = { ...lifecycle, id: "legacy-d", title: "", body: "  日记\n原文", location: null, isFavorite: false };
      const bytes = new Uint8Array([0, 255, 137, 80, 78, 71]);
      const blob = new NodeBlob([bytes], { type: "image/png" });
      const attachment = { ...lifecycle, id: "legacy-image", ownerType: "moment", ownerId: moment.id, kind: "image", blob, fileName: "原图.png", mimeType: blob.type, size: blob.size, width: null, height: null };
      const event = lifeEvent("50000000-0000-4000-8000-000000000001", { deletedAt: timestamp });
      await legacy.table("moments").add(moment);
      await legacy.table("momentAppends").add(append);
      await legacy.table("diaries").add(diary);
      await legacy.table("attachments").add(attachment);
      await legacy.table("lifeEvents").add(event);
      const originalIndexes = legacy.tables
        .filter((table) => table.name !== "lifeEvents")
        .map((table) => [table.name, table.schema.indexes.map((index) => index.src)]);
      legacy.close();

      await upgraded.open();
      await expect(upgraded.moments.toArray()).resolves.toEqual([moment]);
      await expect(upgraded.momentAppends.toArray()).resolves.toEqual([append]);
      await expect(upgraded.diaries.toArray()).resolves.toEqual([diary]);
      const storedAttachment = (await upgraded.attachments.get(attachment.id)) as Attachment;
      expect(storedAttachment).toEqual({ ...attachment, blob: storedAttachment.blob });
      expect(new Uint8Array(await storedAttachment.blob.arrayBuffer())).toEqual(bytes);
      const storedEvent = await upgraded.lifeEvents.get(event.id);
      expect(storedEvent).toEqual(event);
      expect(Object.prototype.hasOwnProperty.call(storedEvent, "extractionProposalId")).toBe(false);
      expect(upgraded.tables
        .filter((table) => !["lifeEvents", "lifeExtractionJobs", "lifeEventProposals"].includes(table.name))
        .map((table) => [table.name, table.schema.indexes.map((index) => index.src)]))
        .toEqual(originalIndexes);
      await expect(upgraded.lifeExtractionJobs.toArray()).resolves.toEqual([]);
      await expect(upgraded.lifeEventProposals.toArray()).resolves.toEqual([]);
    } finally {
      legacy.close();
      upgraded.close();
      await Dexie.delete(name);
    }
  });

  it("keeps the proposal provenance index sparse and unique", async () => {
    await db.open();
    const directA = lifeEvent("60000000-0000-4000-8000-000000000001");
    const directB = lifeEvent("60000000-0000-4000-8000-000000000002");
    const proposalId = "60000000-0000-4000-8000-000000000003";
    const derived = lifeEvent("60000000-0000-4000-8000-000000000004", {
      origin: "ai",
      extractionProposalId: proposalId,
    });
    await db.lifeEvents.bulkAdd([directA, directB, derived]);

    expect(await db.lifeEvents.count()).toBe(3);
    await expect(db.lifeEvents.add(lifeEvent("60000000-0000-4000-8000-000000000005", {
      origin: "manual",
      extractionProposalId: proposalId,
    }))).rejects.toMatchObject({ name: "ConstraintError" });
    expect(await db.lifeEvents.count()).toBe(3);
  });
});
