import type { TimelineItem } from "../model/types";

import { localDateKey } from "@/lib/time/local-calendar";

export { localDateKey } from "@/lib/time/local-calendar";

export interface TimelineDateGroup {
  key: string;
  label: string;
  items: TimelineItem[];
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatTimelineDate(timestamp: string, now = new Date()): string {
  const date = new Date(timestamp);
  const difference = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000);
  if (difference === 0) return "今天";
  if (difference === 1) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", {
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatTimelineTime(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function groupTimelineItems(
  items: readonly TimelineItem[],
  now = new Date(),
): TimelineDateGroup[] {
  const groups = new Map<string, TimelineDateGroup>();
  for (const item of items) {
    const key = localDateKey(item.createdAt);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, { key, label: formatTimelineDate(item.createdAt, now), items: [item] });
    }
  }
  return [...groups.values()];
}
