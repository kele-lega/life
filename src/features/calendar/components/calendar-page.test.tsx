import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Diary } from "@/features/diary/model/types";
import type { Moment } from "@/features/moment/model/types";
import type { TimelineItem } from "@/features/timeline/model/types";

import type { CalendarMonthResult } from "../model/types";
import { CalendarPage } from "./calendar-page";

const mocks = vi.hoisted(() => ({
  queryCalendarMonth: vi.fn(),
  queryCalendarDay: vi.fn(),
}));

vi.mock("../query/calendar-query", () => ({
  queryCalendarMonth: mocks.queryCalendarMonth,
  queryCalendarDay: mocks.queryCalendarDay,
}));

function momentItem(): Extract<TimelineItem, { type: "moment" }> {
  const createdAt = "2026-09-08T01:00:00.000Z";
  const moment: Moment = {
    id: "moment-1",
    originalText: "Calendar Moment",
    isFavorite: false,
    location: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  return {
    type: "moment",
    id: moment.id,
    createdAt,
    moment,
    appends: [],
    attachments: [],
    errors: { appends: false, attachments: false },
  };
}

function diaryItem(): Extract<TimelineItem, { type: "diary" }> {
  const createdAt = "2026-09-08T02:00:00.000Z";
  const diary: Diary = {
    id: "diary-1",
    title: "",
    body: "Calendar Diary",
    isFavorite: false,
    location: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  return { type: "diary", id: diary.id, createdAt, diary };
}

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.queryCalendarMonth.mockReset();
  mocks.queryCalendarDay.mockReset();
  mocks.queryCalendarMonth.mockResolvedValue({ year: 2026, month: 9, recordedDateKeys: [] });
  mocks.queryCalendarDay.mockResolvedValue({ dateKey: "2026-09-01", items: [] });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:calendar");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

describe("CalendarPage", () => {
  it("switches months across a year and clears stale recorded states", async () => {
    let resolveJanuary: ((value: CalendarMonthResult) => void) | undefined;
    mocks.queryCalendarMonth
      .mockResolvedValueOnce({ year: 2026, month: 12, recordedDateKeys: ["2026-12-01"] })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveJanuary = resolve; }))
      .mockResolvedValueOnce({ year: 2026, month: 12, recordedDateKeys: ["2026-12-01"] })
      .mockResolvedValueOnce({ year: 2026, month: 11, recordedDateKeys: [] });
    const user = userEvent.setup();
    render(<CalendarPage now={new Date(2026, 11, 15, 12)} />);

    expect(screen.getByRole("button", { name: "上一个月" })).toHaveTextContent("‹");
    expect(screen.getByRole("button", { name: "下一个月" })).toHaveTextContent("›");
    expect(screen.getByRole("button", { name: "返回当前月" })).toHaveTextContent("本月");
    expect(screen.getByText("选择一个日期查看内容。")).toBeInTheDocument();

    expect(await screen.findByRole("button", { name: "2026 年 12 月 1 日，有记录" }))
      .toHaveAttribute("data-has-records", "true");
    await user.click(screen.getByRole("button", { name: "下一个月" }));
    expect(await screen.findByRole("heading", { name: "2027 年 1 月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2027 年 1 月 1 日" }))
      .toHaveAttribute("data-has-records", "false");
    resolveJanuary?.({ year: 2027, month: 1, recordedDateKeys: ["2027-01-02"] });
    expect(await screen.findByRole("button", { name: "2027 年 1 月 2 日，有记录" }))
      .toHaveAttribute("data-has-records", "true");

    await user.click(screen.getByRole("button", { name: "返回当前月" }));
    expect(await screen.findByRole("heading", { name: "2026 年 12 月" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "上一个月" }));
    expect(await screen.findByRole("heading", { name: "2026 年 11 月" })).toBeInTheDocument();
  });

  it("shows all roots by default and filters the selected day locally", async () => {
    mocks.queryCalendarMonth.mockResolvedValue({
      year: 2026,
      month: 9,
      recordedDateKeys: ["2026-09-08"],
    });
    mocks.queryCalendarDay.mockResolvedValue({
      dateKey: "2026-09-08",
      items: [diaryItem(), momentItem()],
    });
    const user = userEvent.setup();
    render(<CalendarPage now={new Date(2026, 8, 1, 12)} />);

    await user.click(await screen.findByRole("button", { name: "2026 年 9 月 8 日，有记录" }));
    const detail = await screen.findByRole("region", { name: "2026 年 9 月 8 日的记录" });
    expect(within(detail).getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
    expect(within(detail).getByText("Calendar Moment")).toBeInTheDocument();
    expect(within(detail).getByText("Calendar Diary")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: /Calendar Diary/ }))
      .toHaveAttribute("href", "/diary/diary-1");

    await user.click(within(detail).getByRole("button", { name: "随笔" }));
    expect(within(detail).getByText("Calendar Moment")).toBeInTheDocument();
    expect(within(detail).queryByText("Calendar Diary")).not.toBeInTheDocument();
    expect(mocks.queryCalendarDay).toHaveBeenCalledTimes(1);

    await user.click(within(detail).getByRole("button", { name: "日记" }));
    expect(within(detail).queryByText("Calendar Moment")).not.toBeInTheDocument();
    expect(within(detail).getByText("Calendar Diary")).toBeInTheDocument();
    expect(mocks.queryCalendarDay).toHaveBeenCalledTimes(1);
  });

  it("keeps today separate from the recorded state and shows a quiet empty day", async () => {
    const user = userEvent.setup();
    render(<CalendarPage now={new Date(2026, 8, 1, 12)} />);

    const today = await screen.findByRole("button", { name: "2026 年 9 月 1 日，今天" });
    expect(today).toHaveClass("calendar-day-today");
    expect(today).not.toHaveClass("calendar-day-recorded");
    await user.click(today);

    await waitFor(() => expect(screen.getByText("这一天没有此类记录。")).toBeInTheDocument());
    expect(screen.queryByText(/连续|完成率|漏记|score|streak/i)).not.toBeInTheDocument();
  });
});
