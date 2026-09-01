import { db } from "@/lib/db/client";
import { createEntityId } from "@/lib/identity/create-entity-id";
import { nowTimestamp } from "@/lib/time/timestamps";

import type { Timestamp } from "@/features/moment/model/types";

import type { CreateDiaryInput, Diary } from "../model/types";

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
  requireNonEmpty(input.title, "title");
  requireNonEmpty(input.body, "body");
  const createdAt = input.createdAt ?? nowTimestamp();
  validateTimestamp(createdAt);
  const diary: Diary = {
    id: input.id ?? createEntityId(),
    title: input.title,
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

export async function listDiaries(options: { includeDeleted?: boolean } = {}): Promise<Diary[]> {
  const diaries = await db.diaries.toArray();
  diaries.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
  return options.includeDeleted
    ? diaries
    : diaries.filter((diary) => diary.deletedAt === null);
}
