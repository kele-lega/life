import Dexie from "dexie";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, describe, expect, it } from "vitest";

import type { Moment } from "@/features/moment/model/types";
import type { Attachment } from "@/features/attachment/model/types";

import { LifeDatabase, db } from "./client";

afterEach(async () => {
  if (db.isOpen()) {
    db.close();
  }
  await db.delete();
});

describe("LifeDatabase", () => {
  it("opens with the current Moment schema", async () => {
    await db.open();

    expect(db.name).toBe("life");
    expect(db.tables.map((table) => table.name)).toEqual([
      "moments",
      "momentAppends",
      "attachments",
      "diaries",
      "lifeEvents",
    ]);
    expect(db.verno).toBe(5);
  });

  it("upgrades a v3 database without losing existing Moments", async () => {
    const databaseName = "life-v3-migration-test";
    const legacy = new Dexie(databaseName);
    legacy.version(1).stores({});
    legacy.version(2).stores({
      moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
      momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
    });
    legacy.version(3).stores({
      moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
      momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
      attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt",
    });
    await legacy.open();

    const createdAt = "2026-09-01T10:00:00.000Z";
    const legacyMoment: Moment = {
      id: "legacy-moment",
      originalText: "Created before Diaries existed",
      isFavorite: false,
      location: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };
    await legacy.table<Moment, string>("moments").add(legacyMoment);
    legacy.close();

    const upgraded = new LifeDatabase(databaseName);
    await upgraded.open();

    expect(upgraded.verno).toBe(5);
    await expect(upgraded.moments.get("legacy-moment")).resolves.toEqual(legacyMoment);
    expect(upgraded.tables.map((table) => table.name)).toContain("diaries");
    await expect(upgraded.diaries.toArray()).resolves.toEqual([]);

    upgraded.close();
    await Dexie.delete(databaseName);
  });

  it("upgrades v4 to v5 without changing originals, tombstones, indexes or Blob bytes", async () => {
    const name = "life-v4-event-migration-test";
    const legacy = new Dexie(name);
    legacy.version(4).stores({
      moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
      momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
      attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt",
      diaries: "id, createdAt, updatedAt, deletedAt, isFavorite",
    });
    const upgraded = new LifeDatabase(name);
    try {
      await legacy.open();
      const time = "2026-09-01T10:00:00.000Z";
      const lifecycle = { createdAt: time, updatedAt: time, deletedAt: null };
      const moment = { ...lifecycle, id: "legacy-m", originalText: "  原文\n不改变  ", location: null, isFavorite: false };
      const append = { ...lifecycle, id: "legacy-a", momentId: moment.id, text: "补充", deletedAt: time };
      const diary = { ...lifecycle, id: "legacy-d", title: "", body: "  日记\n原文", location: null, isFavorite: false };
      // jsdom Blob is not structured-cloneable; Node's real Blob is, just like Chromium's.
      const bytes = new Uint8Array([0, 255, 137, 80, 78, 71]);
      const blob = new NodeBlob([bytes], { type: "image/png" });
      const attachment = { ...lifecycle, id: "legacy-image", ownerType: "moment", ownerId: moment.id, kind: "image", blob, fileName: "原图.png", mimeType: blob.type, size: blob.size, width: null, height: null };
      await legacy.table("moments").add(moment);
      await legacy.table("momentAppends").add(append);
      await legacy.table("diaries").add(diary);
      await legacy.table("attachments").add(attachment);
      const indexes = legacy.tables.map((table) => [table.name, table.schema.indexes.map((index) => index.src)]);
      legacy.close();
      await upgraded.open();
      expect(upgraded.verno).toBe(5);
      await expect(upgraded.moments.toArray()).resolves.toEqual([moment]);
      await expect(upgraded.momentAppends.toArray()).resolves.toEqual([append]);
      await expect(upgraded.diaries.toArray()).resolves.toEqual([diary]);
      const stored = (await upgraded.attachments.get(attachment.id)) as Attachment;
      expect(stored).toEqual({ ...attachment, blob: stored.blob });
      expect(stored.blob.size).toBe(bytes.length);
      expect(stored.blob.type).toBe("image/png");
      expect(new Uint8Array(await stored.blob.arrayBuffer())).toEqual(bytes);
      expect(upgraded.tables.filter((table) => table.name !== "lifeEvents").map((table) => [table.name, table.schema.indexes.map((index) => index.src)])).toEqual(indexes);
      await expect(upgraded.lifeEvents.toArray()).resolves.toEqual([]);
    } finally {
      legacy.close();
      upgraded.close();
      await Dexie.delete(name);
    }
  });
});
