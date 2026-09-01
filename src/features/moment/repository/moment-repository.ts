import { db } from "@/lib/db/client";
import { createEntityId } from "@/lib/identity/create-entity-id";
import { nowTimestamp } from "@/lib/time/timestamps";

import type { Attachment } from "@/features/attachment/model/types";

import type {
  CreateMomentAppendInput,
  CreateMomentInput,
  CreateMomentWithAttachmentsInput,
  Moment,
  MomentAppend,
  Timestamp,
  UpdateMomentMetadataInput,
} from "../model/types";

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

function toAttachment(input: CreateMomentWithAttachmentsInput["attachments"][number], ownerId: string, createdAt: string): Attachment {
  if (!input.mimeType.startsWith("image/")) {
    throw new Error("Attachment must be an image.");
  }
  return {
    id: input.id ?? createEntityId(),
    ownerType: "moment",
    ownerId,
    kind: "image",
    blob: input.blob,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size ?? input.blob.size,
    width: input.width ?? null,
    height: input.height ?? null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

export async function createMoment(input: CreateMomentInput): Promise<Moment> {
  requireNonEmpty(input.originalText, "originalText");
  const createdAt = input.createdAt ?? nowTimestamp();
  validateTimestamp(createdAt);
  const moment: Moment = {
    id: input.id ?? createEntityId(),
    originalText: input.originalText,
    isFavorite: false,
    location: input.location ?? null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  await db.moments.add(moment);
  return moment;
}

export async function getMoment(id: string): Promise<Moment | undefined> {
  return db.moments.get(id);
}

export async function createMomentWithAttachments(
  input: CreateMomentWithAttachmentsInput,
): Promise<Moment> {
  requireNonEmpty(input.originalText, "originalText");
  const createdAt = input.createdAt ?? nowTimestamp();
  validateTimestamp(createdAt);
  const moment: Moment = {
    id: input.id ?? createEntityId(),
    originalText: input.originalText,
    isFavorite: false,
    location: input.location ?? null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  const attachments = input.attachments.map((attachment) =>
    toAttachment(attachment, moment.id, createdAt),
  );

  await db.transaction("rw", db.moments, db.attachments, async () => {
    await db.moments.add(moment);
    await db.attachments.bulkAdd(attachments);
  });
  return moment;
}

export async function listMoments(options: { includeDeleted?: boolean } = {}): Promise<Moment[]> {
  const moments = await db.moments.toArray();
  moments.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
  return options.includeDeleted ? moments : moments.filter((moment) => moment.deletedAt === null);
}

export async function listRecentMoments(limit: number): Promise<Moment[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  const recent: Moment[] = [];
  await db.moments.orderBy("createdAt").reverse().each((moment) => {
    if (moment.deletedAt === null) {
      recent.push(moment);
    }
    if (recent.length === limit) {
      return false;
    }
  });

  return recent;
}

export async function updateMomentMetadata(
  id: string,
  input: UpdateMomentMetadataInput,
): Promise<Moment> {
  const moment = await db.moments.get(id);
  if (!moment) {
    throw new Error(`Moment not found: ${id}`);
  }
  const updated: Moment = {
    ...moment,
    ...(input.isFavorite === undefined ? {} : { isFavorite: input.isFavorite }),
    ...(input.location === undefined ? {} : { location: input.location }),
    updatedAt: nowTimestamp(),
  };
  await db.moments.put(updated);
  return updated;
}

export async function softDeleteMoment(id: string, deletedAt = nowTimestamp()): Promise<Moment> {
  validateTimestamp(deletedAt);
  const moment = await db.moments.get(id);
  if (!moment) {
    throw new Error(`Moment not found: ${id}`);
  }
  const deleted: Moment = { ...moment, deletedAt, updatedAt: deletedAt };
  await db.transaction("rw", db.moments, db.momentAppends, db.attachments, async () => {
    await db.moments.put(deleted);
    await db.momentAppends.where("momentId").equals(id).modify({ deletedAt, updatedAt: deletedAt });
    await db.attachments
      .where("[ownerType+ownerId]")
      .equals(["moment", id])
      .modify({ deletedAt, updatedAt: deletedAt });
  });
  return deleted;
}

export async function restoreMoment(id: string): Promise<Moment> {
  const moment = await db.moments.get(id);
  if (!moment) {
    throw new Error(`Moment not found: ${id}`);
  }
  const restored: Moment = { ...moment, deletedAt: null, updatedAt: nowTimestamp() };
  await db.transaction("rw", db.moments, db.momentAppends, db.attachments, async () => {
    await db.moments.put(restored);
    if (moment.deletedAt !== null) {
      await db.momentAppends
        .where("momentId")
        .equals(id)
        .filter((append) => append.deletedAt === moment.deletedAt)
        .modify({ deletedAt: null, updatedAt: restored.updatedAt });
      await db.attachments
        .where("[ownerType+ownerId]")
        .equals(["moment", id])
        .filter((attachment) => attachment.deletedAt === moment.deletedAt)
        .modify({ deletedAt: null, updatedAt: restored.updatedAt });
    }
  });
  return restored;
}

export async function createMomentAppend(
  momentId: string,
  input: CreateMomentAppendInput,
): Promise<MomentAppend> {
  requireNonEmpty(input.text, "text");
  const moment = await db.moments.get(momentId);
  if (!moment || moment.deletedAt !== null) {
    throw new Error(`Cannot append to missing or deleted Moment: ${momentId}`);
  }
  const createdAt = input.createdAt ?? nowTimestamp();
  validateTimestamp(createdAt);
  const append: MomentAppend = {
    id: input.id ?? createEntityId(),
    momentId,
    text: input.text,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  await db.momentAppends.add(append);
  return append;
}

export async function listMomentAppends(
  momentId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<MomentAppend[]> {
  const appends = await db.momentAppends.where("momentId").equals(momentId).toArray();
  const visible = options.includeDeleted
    ? appends
    : appends.filter((append) => append.deletedAt === null);
  visible.sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
  return visible;
}

export async function softDeleteMomentAppend(
  id: string,
  deletedAt = nowTimestamp(),
): Promise<MomentAppend> {
  validateTimestamp(deletedAt);
  const append = await db.momentAppends.get(id);
  if (!append) {
    throw new Error(`MomentAppend not found: ${id}`);
  }
  const deleted: MomentAppend = { ...append, deletedAt, updatedAt: deletedAt };
  await db.momentAppends.put(deleted);
  return deleted;
}
