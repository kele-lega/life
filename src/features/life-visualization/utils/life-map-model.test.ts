import { describe, expect, it } from "vitest";
import type { LifeEventExploration } from "@/features/life-insights/model/types";
import { buildLifeMapConnections, buildLifeMapTopics, eventTopicKey, layoutLifeMapTopics } from "./life-map-model";

const exploration: LifeEventExploration = {
  startDate: "2026-08-01",
  endDate: "2026-09-04",
  summary: {
    startDate: "2026-08-01",
    endDate: "2026-09-04",
    totalEvents: 4,
    totalDurationSeconds: 5400,
    categories: [
      { category: "activity", eventCount: 1, totalDurationSeconds: 1800 },
      { category: "learning", eventCount: 2, totalDurationSeconds: 2400 },
      { category: "creation", eventCount: 0, totalDurationSeconds: 0 },
      { category: "place", eventCount: 1, totalDurationSeconds: 1200 },
    ],
  },
  timeSeries: { startDate: "2026-08-01", endDate: "2026-09-04", granularity: "day", points: [] },
  names: [
    { category: "learning", name: "阅读", eventCount: 2, totalDurationSeconds: 2400, firstOccurredOn: "2026-08-01", lastOccurredOn: "2026-09-02" },
    { category: "activity", name: "跑步", eventCount: 1, totalDurationSeconds: 1800, firstOccurredOn: "2026-09-01", lastOccurredOn: "2026-09-01" },
    { category: "place", name: "海边", eventCount: 1, totalDurationSeconds: 1200, firstOccurredOn: "2026-09-03", lastOccurredOn: "2026-09-03" },
  ],
  sources: [
    { sourceKind: "independent", eventCount: 2, totalDurationSeconds: 3000, firstOccurredOn: "2026-09-01", lastOccurredOn: "2026-09-03" },
    { sourceKind: "moment", eventCount: 2, totalDurationSeconds: 2400, firstOccurredOn: "2026-08-01", lastOccurredOn: "2026-09-02" },
  ],
  recentEvents: [
    { id: "4", category: "place", name: "海边", occurredOn: "2026-09-03", timeZone: "Asia/Shanghai", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1200, source: null },
    { id: "3", category: "learning", name: "阅读", occurredOn: "2026-09-02", timeZone: "Asia/Shanghai", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1200, source: { type: "moment", id: "m2" } },
    { id: "2", category: "activity", name: "跑步", occurredOn: "2026-09-01", timeZone: "Asia/Shanghai", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1800, source: null },
    { id: "1", category: "learning", name: "阅读", occurredOn: "2026-08-01", timeZone: "Asia/Shanghai", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1200, source: { type: "moment", id: "m1" } },
  ],
  recentEventLimit: 160,
  hasMoreEvents: false,
};

describe("Life Map presentation model", () => {
  it("uses exact event names for activities and only place names for the place lens", () => {
    expect(buildLifeMapTopics(exploration, "activities").map((topic) => topic.label)).toEqual(["阅读", "跑步"]);
    expect(buildLifeMapTopics(exploration, "places").map((topic) => topic.label)).toEqual(["海边"]);
  });

  it("keeps themes as a category-level real-data lens", () => {
    expect(buildLifeMapTopics(exploration, "themes").map((topic) => topic.label)).toEqual(["活动", "学习", "地点"]);
  });

  it("scales organic regions by count and connects nearby chronological topics", () => {
    const topics = buildLifeMapTopics(exploration, "activities");
    const regions = layoutLifeMapTopics(topics);
    expect(regions[0].radius).toBeGreaterThan(regions[1].radius);
    expect(buildLifeMapConnections(exploration.recentEvents, topics, "activities")).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: eventTopicKey(exploration.recentEvents[2], "activities"), to: eventTopicKey(exploration.recentEvents[1], "activities") }),
    ]));
  });
});
