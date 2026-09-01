import { db } from "@/lib/db/client";
import { createEntityId } from "@/lib/identity/create-entity-id";
import { nowTimestamp } from "@/lib/time/timestamps";

import type { Timestamp } from "@/features/moment/model/types";

import type { CreateDiaryInput, Diary } from "../model/types";

export interface UpdateDiaryContentInput {
  title?: string;
  body: string;
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must not be empty.`);
  }
}

function validateTimestamp(value: Timestamp): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("createdAt must be a valid ISO 8601 timestamp.");
  }
}

export async function createDiary(input: CreateDiaryInput): Promise<Diary> {
  requireNonEmpty(input.body, "body");
  const createdAt = input.createdAt ?? nowTimestamp();
  validateTimestamp(createdAt);
  const diary: Diary = {
    id: input.id ?? createEntityId(),
    title: input.title ?? "",
    body: input.body,
    isFavorite: false,
    location: input.location ?? null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  await db.diaries.add(diary);
  return diary;
}

export async function getDiary(id: string): Promise<Diary | undefined> {
  return db.diaries.get(id);
}

export async function updateDiaryContent(
  id: string,
  input: UpdateDiaryContentInput,
): Promise<Diary> {
  requireNonEmpty(input.body, "body");
  const diary = await db.diaries.get(id);
  if (!diary || diary.deletedAt !== null) {
    throw new Error(`Cannot update missing or deleted Diary: ${id}`);
  }
  const updatedAt = nowTimestamp();
  const updated: Diary = {
    ...diary,
    title: input.title ?? "",
    body: input.body,
    updatedAt,
  };
  await db.diaries.put(updated);
  return updated;
}

export async function listDiaries(options: { includeDeleted?: boolean } = {}): Promise<Diary[]> {
  const diaries = await db.diaries.toArray();
  diaries.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
  return options.includeDeleted
    ? diaries
    : diaries.filter((diary) => diary.deletedAt === null);
}

export async function listActiveDiariesByCreatedAtRange(
  startInclusive: Timestamp,
  endExclusive: Timestamp,
): Promise<Diary[]> {
  validateTimestamp(startInclusive);
  validateTimestamp(endExclusive);
  if (startInclusive >= endExclusive) {
    throw new Error("createdAt range must be increasing.");
  }
  const diaries = await db.diaries
    .where("createdAt")
    .between(startInclusive, endExclusive, true, false)
    .toArray();
  return diaries
    .filter((diary) => diary.deletedAt === null)
    .sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
    );
}

export interface DiaryPageOptions {
  limit: number;
  cursor?: { createdAt: Timestamp; id: string } | null;
}

export interface DiaryPage {
  items: Diary[];
  nextCursor: { createdAt: Timestamp; id: string } | null;
  hasMore: boolean;
}

export async function listActiveDiariesPage({ limit, cursor = null }: DiaryPageOptions): Promise<DiaryPage> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  const items: Diary[] = [];
  let hasMore = false;
  let boundaryTimestamp: Timestamp | null = null;
  await db.diaries.orderBy("createdAt").reverse().each((diary) => {
    if (cursor && (diary.createdAt > cursor.createdAt ||
      (diary.createdAt === cursor.createdAt && diary.id >= cursor.id))) {
      return;
    }
    if (diary.deletedAt !== null) return;
    if (items.length < limit) {
      items.push(diary);
      boundaryTimestamp = diary.createdAt;
      return;
    }
    if (diary.createdAt === boundaryTimestamp) {
      items.push(diary);
      return;
    }
    hasMore = true;
    return false;
  });

  items.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
  if (items.length > limit) {
    hasMore = true;
    items.length = limit;
  }

  const last = items.at(-1);
  return {
    items,
    nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
    hasMore,
  };
}
