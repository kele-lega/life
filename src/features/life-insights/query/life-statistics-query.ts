import { listLifeEventsForStatistics } from "@/features/life-event/repository/life-event-repository";
import type { LifeEventCategory, LifeEventView } from "@/features/life-event/model/types";
import { assertDate } from "@/features/life-event/model/validation";
import type {
  LifeEventCategoryAggregate,
  LifeEventExploration,
  LifeEventNameAggregate,
  LifeEventOccurrence,
  LifeEventSourceAggregate,
  LifeEventSourceKind,
  LifeEventSummary,
  LifeEventTimeSeries,
  LifeEventTimeSeriesGranularity,
} from "../model/types";

export const LIFE_EVENT_CATEGORIES: readonly LifeEventCategory[] = [
  "activity",
  "learning",
  "creation",
  "place",
];

export const DEFAULT_LIFE_EVENT_EXPLORATION_LIMIT = 160;
export const MAX_LIFE_EVENT_EXPLORATION_LIMIT = 500;

interface LifeStatisticsInput {
  /** Inclusive natural date, YYYY-MM-DD. */
  startDate: string;
  /** Exclusive natural date, YYYY-MM-DD. */
  endDate: string;
}

function validateRange({ startDate, endDate }: LifeStatisticsInput): void {
  assertDate(startDate);
  assertDate(endDate);
  if (startDate >= endDate) throw new Error("统计日期范围必须递增。");
}

function emptyCategories(): Map<LifeEventCategory, LifeEventCategoryAggregate> {
  return new Map(LIFE_EVENT_CATEGORIES.map((category) => [
    category,
    { category, eventCount: 0, totalDurationSeconds: 0 },
  ]));
}

function addDuration(left: number, right: number | null): number {
  if (right === null) return left;
  const total = left + right;
  if (!Number.isSafeInteger(total)) throw new Error("统计时长超出安全整数范围。");
  return total;
}

function aggregate(events: readonly LifeEventView[]): {
  eventCount: number;
  totalDurationSeconds: number;
  categories: LifeEventCategoryAggregate[];
} {
  const categories = emptyCategories();
  let totalDurationSeconds = 0;
  for (const event of events) {
    totalDurationSeconds = addDuration(totalDurationSeconds, event.durationSeconds);
    const category = categories.get(event.category)!;
    category.eventCount += 1;
    category.totalDurationSeconds = addDuration(
      category.totalDurationSeconds,
      event.durationSeconds,
    );
  }
  return {
    eventCount: events.length,
    totalDurationSeconds,
    categories: [...categories.values()],
  };
}

function summaryFor(
  input: LifeStatisticsInput,
  events: readonly LifeEventView[],
): LifeEventSummary {
  const result = aggregate(events);
  return {
    ...input,
    totalEvents: result.eventCount,
    totalDurationSeconds: result.totalDurationSeconds,
    categories: result.categories,
  };
}

function parseNaturalDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatNaturalDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function bucketBounds(
  occurredOn: string,
  granularity: LifeEventTimeSeriesGranularity,
): { start: string; end: string } {
  const date = parseNaturalDate(occurredOn);
  if (granularity === "day") {
    return { start: occurredOn, end: formatNaturalDate(addUtcDays(date, 1)) };
  }
  if (granularity === "week") {
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    const start = addUtcDays(date, -daysSinceMonday);
    return { start: formatNaturalDate(start), end: formatNaturalDate(addUtcDays(start, 7)) };
  }
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start: formatNaturalDate(start), end: formatNaturalDate(end) };
}

async function readEligibleEvents(input: LifeStatisticsInput): Promise<LifeEventView[]> {
  validateRange(input);
  return listLifeEventsForStatistics({
    startDateInclusive: input.startDate,
    endDateExclusive: input.endDate,
  });
}

function timeSeriesFor(
  input: LifeStatisticsInput & { granularity: LifeEventTimeSeriesGranularity },
  events: readonly LifeEventView[],
): LifeEventTimeSeries {
  const buckets = new Map<string, { end: string; events: LifeEventView[] }>();
  for (const event of events) {
    const { start, end } = bucketBounds(event.occurredOn, input.granularity);
    const bucket = buckets.get(start) ?? { end, events: [] };
    bucket.events.push(event);
    buckets.set(start, bucket);
  }

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    granularity: input.granularity,
    points: [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucketStartDate, bucket]) => {
        const result = aggregate(bucket.events);
        return {
          bucketStartDate,
          bucketEndDate: bucket.end,
          eventCount: result.eventCount,
          totalDurationSeconds: result.totalDurationSeconds,
          categories: result.categories,
        };
      }),
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nameAggregates(events: readonly LifeEventView[]): LifeEventNameAggregate[] {
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
    current.totalDurationSeconds = addDuration(current.totalDurationSeconds, event.durationSeconds);
    if (event.occurredOn < current.firstOccurredOn) current.firstOccurredOn = event.occurredOn;
    if (event.occurredOn > current.lastOccurredOn) current.lastOccurredOn = event.occurredOn;
    values.set(key, current);
  }
  return [...values.values()].sort((left, right) =>
    right.eventCount - left.eventCount
    || right.totalDurationSeconds - left.totalDurationSeconds
    || LIFE_EVENT_CATEGORIES.indexOf(left.category) - LIFE_EVENT_CATEGORIES.indexOf(right.category)
    || compareText(left.name, right.name));
}

function sourceAggregates(events: readonly LifeEventView[]): LifeEventSourceAggregate[] {
  const order: readonly LifeEventSourceKind[] = ["independent", "moment", "momentAppend", "diary"];
  const values = new Map<LifeEventSourceKind, LifeEventSourceAggregate>();
  for (const event of events) {
    const sourceKind = event.source?.type ?? "independent";
    const current = values.get(sourceKind) ?? {
      sourceKind,
      eventCount: 0,
      totalDurationSeconds: 0,
      firstOccurredOn: event.occurredOn,
      lastOccurredOn: event.occurredOn,
    };
    current.eventCount += 1;
    current.totalDurationSeconds = addDuration(current.totalDurationSeconds, event.durationSeconds);
    if (event.occurredOn < current.firstOccurredOn) current.firstOccurredOn = event.occurredOn;
    if (event.occurredOn > current.lastOccurredOn) current.lastOccurredOn = event.occurredOn;
    values.set(sourceKind, current);
  }
  return order.flatMap((sourceKind) => {
    const value = values.get(sourceKind);
    return value ? [value] : [];
  });
}

function occurrence(event: LifeEventView): LifeEventOccurrence {
  return {
    id: event.id,
    category: event.category,
    name: event.name,
    occurredOn: event.occurredOn,
    timeZone: event.timeZone,
    timePrecision: event.timePrecision,
    startAt: event.startAt,
    endAt: event.endAt,
    durationSeconds: event.durationSeconds,
    source: event.source ? { type: event.source.type, id: event.source.id } : null,
  };
}

export async function getLifeEventSummary(
  input: LifeStatisticsInput,
): Promise<LifeEventSummary> {
  const events = await readEligibleEvents(input);
  return summaryFor(input, events);
}

export async function getLifeEventTimeSeries(
  input: LifeStatisticsInput & { granularity: LifeEventTimeSeriesGranularity },
): Promise<LifeEventTimeSeries> {
  if (!["day", "week", "month"].includes(input.granularity)) {
    throw new Error("时间粒度无效。");
  }
  const events = await readEligibleEvents(input);
  return timeSeriesFor(input, events);
}

export async function getLifeEventExploration(
  input: LifeStatisticsInput & {
    granularity: LifeEventTimeSeriesGranularity;
    recentEventLimit?: number;
  },
): Promise<LifeEventExploration> {
  if (!["day", "week", "month"].includes(input.granularity)) {
    throw new Error("时间粒度无效。");
  }
  const recentEventLimit = input.recentEventLimit ?? DEFAULT_LIFE_EVENT_EXPLORATION_LIMIT;
  if (!Number.isInteger(recentEventLimit) || recentEventLimit < 1 || recentEventLimit > MAX_LIFE_EVENT_EXPLORATION_LIMIT) {
    throw new Error(`探索事件条数必须是 1–${MAX_LIFE_EVENT_EXPLORATION_LIMIT} 的整数。`);
  }
  const range = { startDate: input.startDate, endDate: input.endDate };
  const events = await readEligibleEvents(range);
  const newest = [...events].sort((left, right) =>
    compareText(right.occurredOn, left.occurredOn) || compareText(right.id, left.id));

  return {
    ...range,
    summary: summaryFor(range, events),
    timeSeries: timeSeriesFor({ ...range, granularity: input.granularity }, events),
    names: nameAggregates(events),
    sources: sourceAggregates(events),
    recentEvents: newest.slice(0, recentEventLimit).map(occurrence),
    recentEventLimit,
    hasMoreEvents: newest.length > recentEventLimit,
  };
}
