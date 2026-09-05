import type { LifeEventCategory } from "@/features/life-event/model/types";
import type { LifeEventExploration, LifeEventOccurrence } from "@/features/life-insights/model/types";
import type { LifeLens, LifeMapConnection, LifeMapRegion, LifeMapTopic } from "../model/types";

export const CATEGORY_LABELS: Record<LifeEventCategory, string> = {
  activity: "活动",
  learning: "学习",
  creation: "创作",
  place: "地点",
};

const POSITIONS = [
  [0.19, 0.28],
  [0.52, 0.39],
  [0.13, 0.67],
  [0.35, 0.78],
  [0.62, 0.75],
  [0.81, 0.67],
  [0.44, 0.16],
] as const;

const ACTIVITY_TONES: readonly LifeEventCategory[] = [
  "learning",
  "place",
  "activity",
  "creation",
  "creation",
  "place",
  "activity",
];

export function eventTopicKey(event: LifeEventOccurrence, lens: LifeLens): string | null {
  if (lens === "activities") return JSON.stringify([event.category, event.name]);
  if (lens === "places") return event.category === "place" ? JSON.stringify([event.category, event.name]) : null;
  if (lens === "themes") return event.category;
  return event.category;
}

export function buildLifeMapTopics(
  exploration: LifeEventExploration,
  lens: LifeLens,
  limit = POSITIONS.length,
): LifeMapTopic[] {
  if (lens === "activities" || lens === "places") {
    return exploration.names
      .filter((value) => lens === "places" ? value.category === "place" : value.category !== "place")
      .slice(0, limit)
      .map((value) => ({
        key: JSON.stringify([value.category, value.name]),
        label: value.name,
        category: value.category,
        eventCount: value.eventCount,
        totalDurationSeconds: value.totalDurationSeconds,
        firstOccurredOn: value.firstOccurredOn,
        lastOccurredOn: value.lastOccurredOn,
      }));
  }

  return exploration.summary.categories
    .filter((value) => value.eventCount > 0)
    .slice(0, limit)
    .map((value) => {
      const dates = exploration.names.filter((name) => name.category === value.category);
      return {
        key: value.category,
        label: CATEGORY_LABELS[value.category],
        category: value.category,
        eventCount: value.eventCount,
        totalDurationSeconds: value.totalDurationSeconds,
        firstOccurredOn: dates.reduce((earliest, item) => earliest < item.firstOccurredOn ? earliest : item.firstOccurredOn, dates[0]?.firstOccurredOn ?? exploration.startDate),
        lastOccurredOn: dates.reduce((latest, item) => latest > item.lastOccurredOn ? latest : item.lastOccurredOn, dates[0]?.lastOccurredOn ?? exploration.startDate),
      };
    });
}

export function layoutLifeMapTopics(topics: readonly LifeMapTopic[], lens?: LifeLens): LifeMapRegion[] {
  return topics.map((topic, index) => {
    const [x, y] = POSITIONS[index % POSITIONS.length];
    const frequency = 1 - Math.exp(-topic.eventCount / 24);
    const durationHours = topic.totalDurationSeconds / 3600;
    const weight = 1 - Math.exp(-durationHours / 18);
    return {
      ...topic,
      x,
      y,
      radius: 0.105 + frequency * 0.095 + weight * 0.06,
      frequency,
      weight,
      tone: lens === "activities" ? ACTIVITY_TONES[index % ACTIVITY_TONES.length] : topic.category,
    };
  });
}

function naturalDayDistance(left: string, right: string): number {
  return Math.abs((Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`)) / 86_400_000);
}

export function buildLifeMapConnections(
  events: readonly LifeEventOccurrence[],
  topics: readonly LifeMapTopic[],
  lens: LifeLens,
): LifeMapConnection[] {
  const topicKeys = new Set(topics.map((topic) => topic.key));
  const chronological = events
    .filter((event) => {
      const key = eventTopicKey(event, lens);
      return key !== null && topicKeys.has(key);
    })
    .sort((left, right) =>
      left.occurredOn < right.occurredOn ? -1 : left.occurredOn > right.occurredOn ? 1 : left.id < right.id ? -1 : 1);
  const weights = new Map<string, { from: string; to: string; count: number }>();
  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    const from = eventTopicKey(previous, lens);
    const to = eventTopicKey(current, lens);
    if (!from || !to || from === to || !topicKeys.has(from) || !topicKeys.has(to)) continue;
    if (naturalDayDistance(previous.occurredOn, current.occurredOn) > 14) continue;
    const [a, b] = from < to ? [from, to] : [to, from];
    const key = JSON.stringify([a, b]);
    const value = weights.get(key) ?? { from: a, to: b, count: 0 };
    value.count += 1;
    weights.set(key, value);
  }
  const maximum = Math.max(...[...weights.values()].map((value) => value.count), 1);
  return [...weights.values()]
    .sort((left, right) => right.count - left.count || (left.from < right.from ? -1 : 1))
    .slice(0, 10)
    .map(({ from, to, count }) => ({ from, to, strength: count / maximum }));
}

export function topicContainsEvent(topic: LifeMapTopic, event: LifeEventOccurrence, lens: LifeLens): boolean {
  return eventTopicKey(event, lens) === topic.key;
}
