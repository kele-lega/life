import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDiary, updateDiaryContent } from "@/features/diary/repository/diary-repository";
import { createManualLifeEvent, createManualLifeEvents } from "@/features/life-event/repository/life-event-repository";
import { fingerprintLifeEventText } from "@/features/life-event/repository/source-fingerprint";
import { reviewLifeEventProposal } from "@/features/life-intelligence/application/review-proposal";
import { runLifeExtraction } from "@/features/life-intelligence/application/run-life-extraction";
import { FakeLifeEventExtractor } from "@/features/life-intelligence/extractor/fake-life-event-extractor";
import { lifeIntelligenceRepository } from "@/features/life-intelligence/repository/dexie-life-intelligence-repository";
import { createMoment } from "@/features/moment/repository/moment-repository";
import { db } from "@/lib/db/client";
import type { CreateManualLifeEventInput } from "@/features/life-event/model/types";
import {
  getLifeEventExploration,
  getLifeEventSummary,
  getLifeEventTimeSeries,
  LIFE_EVENT_CATEGORIES,
} from "./life-statistics-query";

const uuid = (value: number) => `10000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const event = (
  id: number,
  fields: Partial<CreateManualLifeEventInput> = {},
): CreateManualLifeEventInput => ({
  id: uuid(id),
  category: "learning",
  name: "阅读",
  occurredOn: "2026-09-03",
  timeZone: "Asia/Shanghai",
  timePrecision: "day",
  durationSeconds: null,
  ...fields,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("Life Statistics query", () => {
  it("includes accepted AI and corrected manual Events without exposing intelligence fields", async () => {
    const extractor = new FakeLifeEventExtractor();
    const acceptedBatch = await runLifeExtraction(lifeIntelligenceRepository, extractor, {
      input: { kind: "scratch" },
      text: "看书40分钟",
      context: { occurredOn: "2026-09-03", timeZone: "Asia/Shanghai" },
    });
    const accepted = acceptedBatch.proposals.find(({ candidate }) => candidate.name === "阅读")!;
    await reviewLifeEventProposal(lifeIntelligenceRepository, {
      action: "accept",
      proposalId: accepted.id,
      lifeEventId: uuid(90),
      reviewedAt: "2026-09-03T10:00:00.000Z",
    });

    const correctedBatch = await runLifeExtraction(lifeIntelligenceRepository, extractor, {
      input: { kind: "scratch" },
      text: "跑步半小时",
      context: { occurredOn: "2026-09-03", timeZone: "Asia/Shanghai" },
    });
    const corrected = correctedBatch.proposals.find(({ candidate }) => candidate.name === "跑步")!;
    await reviewLifeEventProposal(lifeIntelligenceRepository, {
      action: "correct",
      proposalId: corrected.id,
      lifeEventId: uuid(91),
      reviewedAt: "2026-09-03T11:00:00.000Z",
      correction: { ...corrected.candidate, name: "慢跑" },
    });

    const summary = await getLifeEventSummary({ startDate: "2026-09-03", endDate: "2026-09-04" });
    const exploration = await getLifeEventExploration({
      startDate: "2026-09-03",
      endDate: "2026-09-04",
      granularity: "day",
    });
    expect(summary).toMatchObject({ totalEvents: 2, totalDurationSeconds: 4_200 });
    expect(exploration.names.map(({ name }) => name)).toEqual(["阅读", "慢跑"]);
    expect(JSON.stringify({ summary, exploration })).not.toMatch(/origin|proposal|extractor|confidence/i);
  });

  it("excludes an accepted AI Event after its Diary source becomes stale", async () => {
    await createDiary({ id: "diary-ai-stale", body: "看书40分钟" });
    const batch = await runLifeExtraction(lifeIntelligenceRepository, new FakeLifeEventExtractor(), {
      input: {
        kind: "record",
        source: {
          type: "diary",
          id: "diary-ai-stale",
          contentFingerprint: await fingerprintLifeEventText(["", "看书40分钟"]),
        },
      },
      text: "看书40分钟",
      context: { occurredOn: "2026-09-03", timeZone: "Asia/Shanghai" },
    });
    const proposal = batch.proposals.find(({ candidate }) => candidate.name === "阅读")!;
    await reviewLifeEventProposal(lifeIntelligenceRepository, {
      action: "accept",
      proposalId: proposal.id,
      lifeEventId: uuid(92),
      reviewedAt: "2026-09-03T10:00:00.000Z",
    });
    await expect(getLifeEventSummary({ startDate: "2026-09-03", endDate: "2026-09-04" }))
      .resolves.toMatchObject({ totalEvents: 1 });

    await updateDiaryContent("diary-ai-stale", { body: "日记已经修改" });
    await expect(getLifeEventSummary({ startDate: "2026-09-03", endDate: "2026-09-04" }))
      .resolves.toMatchObject({ totalEvents: 0, totalDurationSeconds: 0 });
  });

  it("uses an inclusive/exclusive occurredOn range and stable four-category totals", async () => {
    await createManualLifeEvents([
      event(1, { occurredOn: "2026-09-01", category: "activity", durationSeconds: 60 }),
      event(2, { occurredOn: "2026-09-02", category: "learning", durationSeconds: null }),
      event(3, { occurredOn: "2026-09-02", category: "learning", durationSeconds: 120 }),
      event(4, { occurredOn: "2026-09-03", category: "place", durationSeconds: 999 }),
    ]);

    const summary = await getLifeEventSummary({ startDate: "2026-09-01", endDate: "2026-09-03" });

    expect(summary).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      totalEvents: 3,
      totalDurationSeconds: 180,
      categories: [
        { category: "activity", eventCount: 1, totalDurationSeconds: 60 },
        { category: "learning", eventCount: 2, totalDurationSeconds: 120 },
        { category: "creation", eventCount: 0, totalDurationSeconds: 0 },
        { category: "place", eventCount: 0, totalDurationSeconds: 0 },
      ],
    });
    expect(summary.categories.map(({ category }) => category)).toEqual(LIFE_EVENT_CATEGORIES);
  });

  it("includes standalone/current events but excludes stale, missing-source and event tombstones", async () => {
    await createMoment({ id: "moment-current", originalText: "原文" });
    await createDiary({ id: "diary-stale", body: "旧正文" });
    await createDiary({ id: "diary-missing", body: "将被移除" });
    const created = await createManualLifeEvents([
      event(1),
      event(2, { source: { type: "moment", id: "moment-current" }, category: "activity", durationSeconds: 10 }),
      event(3, { source: { type: "diary", id: "diary-stale" }, category: "creation", durationSeconds: 20 }),
      event(4, { source: { type: "diary", id: "diary-missing" }, category: "place", durationSeconds: 30 }),
      event(5, { category: "activity", durationSeconds: 40 }),
    ]);
    await updateDiaryContent("diary-stale", { body: "新正文" });
    await db.diaries.delete("diary-missing");
    await db.lifeEvents.update(created[4].id, {
      deletedAt: "2026-09-03T12:00:00.000Z",
      updatedAt: "2026-09-03T12:00:00.000Z",
    });

    const summary = await getLifeEventSummary({ startDate: "2026-09-03", endDate: "2026-09-04" });

    expect(summary.totalEvents).toBe(2);
    expect(summary.totalDurationSeconds).toBe(10);
    expect(summary.categories.find(({ category }) => category === "learning")?.eventCount).toBe(1);
    expect(summary.categories.find(({ category }) => category === "activity")?.eventCount).toBe(1);
    await expect(db.lifeEvents.get(created[2].id)).resolves.toEqual(created[2]);
  });

  it("returns sparse day buckets in ascending natural-date order", async () => {
    await createManualLifeEvents([
      event(1, { occurredOn: "2026-09-03", durationSeconds: 30 }),
      event(2, { occurredOn: "2026-09-01", durationSeconds: null }),
      event(3, { occurredOn: "2026-09-03", category: "place", durationSeconds: 0 }),
    ]);

    const series = await getLifeEventTimeSeries({
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      granularity: "day",
    });

    expect(series.points.map((point) => ({
      start: point.bucketStartDate,
      end: point.bucketEndDate,
      count: point.eventCount,
      duration: point.totalDurationSeconds,
    }))).toEqual([
      { start: "2026-09-01", end: "2026-09-02", count: 1, duration: 0 },
      { start: "2026-09-03", end: "2026-09-04", count: 2, duration: 30 },
    ]);
  });

  it("uses Monday-based week buckets across years and calendar-month buckets", async () => {
    await createManualLifeEvents([
      event(1, { occurredOn: "2025-12-31", durationSeconds: 10 }),
      event(2, { occurredOn: "2026-01-01", durationSeconds: 20 }),
      event(3, { occurredOn: "2026-01-05", durationSeconds: 30 }),
      event(4, { occurredOn: "2026-02-01", durationSeconds: 40 }),
    ]);

    const week = await getLifeEventTimeSeries({ startDate: "2025-12-30", endDate: "2026-02-02", granularity: "week" });
    expect(week.points.map((point) => [point.bucketStartDate, point.bucketEndDate, point.eventCount])).toEqual([
      ["2025-12-29", "2026-01-05", 2],
      ["2026-01-05", "2026-01-12", 1],
      ["2026-01-26", "2026-02-02", 1],
    ]);

    const month = await getLifeEventTimeSeries({ startDate: "2025-12-30", endDate: "2026-02-02", granularity: "month" });
    expect(month.points.map((point) => [point.bucketStartDate, point.bucketEndDate, point.totalDurationSeconds])).toEqual([
      ["2025-12-01", "2026-01-01", 10],
      ["2026-01-01", "2026-02-01", 50],
      ["2026-02-01", "2026-03-01", 40],
    ]);
  });

  it("attributes an interval wholly to occurredOn without inventing or splitting instants", async () => {
    await createManualLifeEvent(event(1, {
      occurredOn: "2026-09-03",
      timeZone: "Asia/Shanghai",
      timePrecision: "interval",
      startAt: "2026-09-03T15:30:00.000Z",
      endAt: "2026-09-03T17:30:00.000Z",
      durationSeconds: 7200,
    }));
    const series = await getLifeEventTimeSeries({ startDate: "2026-09-03", endDate: "2026-09-05", granularity: "day" });
    expect(series.points).toHaveLength(1);
    expect(series.points[0]).toMatchObject({ bucketStartDate: "2026-09-03", eventCount: 1, totalDurationSeconds: 7200 });
    const [stored] = await db.lifeEvents.toArray();
    expect(stored.startAt).toBe("2026-09-03T15:30:00.000Z");
    expect(stored.endAt).toBe("2026-09-03T17:30:00.000Z");
  });

  it("returns presentation-neutral name, source and bounded event drill-down", async () => {
    await createMoment({ id: "moment-map", originalText: "一次真实记录" });
    await createDiary({ id: "diary-map", body: "一篇真实日记" });
    await createManualLifeEvents([
      event(1, { occurredOn: "2026-09-01", category: "learning", name: "阅读", durationSeconds: 600 }),
      event(2, { occurredOn: "2026-09-02", category: "learning", name: "阅读", durationSeconds: null, source: { type: "moment", id: "moment-map" } }),
      event(3, { occurredOn: "2026-09-03", category: "creation", name: "摄影", durationSeconds: 1200, source: { type: "diary", id: "diary-map" } }),
    ]);

    const result = await getLifeEventExploration({
      startDate: "2026-09-01",
      endDate: "2026-09-04",
      granularity: "day",
      recentEventLimit: 2,
    });

    expect(result.summary.totalEvents).toBe(3);
    expect(result.timeSeries.points).toHaveLength(3);
    expect(result.names).toEqual([
      { category: "learning", name: "阅读", eventCount: 2, totalDurationSeconds: 600, firstOccurredOn: "2026-09-01", lastOccurredOn: "2026-09-02" },
      { category: "creation", name: "摄影", eventCount: 1, totalDurationSeconds: 1200, firstOccurredOn: "2026-09-03", lastOccurredOn: "2026-09-03" },
    ]);
    expect(result.sources).toEqual([
      { sourceKind: "independent", eventCount: 1, totalDurationSeconds: 600, firstOccurredOn: "2026-09-01", lastOccurredOn: "2026-09-01" },
      { sourceKind: "moment", eventCount: 1, totalDurationSeconds: 0, firstOccurredOn: "2026-09-02", lastOccurredOn: "2026-09-02" },
      { sourceKind: "diary", eventCount: 1, totalDurationSeconds: 1200, firstOccurredOn: "2026-09-03", lastOccurredOn: "2026-09-03" },
    ]);
    expect(result.recentEvents.map(({ name, source }) => ({ name, source }))).toEqual([
      { name: "摄影", source: { type: "diary", id: "diary-map" } },
      { name: "阅读", source: { type: "moment", id: "moment-map" } },
    ]);
    expect(result.hasMoreEvents).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/contentFingerprint|sourceStatus|coordinates|color|svg/i);
  });

  it("validates exploration limits before exposing an unbounded event projection", async () => {
    await expect(getLifeEventExploration({
      startDate: "2026-09-01",
      endDate: "2026-09-02",
      granularity: "month",
      recentEventLimit: 501,
    })).rejects.toThrow("1–500");
  });

  it.each([
    { startDate: "bad", endDate: "2026-09-04" },
    { startDate: "2026-09-04", endDate: "2026-09-04" },
    { startDate: "2026-09-05", endDate: "2026-09-04" },
  ])("rejects invalid ranges: %j", async (input) => {
    await expect(getLifeEventSummary(input)).rejects.toThrow();
  });

  it("rejects invalid time-series granularity", async () => {
    await expect(getLifeEventTimeSeries({
      startDate: "2026-09-01",
      endDate: "2026-09-02",
      granularity: "quarter" as "day",
    })).rejects.toThrow("粒度");
  });

  it("rejects aggregate duration overflow", async () => {
    await createManualLifeEvents([
      event(1, { durationSeconds: Number.MAX_SAFE_INTEGER }),
      event(2, { durationSeconds: 1 }),
    ]);
    await expect(getLifeEventSummary({ startDate: "2026-09-03", endDate: "2026-09-04" })).rejects.toThrow("安全整数");
  });
});
