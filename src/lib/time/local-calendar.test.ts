import { describe, expect, it } from "vitest";

import {
  daysInLocalMonth,
  localDayUtcRange,
  localMonthUtcRange,
  shiftLocalMonth,
} from "./local-calendar";

describe("local calendar ranges", () => {
  it("converts Shanghai local month boundaries to UTC half-open ranges", () => {
    expect(localMonthUtcRange(2026, 9)).toEqual({
      startInclusive: "2026-08-31T16:00:00.000Z",
      endExclusive: "2026-09-30T16:00:00.000Z",
    });
    expect(localDayUtcRange("2026-09-01")).toEqual({
      startInclusive: "2026-08-31T16:00:00.000Z",
      endExclusive: "2026-09-01T16:00:00.000Z",
    });
  });

  it("handles leap years and 30/31-day months", () => {
    expect(daysInLocalMonth(2028, 2)).toBe(29);
    expect(daysInLocalMonth(2026, 4)).toBe(30);
    expect(daysInLocalMonth(2026, 1)).toBe(31);
  });

  it("shifts months across year boundaries", () => {
    expect(shiftLocalMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftLocalMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
  });

  it.each(["2026-02-29", "2026-13-01", "not-a-date"])(
    "rejects invalid local date %s",
    async (dateKey) => {
      expect(() => localDayUtcRange(dateKey)).toThrow();
    },
  );
});
