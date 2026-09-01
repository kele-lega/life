export interface UtcRange {
  startInclusive: string;
  endExclusive: string;
}

export interface LocalMonth {
  year: number;
  month: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function requireValidMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("year and month must describe a valid local month.");
  }
}

export function localDateKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateKey(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error("timestamp must be valid.");
  return localDateKeyFromDate(date);
}

export function parseLocalDateKey(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error("dateKey must use YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("dateKey must describe a valid local date.");
  }
  return date;
}

export function localDayUtcRange(dateKey: string): UtcRange {
  const start = parseLocalDateKey(dateKey);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return { startInclusive: start.toISOString(), endExclusive: end.toISOString() };
}

export function localMonthUtcRange(year: number, month: number): UtcRange {
  requireValidMonth(year, month);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { startInclusive: start.toISOString(), endExclusive: end.toISOString() };
}

export function daysInLocalMonth(year: number, month: number): number {
  requireValidMonth(year, month);
  return new Date(year, month, 0).getDate();
}

export function shiftLocalMonth(value: LocalMonth, offset: number): LocalMonth {
  requireValidMonth(value.year, value.month);
  if (!Number.isInteger(offset)) throw new Error("offset must be an integer.");
  const shifted = new Date(value.year, value.month - 1 + offset, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
}

export function localMonthFromDate(date: Date): LocalMonth {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function formatLocalDateKey(year: number, month: number, day: number): string {
  requireValidMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > daysInLocalMonth(year, month)) {
    throw new Error("day must describe a valid date in the month.");
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}
