import type { LifeEventCategory } from "@/features/life-event/model/types";
export type LifeLens = "activities" | "places" | "themes";
export type LifeMapTone = LifeEventCategory;

export interface LifeMapTopic {
  key: string;
  label: string;
  category: LifeEventCategory;
  eventCount: number;
  totalDurationSeconds: number;
  firstOccurredOn: string;
  lastOccurredOn: string;
}

export interface LifeMapRegion extends LifeMapTopic {
  x: number;
  y: number;
  radius: number;
  tone: LifeMapTone;
}

export interface LifeMapConnection {
  from: string;
  to: string;
  strength: number;
}
