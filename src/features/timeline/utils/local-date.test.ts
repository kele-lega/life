import { describe, expect, it } from "vitest";

import type { Diary } from "@/features/diary/model/types";
import type { Moment } from "@/features/moment/model/types";

import {
  formatTimelineDate,
  groupTimelineItems,
  localDateKey,
} from "./local-date";

function moment(id: string, createdAt: string): Extract<import("../model/types").TimelineItem, { type: "moment" }> {
  const value: Moment = {
    id, originalText: id, isFavorite: false, location: null,
    createdAt, updatedAt: createdAt, deletedAt: null,
  };
  return { type: "moment", id, createdAt, moment: value, appends: [], attachments: [], errors: { appends: false, attachments: false } };
}

function diary(id: string, createdAt: string): Extract<import("../model/types").TimelineItem, { type: "diary" }> {
  const value: Diary = {
    id, title: "", body: id, isFavorite: false, location: null,
    createdAt, updatedAt: createdAt, deletedAt: null,
  };
  return { type: "diary", id, createdAt, diary: value };
}

describe("Timeline local dates", () => {
  it("uses the browser local date rather than the UTC date", () => {
    expect(localDateKey("2026-09-01T16:30:00.000Z")).toBe("2026-09-02");
  });

  it("labels today and yesterday from local calendar days", () => {
    const now = new Date(2026, 8, 2, 12, 0, 0);

    expect(formatTimelineDate(new Date(2026, 8, 2, 1).toISOString(), now)).toBe("今天");
    expect(formatTimelineDate(new Date(2026, 8, 1, 23).toISOString(), now)).toBe("昨天");
  });

  it("groups mixed roots without turning children into roots", () => {
    const items = [moment("m", "2026-09-01T12:00:00.000Z"), diary("d", "2026-09-01T11:00:00.000Z")];
    expect(groupTimelineItems(items, new Date("2026-09-02T00:00:00.000Z"))).toHaveLength(1);
    expect(items).toHaveLength(2);
  });
});
