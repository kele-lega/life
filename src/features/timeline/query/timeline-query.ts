import {
  listActiveMomentAttachmentsByMomentIds,
} from "@/features/attachment/repository/attachment-repository";
import type { Attachment } from "@/features/attachment/model/types";
import {
  listActiveDiariesPage,
} from "@/features/diary/repository/diary-repository";
import type { Diary } from "@/features/diary/model/types";
import {
  listActiveMomentAppendsByMomentIds,
  listActiveMomentsPage,
  type TimelineSourceCursor as RepositoryCursor,
} from "@/features/moment/repository/moment-repository";
import type { MomentAppend } from "@/features/moment/model/types";
import type { Moment } from "@/features/moment/model/types";

import type {
  TimelineCursor,
  TimelineItem,
  TimelinePage,
} from "../model/types";

export const TIMELINE_PAGE_SIZE = 20;

type RootCandidate =
  | { source: "moment"; value: Moment }
  | { source: "diary"; value: Diary };

function compareCandidates(left: RootCandidate, right: RootCandidate): number {
  return compareValues(left.value, right.value);
}

function compareValues(
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
): number {
  return right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id);
}

function sourceCursor(
  cursor: TimelineCursor | null | undefined,
  source: "moments" | "diaries",
): RepositoryCursor | null {
  return cursor?.[source] ?? null;
}

function cursorAfterSelected(
  selected: readonly RootCandidate[],
  source: RootCandidate["source"],
  fallback: RepositoryCursor | null,
): RepositoryCursor | null {
  const last = selected.filter((candidate) => candidate.source === source).at(-1);
  return last
    ? { createdAt: last.value.createdAt, id: last.value.id }
    : fallback;
}

export async function hydrateTimelineItems(
  moments: readonly Moment[],
  diaries: readonly Diary[],
): Promise<TimelineItem[]> {
  const candidates: RootCandidate[] = [
    ...moments.map((value) => ({ source: "moment" as const, value })),
    ...diaries.map((value) => ({ source: "diary" as const, value })),
  ];
  candidates.sort(compareCandidates);
  const momentIds = moments.map((moment) => moment.id);
  const [appendsResult, attachmentsResult] = await Promise.allSettled([
    listActiveMomentAppendsByMomentIds(momentIds),
    listActiveMomentAttachmentsByMomentIds(momentIds),
  ]);
  const appends = appendsResult.status === "fulfilled"
    ? appendsResult.value
    : new Map<string, MomentAppend[]>();
  const attachments = attachmentsResult.status === "fulfilled"
    ? attachmentsResult.value
    : new Map<string, Attachment[]>();

  return candidates.map((candidate) => {
    if (candidate.source === "diary") {
      return {
        type: "diary" as const,
        id: candidate.value.id,
        createdAt: candidate.value.createdAt,
        diary: candidate.value,
      };
    }
    return {
      type: "moment" as const,
      id: candidate.value.id,
      createdAt: candidate.value.createdAt,
      moment: candidate.value,
      appends: appends.get(candidate.value.id) ?? [],
      attachments: attachments.get(candidate.value.id) ?? [],
      errors: {
        appends: appendsResult.status === "rejected",
        attachments: attachmentsResult.status === "rejected",
      },
    };
  });
}

export async function queryTimelinePage(
  cursor: TimelineCursor | null = null,
  pageSize = TIMELINE_PAGE_SIZE,
): Promise<TimelinePage> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer.");
  }

  const [momentsResult, diariesResult] = await Promise.allSettled([
    listActiveMomentsPage({ limit: pageSize, cursor: sourceCursor(cursor, "moments") }),
    listActiveDiariesPage({ limit: pageSize, cursor: sourceCursor(cursor, "diaries") }),
  ]);

  if (momentsResult.status === "rejected" && diariesResult.status === "rejected") {
    throw new Error("Timeline cannot be read.");
  }

  const moments = momentsResult.status === "fulfilled" ? momentsResult.value : null;
  const diaries = diariesResult.status === "fulfilled" ? diariesResult.value : null;
  const candidates: RootCandidate[] = [
    ...(moments?.items.map((value) => ({ source: "moment" as const, value })) ?? []),
    ...(diaries?.items.map((value) => ({ source: "diary" as const, value })) ?? []),
  ];
  candidates.sort(compareCandidates);
  const selected = candidates.slice(0, pageSize);
  const items = await hydrateTimelineItems(
    selected.filter((candidate): candidate is Extract<RootCandidate, { source: "moment" }> =>
      candidate.source === "moment").map((candidate) => candidate.value),
    selected.filter((candidate): candidate is Extract<RootCandidate, { source: "diary" }> =>
      candidate.source === "diary").map((candidate) => candidate.value),
  );

  const boundary = selected.at(-1);
  const nextCursor: TimelineCursor | null = boundary === undefined ? null : {
    moments: cursorAfterSelected(
      selected,
      "moment",
      sourceCursor(cursor, "moments"),
    ),
    diaries: cursorAfterSelected(
      selected,
      "diary",
      sourceCursor(cursor, "diaries"),
    ),
  };
  const hasMore = Boolean(moments?.hasMore || diaries?.hasMore || candidates.length > selected.length);

  return { items, nextCursor: hasMore ? nextCursor : null, hasMore };
}
