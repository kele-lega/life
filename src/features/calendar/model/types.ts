import type { TimelineItem } from "@/features/timeline/model/types";

export type CalendarFilter = "all" | "moment" | "diary";

export interface CalendarMonthResult {
  year: number;
  month: number;
  recordedDateKeys: string[];
}

export interface CalendarDayResult {
  dateKey: string;
  items: TimelineItem[];
}

export interface CalendarDayCell {
  dateKey: string;
  day: number;
}
