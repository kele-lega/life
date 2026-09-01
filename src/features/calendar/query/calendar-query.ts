import { listActiveDiariesByCreatedAtRange } from "@/features/diary/repository/diary-repository";
import { listActiveMomentsByCreatedAtRange } from "@/features/moment/repository/moment-repository";
import { hydrateTimelineItems } from "@/features/timeline/query/timeline-query";
import {
  localDateKey,
  localDayUtcRange,
  localMonthUtcRange,
} from "@/lib/time/local-calendar";

import type { CalendarDayResult, CalendarMonthResult } from "../model/types";

export async function queryCalendarMonth(
  year: number,
  month: number,
): Promise<CalendarMonthResult> {
  const range = localMonthUtcRange(year, month);
  const [moments, diaries] = await Promise.all([
    listActiveMomentsByCreatedAtRange(range.startInclusive, range.endExclusive),
    listActiveDiariesByCreatedAtRange(range.startInclusive, range.endExclusive),
  ]);
  const recorded = new Set<string>();
  for (const root of [...moments, ...diaries]) recorded.add(localDateKey(root.createdAt));
  return { year, month, recordedDateKeys: [...recorded].sort() };
}

export async function queryCalendarDay(dateKey: string): Promise<CalendarDayResult> {
  const range = localDayUtcRange(dateKey);
  const [moments, diaries] = await Promise.all([
    listActiveMomentsByCreatedAtRange(range.startInclusive, range.endExclusive),
    listActiveDiariesByCreatedAtRange(range.startInclusive, range.endExclusive),
  ]);
  return {
    dateKey,
    items: await hydrateTimelineItems(moments, diaries),
  };
}
