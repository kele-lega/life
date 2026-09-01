import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import type { Moment } from "@/features/moment/model/types";

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
    ]);
    expect(db.verno).toBe(4);
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

    expect(upgraded.verno).toBe(4);
    await expect(upgraded.moments.get("legacy-moment")).resolves.toEqual(legacyMoment);
    expect(upgraded.tables.map((table) => table.name)).toContain("diaries");
    await expect(upgraded.diaries.toArray()).resolves.toEqual([]);

    upgraded.close();
    await Dexie.delete(databaseName);
  });
});
