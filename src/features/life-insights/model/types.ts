import type {
  LifeEvent,
  LifeEventCategory,
  LifeEventSourceRef,
  LifeEventSourceType,
} from "@/features/life-event/model/types";

export interface LifeStatisticsRange {
  startDate: string;
  endDate: string;
}

export interface LifeEventCategoryAggregate {
  category: LifeEventCategory;
  eventCount: number;
  totalDurationSeconds: number;
}

export interface LifeEventSummary extends LifeStatisticsRange {
  totalEvents: number;
  totalDurationSeconds: number;
  categories: LifeEventCategoryAggregate[];
}

export type LifeEventTimeSeriesGranularity = "day" | "week" | "month";

export interface LifeEventTimeSeriesPoint {
  bucketStartDate: string;
  bucketEndDate: string;
  eventCount: number;
  totalDurationSeconds: number;
  categories: LifeEventCategoryAggregate[];
}

export interface LifeEventTimeSeries extends LifeStatisticsRange {
  granularity: LifeEventTimeSeriesGranularity;
  points: LifeEventTimeSeriesPoint[];
}

/** Exact domain grouping used for drill-down; it contains no presentation geometry. */
export interface LifeEventNameAggregate extends LifeEventCategoryAggregate {
  name: string;
  firstOccurredOn: string;
  lastOccurredOn: string;
}

export type LifeEventSourceKind = LifeEventSourceType | "independent";

export interface LifeEventSourceAggregate {
  sourceKind: LifeEventSourceKind;
  eventCount: number;
  totalDurationSeconds: number;
  firstOccurredOn: string;
  lastOccurredOn: string;
}

/** A bounded, source-valid event projection for timeline and record drill-down. */
export interface LifeEventOccurrence {
  id: LifeEvent["id"];
  category: LifeEventCategory;
  name: string;
  occurredOn: string;
  timeZone: string;
  timePrecision: LifeEvent["timePrecision"];
  startAt: LifeEvent["startAt"];
  endAt: LifeEvent["endAt"];
  durationSeconds: number | null;
  source: LifeEventSourceRef | null;
}

/**
 * Read-only exploration contract. Names and source kinds are domain values;
 * layouts, colors, coordinates and visualization identities remain outside it.
 */
export interface LifeEventExploration extends LifeStatisticsRange {
  summary: LifeEventSummary;
  timeSeries: LifeEventTimeSeries;
  names: LifeEventNameAggregate[];
  sources: LifeEventSourceAggregate[];
  recentEvents: LifeEventOccurrence[];
  recentEventLimit: number;
  hasMoreEvents: boolean;
}
