import {
  daysInLocalMonth,
  formatLocalDateKey,
} from "@/lib/time/local-calendar";

import type { CalendarDayCell } from "../model/types";

export function calendarMonthCells(year: number, month: number): Array<CalendarDayCell | null> {
  const firstWeekdayMondayFirst = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells: Array<CalendarDayCell | null> = Array(firstWeekdayMondayFirst).fill(null);
  for (let day = 1; day <= daysInLocalMonth(year, month); day += 1) {
    cells.push({ day, dateKey: formatLocalDateKey(year, month, day) });
  }
  return cells;
}
