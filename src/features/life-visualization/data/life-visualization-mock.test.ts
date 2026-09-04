import { afterEach, describe, expect, it, vi } from "vitest";
import * as statistics from "@/features/life-insights/query/life-statistics-query";
import { generateDemoLifeEvents, getDemoLifeEventExploration } from "./life-visualization-mock";
import { getLifeVisualizationData, LIFE_VISUALIZATION_DEMO_SESSION_KEY } from "./life-visualization-provider";

vi.mock("@/features/life-insights/query/life-statistics-query", () => ({
  getLifeEventExploration: vi.fn(),
}));

const endDate = "2026-09-05";
const startDate = "2025-09-05";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(statistics.getLifeEventExploration).mockReset();
  window.sessionStorage.clear();
});

describe("Life Visualization development data", () => {
  it("builds a deterministic year with realistic density, times and places", () => {
    const first = generateDemoLifeEvents(endDate);
    const second = generateDemoLifeEvents(endDate);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(200);
    expect(first.length).toBeLessThanOrEqual(500);

    const placeNames = new Set(first.filter((event) => event.category === "place").map((event) => event.name));
    expect([...placeNames]).toEqual(expect.arrayContaining(["家", "公司", "咖啡馆", "图书馆", "健身房", "上海", "杭州", "成都"]));
    expect(first.filter((event) => event.category === "place")).toEqual(expect.arrayContaining([
      expect.objectContaining({ timePrecision: "day", startAt: null, endAt: null, durationSeconds: null }),
    ]));

    const work = first.filter((event) => ["项目开发", "写代码", "研究"].includes(event.name));
    const learning = first.filter((event) => ["阅读", "学习编程", "看论文"].includes(event.name));
    expect(work).toHaveLength(108);
    expect(learning).toHaveLength(90);
    expect(work.every((event) => {
      const weekday = new Date(`${event.occurredOn}T00:00:00.000Z`).getUTCDay();
      return weekday >= 1 && weekday <= 5 && Number(event.startAt?.slice(11, 13)) >= 9;
    })).toBe(true);
    expect(learning.every((event) => Number(event.startAt?.slice(11, 13)) >= 19)).toBe(true);
    expect(first.some((event) => /人|朋友|同事/u.test(event.name))).toBe(false);
  });

  it("makes fitness and creation denser recently while learning is heavier earlier", () => {
    const events = generateDemoLifeEvents(endDate).filter((event) => event.category !== "place");
    const recentStart = "2026-06-07";
    const earlierStart = "2025-12-09";
    const earlierEnd = "2026-03-09";
    const fitnessNames = new Set(["跑步", "健身房训练"]);
    const creationNames = new Set(["写文章", "设计产品", "创作图片"]);
    const learningNames = new Set(["阅读", "学习编程", "看论文"]);
    const count = (names: Set<string>, start: string, end: string) => events.filter((event) => names.has(event.name) && event.occurredOn >= start && event.occurredOn < end).length;

    expect(count(fitnessNames, recentStart, endDate)).toBeGreaterThan(count(fitnessNames, earlierStart, earlierEnd));
    expect(count(creationNames, recentStart, endDate)).toBeGreaterThan(count(creationNames, earlierStart, earlierEnd));
    expect(count(learningNames, earlierStart, earlierEnd)).toBeGreaterThan(count(learningNames, recentStart, endDate));
  });

  it("returns a statistics-shaped projection and keeps production on the real query", async () => {
    const demo = getDemoLifeEventExploration({ startDate, endDate, granularity: "month" });
    expect(demo.summary.totalEvents).toBeGreaterThanOrEqual(200);
    expect(demo.names.find((item) => item.name === "项目开发")?.eventCount).toBe(44);
    expect(demo.timeSeries.points.length).toBeGreaterThanOrEqual(12);
    expect(demo.hasMoreEvents).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(statistics.getLifeEventExploration).mockResolvedValue(demo);
    await expect(getLifeVisualizationData({ startDate, endDate, granularity: "month" })).resolves.toEqual({
      exploration: demo,
      mode: "repository",
    });
    expect(statistics.getLifeEventExploration).toHaveBeenCalledOnce();
  });

  it("allows a development session to turn Demo Data off without persistence writes", async () => {
    const demo = getDemoLifeEventExploration({ startDate, endDate, granularity: "month" });
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(statistics.getLifeEventExploration).mockResolvedValue(demo);

    const enabled = await getLifeVisualizationData({ startDate, endDate, granularity: "month" });
    expect(enabled.mode).toBe("demo");
    expect(statistics.getLifeEventExploration).not.toHaveBeenCalled();

    window.sessionStorage.setItem(LIFE_VISUALIZATION_DEMO_SESSION_KEY, "off");
    const disabled = await getLifeVisualizationData({ startDate, endDate, granularity: "month" });
    expect(disabled.mode).toBe("repository");
    expect(statistics.getLifeEventExploration).toHaveBeenCalledOnce();
  });
});
