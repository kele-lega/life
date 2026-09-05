import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEventExploration } from "@/features/life-insights/model/types";
import * as statistics from "@/features/life-insights/query/life-statistics-query";
import { LifeVisualization } from "./life-visualization";

vi.mock("@/features/life-insights/query/life-statistics-query", async (importOriginal) => {
  const original = await importOriginal<typeof statistics>();
  return { ...original, getLifeEventExploration: vi.fn() };
});

const result: LifeEventExploration = {
  startDate: "2025-09-04",
  endDate: "2026-09-04",
  summary: {
    startDate: "2025-09-04",
    endDate: "2026-09-04",
    totalEvents: 3,
    totalDurationSeconds: 4800,
    categories: [
      { category: "activity", eventCount: 0, totalDurationSeconds: 0 },
      { category: "learning", eventCount: 2, totalDurationSeconds: 3600 },
      { category: "creation", eventCount: 0, totalDurationSeconds: 0 },
      { category: "place", eventCount: 1, totalDurationSeconds: 1200 },
    ],
  },
  timeSeries: {
    startDate: "2025-09-04",
    endDate: "2026-09-04",
    granularity: "month",
    points: [],
  },
  names: [
    { category: "learning", name: "阅读", eventCount: 2, totalDurationSeconds: 3600, firstOccurredOn: "2026-08-01", lastOccurredOn: "2026-09-03" },
    { category: "place", name: "海边", eventCount: 1, totalDurationSeconds: 1200, firstOccurredOn: "2026-09-02", lastOccurredOn: "2026-09-02" },
  ],
  sources: [
    { sourceKind: "independent", eventCount: 2, totalDurationSeconds: 2400, firstOccurredOn: "2026-08-01", lastOccurredOn: "2026-09-02" },
    { sourceKind: "diary", eventCount: 1, totalDurationSeconds: 2400, firstOccurredOn: "2026-09-03", lastOccurredOn: "2026-09-03" },
  ],
  recentEvents: [
    { id: "event-3", category: "learning", name: "阅读", occurredOn: "2026-09-03", timeZone: "Asia/Shanghai", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 2400, source: { type: "diary", id: "diary-1" } },
    { id: "event-2", category: "place", name: "海边", occurredOn: "2026-09-02", timeZone: "Asia/Shanghai", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1200, source: null },
    { id: "event-1", category: "learning", name: "阅读", occurredOn: "2026-08-01", timeZone: "Asia/Shanghai", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1200, source: null },
  ],
  recentEventLimit: 160,
  hasMoreEvents: false,
};

beforeEach(() => {
  cleanup();
  vi.mocked(statistics.getLifeEventExploration).mockReset().mockResolvedValue(result);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Life Visualization", () => {
  it("reads the statistics contract, reveals details on hover and switches lenses", async () => {
    render(<LifeVisualization />);
    const reading = await screen.findByRole("button", { name: "阅读，2 次事件" });
    expect(statistics.getLifeEventExploration).toHaveBeenCalledWith(expect.objectContaining({ granularity: "day" }));
    expect(screen.queryByRole("complementary", { name: "生活地图详情" })).not.toBeInTheDocument();

    fireEvent.mouseEnter(reading);
    await waitFor(() => expect(screen.getByRole("heading", { name: "阅读" })).toBeVisible());
    const detail = within(screen.getByRole("complementary", { name: "生活地图详情" }));
    expect(detail.getByText("生活主题 · 学习")).toBeVisible();
    expect(detail.getByText("2 次沉积", { exact: true })).toBeVisible();
    expect(detail.getByText("最近变化")).toBeVisible();
    expect(detail.getByText("关联方向")).toBeVisible();
    fireEvent.mouseLeave(reading, { relatedTarget: screen.getByRole("complementary", { name: "生活地图详情" }) });
    // Keep details available while the pointer moves from the terrain into them.
    expect(screen.getByRole("complementary", { name: "生活地图详情" })).toBeVisible();
    fireEvent.mouseLeave(screen.getByRole("region", { name: "Life Map" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "生活地图详情" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "地点" }));
    expect(screen.getByRole("button", { name: "海边，1 次事件" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "阅读，2 次事件" })).not.toBeInTheDocument();
  });

  it("treats 30, 90 and 365 days as time depth and reloads the same read contract", async () => {
    render(<LifeVisualization />);
    await screen.findByRole("button", { name: "阅读，2 次事件" });
    const thirtyDays = screen.getByRole("button", { name: "30 天" });
    const ninetyDays = screen.getByRole("button", { name: "90 天" });
    expect(thirtyDays).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(ninetyDays);
    await waitFor(() => expect(statistics.getLifeEventExploration).toHaveBeenLastCalledWith(
      expect.objectContaining({ granularity: "week" }),
    ));
    expect(ninetyDays).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "时间沉积深度" })).toBeInTheDocument();
  });

  it("keeps the map free of the source lens and bottom event list", async () => {
    render(<LifeVisualization />);
    await screen.findByRole("button", { name: "阅读，2 次事件" });
    expect(screen.queryByRole("tab", { name: "来源" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "LifeEvent" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "地点视角预览" }).nextElementSibling).toHaveClass(/previewCloud/);
  });

  it("keeps a recoverable read error state", async () => {
    vi.mocked(statistics.getLifeEventExploration).mockRejectedValueOnce(new Error("read failed")).mockResolvedValueOnce(result);
    render(<LifeVisualization />);
    expect(await screen.findByRole("alert")).toHaveTextContent("生活地图暂时无法读取");
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "阅读，2 次事件" })).toBeInTheDocument());
  });

  it("retains the last readable map and offers retry when a range read fails", async () => {
    render(<LifeVisualization />);
    await screen.findByRole("button", { name: "阅读，2 次事件" });
    vi.mocked(statistics.getLifeEventExploration).mockRejectedValueOnce(new Error("range failed"));
    fireEvent.click(screen.getByRole("button", { name: "90 天" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("生活地图暂时无法读取");
    expect(screen.getByRole("button", { name: "阅读，2 次事件" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false"));
  });
});
