import { afterAll, describe, expect, it } from "vitest";

import type { LifeEvent, LifeEventCategory } from "@/features/life-event/model/types";
import { db } from "@/lib/db/client";
import { getLifeEventSummary, getLifeEventTimeSeries } from "./life-statistics-query";

const sizes = [1_000, 10_000, 50_000] as const;
const categories: LifeEventCategory[] = ["activity", "learning", "creation", "place"];
const rangeEnd = "2026-09-04";

function dateBeforeEnd(daysBefore: number): string {
  const date = new Date(`${rangeEnd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysBefore - 1);
  return date.toISOString().slice(0, 10);
}

function fixture(index: number): LifeEvent {
  const timestamp = "2026-09-03T00:00:00.000Z";
  return {
    id: `20000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    origin: "manual",
    source: null,
    category: categories[index % categories.length],
    name: `event-${index % 100}`,
    occurredOn: dateBeforeEnd(index % 1_825),
    timeZone: "UTC",
    timePrecision: "day",
    startAt: null,
    endAt: null,
    durationSeconds: index % 5 === 0 ? null : (index % 180 + 1) * 60,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

async function medianMilliseconds(operation: () => Promise<unknown>): Promise<number> {
  await operation();
  const samples: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const started = performance.now();
    await operation();
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  return Number(samples[1].toFixed(2));
}

afterAll(async () => {
  db.close();
  await db.delete();
});

describe("Life Statistics local query performance", () => {
  for (const size of sizes) {
    it(`${size.toLocaleString("en-US")} active LifeEvents`, async () => {
      await db.delete();
      await db.open();
      for (let offset = 0; offset < size; offset += 5_000) {
        await db.lifeEvents.bulkAdd(
          Array.from({ length: Math.min(5_000, size - offset) }, (_, index) => fixture(offset + index)),
        );
      }

      const timings = {
        recent30Days: await medianMilliseconds(() => getLifeEventSummary({ startDate: "2026-08-05", endDate: rangeEnd })),
        recentOneYear: await medianMilliseconds(() => getLifeEventSummary({ startDate: "2025-09-04", endDate: rangeEnd })),
        monthlyFiveYears: await medianMilliseconds(() => getLifeEventTimeSeries({ startDate: "2021-09-04", endDate: rangeEnd, granularity: "month" })),
        categoryFiveYears: await medianMilliseconds(() => getLifeEventSummary({ startDate: "2021-09-04", endDate: rangeEnd })),
      };
      const full = await getLifeEventSummary({ startDate: "2021-09-04", endDate: rangeEnd });
      expect(full.totalEvents).toBe(size);
      expect(full.categories.reduce((sum, category) => sum + category.eventCount, 0)).toBe(size);
      console.info(`[life-statistics] ${JSON.stringify({ size, unit: "ms median of 3 warm runs", timings })}`);
    });
  }
});
