import Dexie from "dexie";
import { describe, expect, it } from "vitest";

import type { LifeEvent, LifeEventCategory } from "@/features/life-event/model/types";

import { LifeDatabase } from "./client";

const categories: readonly LifeEventCategory[] = ["activity", "learning", "creation", "place"];
const timestamp = "2026-09-05T00:00:00.000Z";

function fixture(index: number): LifeEvent {
  return {
    id: `70000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    origin: "manual",
    source: null,
    category: categories[index % categories.length],
    name: `event-${index % 100}`,
    occurredOn: `2026-${String(index % 12 + 1).padStart(2, "0")}-${String(index % 28 + 1).padStart(2, "0")}`,
    timeZone: "UTC",
    timePrecision: "day",
    startAt: null,
    endAt: null,
    durationSeconds: index % 7 === 0 ? null : 1_800,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

describe("Dexie v5 to v6 migration performance", () => {
  it("opens and indexes 50,000 existing LifeEvents without a data transform", async () => {
    const databaseName = "life-v6-50000-migration-benchmark";
    const legacy = new Dexie(databaseName);
    legacy.version(5).stores({
      moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
      momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
      attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt",
      diaries: "id, createdAt, updatedAt, deletedAt, isFavorite",
      lifeEvents: "id, [occurredOn+id], [source.type+source.id]",
    });
    const upgraded = new LifeDatabase(databaseName);

    try {
      await Dexie.delete(databaseName);
      await legacy.open();
      for (let offset = 0; offset < 50_000; offset += 5_000) {
        await legacy.table<LifeEvent, string>("lifeEvents").bulkAdd(
          Array.from({ length: 5_000 }, (_, index) => fixture(offset + index)),
        );
      }
      legacy.close();

      const migrationStarted = performance.now();
      await upgraded.open();
      const migrationMilliseconds = Number((performance.now() - migrationStarted).toFixed(2));
      expect(upgraded.verno).toBe(6);
      await expect(upgraded.lifeEvents.count()).resolves.toBe(50_000);
      await expect(upgraded.lifeExtractionJobs.count()).resolves.toBe(0);
      await expect(upgraded.lifeEventProposals.count()).resolves.toBe(0);

      upgraded.close();
      const reopenStarted = performance.now();
      await upgraded.open();
      const reopenMilliseconds = Number((performance.now() - reopenStarted).toFixed(2));
      console.info(`[life-intelligence-migration] ${JSON.stringify({
        size: 50_000,
        environment: "vitest/fake-indexeddb",
        migrationMilliseconds,
        reopenMilliseconds,
      })}`);
    } finally {
      legacy.close();
      upgraded.close();
      await Dexie.delete(databaseName);
    }
  }, 120_000);
});
