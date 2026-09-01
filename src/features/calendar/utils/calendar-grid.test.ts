import { describe, expect, it } from "vitest";

import { calendarMonthCells } from "./calendar-grid";

describe("calendarMonthCells", () => {
  it("lays out a Monday-first 30-day month", () => {
    const cells = calendarMonthCells(2026, 9);
    expect(cells.find((cell) => cell?.day === 1)?.dateKey).toBe("2026-09-01");
    expect(cells.filter(Boolean)).toHaveLength(30);
    expect(cells[0]).toBeNull();
  });

  it("contains every day in a leap February", () => {
    expect(calendarMonthCells(2028, 2).filter(Boolean)).toHaveLength(29);
  });
});
