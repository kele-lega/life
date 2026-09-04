import type { LifeEventExploration, LifeEventTimeSeriesGranularity } from "@/features/life-insights/model/types";
import { getLifeEventExploration } from "@/features/life-insights/query/life-statistics-query";
import { getDemoLifeEventExploration } from "./life-visualization-mock";

export const LIFE_VISUALIZATION_DEMO_SESSION_KEY = "life-visualization-demo";

export interface LifeVisualizationData {
  exploration: LifeEventExploration;
  mode: "demo" | "repository";
}

function isDevelopmentDemoEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (process.env.NEXT_PUBLIC_LIFE_VISUALIZATION_DEMO === "0") return false;
  if (typeof window !== "undefined" && window.sessionStorage.getItem(LIFE_VISUALIZATION_DEMO_SESSION_KEY) === "off") return false;
  return true;
}

export async function getLifeVisualizationData(input: {
  startDate: string;
  endDate: string;
  granularity: LifeEventTimeSeriesGranularity;
  recentEventLimit?: number;
}): Promise<LifeVisualizationData> {
  if (isDevelopmentDemoEnabled()) {
    return { exploration: getDemoLifeEventExploration(input), mode: "demo" };
  }
  return { exploration: await getLifeEventExploration(input), mode: "repository" };
}
