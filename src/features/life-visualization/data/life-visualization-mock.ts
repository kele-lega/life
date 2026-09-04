import type { LifeEventCategory } from "@/features/life-event/model/types";
import type {
  LifeEventCategoryAggregate,
  LifeEventExploration,
  LifeEventNameAggregate,
  LifeEventOccurrence,
  LifeEventTimeSeriesGranularity,
} from "@/features/life-insights/model/types";

const CATEGORIES: readonly LifeEventCategory[] = ["activity", "learning", "creation", "place"];
const DEMO_EVENT_LIMIT = 160;

type DemoGroup = "work" | "learning" | "fitness" | "creation" | "travel" | "other";

interface DemoPattern {
  group: DemoGroup;
  category: LifeEventCategory;
  name: string;
  count: number;
  ageStart: number;
  ageEnd: number;
  hour: number;
  durationSeconds: number;
  weekdays?: boolean;
}

const PATTERNS: readonly DemoPattern[] = [
  { group: "work", category: "activity", name: "项目开发", count: 44, ageStart: 0, ageEnd: 364, hour: 9, durationSeconds: 7_200, weekdays: true },
  { group: "work", category: "activity", name: "写代码", count: 38, ageStart: 2, ageEnd: 362, hour: 10, durationSeconds: 5_400, weekdays: true },
  { group: "work", category: "activity", name: "研究", count: 26, ageStart: 4, ageEnd: 360, hour: 14, durationSeconds: 4_500, weekdays: true },
  { group: "learning", category: "learning", name: "阅读", count: 18, ageStart: 100, ageEnd: 330, hour: 20, durationSeconds: 2_400 },
  { group: "learning", category: "learning", name: "阅读", count: 18, ageStart: 0, ageEnd: 89, hour: 21, durationSeconds: 2_100 },
  { group: "learning", category: "learning", name: "学习编程", count: 29, ageStart: 90, ageEnd: 290, hour: 20, durationSeconds: 3_600 },
  { group: "learning", category: "learning", name: "学习编程", count: 3, ageStart: 2, ageEnd: 86, hour: 21, durationSeconds: 3_300 },
  { group: "learning", category: "learning", name: "看论文", count: 20, ageStart: 120, ageEnd: 330, hour: 19, durationSeconds: 5_400 },
  { group: "learning", category: "learning", name: "看论文", count: 2, ageStart: 4, ageEnd: 88, hour: 20, durationSeconds: 4_800 },
  { group: "fitness", category: "activity", name: "跑步", count: 22, ageStart: 0, ageEnd: 89, hour: 7, durationSeconds: 2_400 },
  { group: "fitness", category: "activity", name: "跑步", count: 8, ageStart: 95, ageEnd: 340, hour: 7, durationSeconds: 2_100 },
  { group: "fitness", category: "activity", name: "健身房训练", count: 18, ageStart: 1, ageEnd: 88, hour: 18, durationSeconds: 3_600 },
  { group: "fitness", category: "activity", name: "健身房训练", count: 6, ageStart: 100, ageEnd: 335, hour: 18, durationSeconds: 3_300 },
  { group: "creation", category: "creation", name: "写文章", count: 13, ageStart: 0, ageEnd: 86, hour: 21, durationSeconds: 4_200 },
  { group: "creation", category: "creation", name: "写文章", count: 7, ageStart: 100, ageEnd: 350, hour: 20, durationSeconds: 3_600 },
  { group: "creation", category: "creation", name: "设计产品", count: 14, ageStart: 1, ageEnd: 88, hour: 19, durationSeconds: 5_400 },
  { group: "creation", category: "creation", name: "设计产品", count: 6, ageStart: 105, ageEnd: 345, hour: 19, durationSeconds: 4_800 },
  { group: "creation", category: "creation", name: "创作图片", count: 10, ageStart: 3, ageEnd: 87, hour: 20, durationSeconds: 3_600 },
  { group: "creation", category: "creation", name: "创作图片", count: 4, ageStart: 110, ageEnd: 330, hour: 20, durationSeconds: 3_000 },
  { group: "travel", category: "activity", name: "城市探索", count: 14, ageStart: 10, ageEnd: 305, hour: 10, durationSeconds: 10_800 },
  { group: "travel", category: "creation", name: "旅行摄影", count: 12, ageStart: 12, ageEnd: 300, hour: 15, durationSeconds: 7_200 },
  { group: "travel", category: "activity", name: "上海旅行", count: 4, ageStart: 300, ageEnd: 306, hour: 10, durationSeconds: 14_400 },
  { group: "travel", category: "activity", name: "杭州旅行", count: 3, ageStart: 180, ageEnd: 184, hour: 10, durationSeconds: 12_600 },
  { group: "travel", category: "activity", name: "成都旅行", count: 3, ageStart: 12, ageEnd: 16, hour: 10, durationSeconds: 14_400 },
  { group: "other", category: "activity", name: "听音乐", count: 8, ageStart: 5, ageEnd: 350, hour: 22, durationSeconds: 2_700 },
  { group: "other", category: "activity", name: "散步", count: 6, ageStart: 8, ageEnd: 340, hour: 18, durationSeconds: 2_100 },
  { group: "other", category: "creation", name: "整理照片", count: 4, ageStart: 12, ageEnd: 320, hour: 21, durationSeconds: 3_000 },
];

function parseNaturalDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function naturalDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = parseNaturalDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return naturalDate(date);
}

function ageDate(endDate: string, age: number, weekdays: boolean): string {
  let result = addDays(endDate, -1 - age);
  if (!weekdays) return result;
  const weekday = parseNaturalDate(result).getUTCDay();
  if (weekday === 6) result = addDays(result, -1);
  if (weekday === 0) result = addDays(result, -2);
  return result;
}

function isoAt(occurredOn: string, hour: number, minute: number): string {
  return `${occurredOn}T${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00+08:00`;
}

function locationFor(group: DemoGroup, name: string, index: number): string {
  if (group === "work") return index % 5 === 0 ? "咖啡馆" : "公司";
  if (group === "learning") return index % 4 === 0 ? "图书馆" : index % 5 === 0 ? "咖啡馆" : "家";
  if (group === "fitness") return name === "跑步" ? "户外" : "健身房";
  if (group === "creation") return index % 3 === 0 ? "咖啡馆" : "家";
  if (group === "travel") {
    if (name.includes("上海")) return "上海";
    if (name.includes("杭州")) return "杭州";
    if (name.includes("成都")) return "成都";
    return ["上海", "杭州", "成都"][index % 3];
  }
  return index % 2 === 0 ? "家" : "户外";
}

/** Deterministic, visualization-only occurrences. No repository or IndexedDB call is involved. */
export function generateDemoLifeEvents(endDate: string): LifeEventOccurrence[] {
  const events: Array<LifeEventOccurrence & { demoGroup: DemoGroup }> = [];
  let sequence = 0;

  for (const pattern of PATTERNS) {
    for (let index = 0; index < pattern.count; index += 1) {
      const span = pattern.ageEnd - pattern.ageStart;
      const age = pattern.ageStart + Math.round(span * ((index + 0.35) / pattern.count));
      const occurredOn = ageDate(endDate, age, pattern.weekdays ?? false);
      const durationSeconds = pattern.durationSeconds + [-300, 0, 300, 600][index % 4];
      const hour = pattern.hour + (index % 3 === 2 ? 1 : 0);
      const startAt = isoAt(occurredOn, hour, index % 2 === 0 ? 10 : 35);
      events.push({
        id: `demo-event-${sequence.toString().padStart(4, "0")}`,
        category: pattern.category,
        name: pattern.name,
        occurredOn,
        timeZone: "Asia/Shanghai",
        timePrecision: "interval",
        startAt,
        endAt: new Date(Date.parse(startAt) + durationSeconds * 1_000).toISOString(),
        durationSeconds,
        source: null,
        demoGroup: pattern.group,
      });
      sequence += 1;
    }
  }

  const placeEvents = events
    .filter((_, index) => index % 4 === 0)
    .map((event, index): LifeEventOccurrence => ({
      id: `demo-place-${index.toString().padStart(4, "0")}`,
      category: "place",
      name: locationFor(event.demoGroup, event.name, index),
      occurredOn: event.occurredOn,
      timeZone: "Asia/Shanghai",
      timePrecision: "day",
      startAt: null,
      endAt: null,
      durationSeconds: null,
      source: null,
    }));

  const activityEvents = events.map((event): LifeEventOccurrence => ({
    id: event.id,
    category: event.category,
    name: event.name,
    occurredOn: event.occurredOn,
    timeZone: event.timeZone,
    timePrecision: event.timePrecision,
    startAt: event.startAt,
    endAt: event.endAt,
    durationSeconds: event.durationSeconds,
    source: event.source,
  }));
  return [...activityEvents, ...placeEvents];
}

function emptyCategories(): Map<LifeEventCategory, LifeEventCategoryAggregate> {
  return new Map(CATEGORIES.map((category) => [category, { category, eventCount: 0, totalDurationSeconds: 0 }]));
}

function aggregate(events: readonly LifeEventOccurrence[]) {
  const categories = emptyCategories();
  let totalDurationSeconds = 0;
  for (const event of events) {
    const duration = event.durationSeconds ?? 0;
    totalDurationSeconds += duration;
    const category = categories.get(event.category)!;
    category.eventCount += 1;
    category.totalDurationSeconds += duration;
  }
  return { totalEvents: events.length, totalDurationSeconds, categories: [...categories.values()] };
}

function nameAggregates(events: readonly LifeEventOccurrence[]): LifeEventNameAggregate[] {
  const values = new Map<string, LifeEventNameAggregate>();
  for (const event of events) {
    const key = JSON.stringify([event.category, event.name]);
    const current = values.get(key) ?? {
      category: event.category,
      name: event.name,
      eventCount: 0,
      totalDurationSeconds: 0,
      firstOccurredOn: event.occurredOn,
      lastOccurredOn: event.occurredOn,
    };
    current.eventCount += 1;
    current.totalDurationSeconds += event.durationSeconds ?? 0;
    if (event.occurredOn < current.firstOccurredOn) current.firstOccurredOn = event.occurredOn;
    if (event.occurredOn > current.lastOccurredOn) current.lastOccurredOn = event.occurredOn;
    values.set(key, current);
  }
  return [...values.values()].sort((left, right) =>
    right.eventCount - left.eventCount
    || right.totalDurationSeconds - left.totalDurationSeconds
    || left.name.localeCompare(right.name, "zh-CN"));
}

function bucketStart(occurredOn: string, granularity: LifeEventTimeSeriesGranularity): string {
  if (granularity === "day") return occurredOn;
  const date = parseNaturalDate(occurredOn);
  if (granularity === "week") {
    const offset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - offset);
    return naturalDate(date);
  }
  return `${occurredOn.slice(0, 7)}-01`;
}

function bucketEnd(start: string, granularity: LifeEventTimeSeriesGranularity): string {
  if (granularity === "day") return addDays(start, 1);
  if (granularity === "week") return addDays(start, 7);
  const date = parseNaturalDate(start);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return naturalDate(date);
}

export function getDemoLifeEventExploration(input: {
  startDate: string;
  endDate: string;
  granularity: LifeEventTimeSeriesGranularity;
  recentEventLimit?: number;
}): LifeEventExploration {
  const recentEventLimit = input.recentEventLimit ?? DEMO_EVENT_LIMIT;
  const events = generateDemoLifeEvents(input.endDate)
    .filter((event) => event.occurredOn >= input.startDate && event.occurredOn < input.endDate);
  const totals = aggregate(events);
  const buckets = new Map<string, LifeEventOccurrence[]>();
  for (const event of events) {
    const start = bucketStart(event.occurredOn, input.granularity);
    const values = buckets.get(start) ?? [];
    values.push(event);
    buckets.set(start, values);
  }
  const newest = [...events].sort((left, right) =>
    right.occurredOn.localeCompare(left.occurredOn) || right.id.localeCompare(left.id));
  const range = { startDate: input.startDate, endDate: input.endDate };

  return {
    ...range,
    summary: { ...range, ...totals },
    timeSeries: {
      ...range,
      granularity: input.granularity,
      points: [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([start, values]) => {
        const bucket = aggregate(values);
        return {
          bucketStartDate: start,
          bucketEndDate: bucketEnd(start, input.granularity),
          eventCount: bucket.totalEvents,
          totalDurationSeconds: bucket.totalDurationSeconds,
          categories: bucket.categories,
        };
      }),
    },
    names: nameAggregates(events),
    sources: events.length ? [{
      sourceKind: "independent",
      eventCount: events.length,
      totalDurationSeconds: totals.totalDurationSeconds,
      firstOccurredOn: events.reduce((value, event) => event.occurredOn < value ? event.occurredOn : value, events[0].occurredOn),
      lastOccurredOn: events.reduce((value, event) => event.occurredOn > value ? event.occurredOn : value, events[0].occurredOn),
    }] : [],
    recentEvents: newest.slice(0, recentEventLimit),
    recentEventLimit,
    hasMoreEvents: events.length > recentEventLimit,
  };
}
