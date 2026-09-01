import { db } from "@/lib/db/client";
import { createEntityId } from "@/lib/identity/create-entity-id";
import { nowTimestamp } from "@/lib/time/timestamps";

import type { Attachment, CreateAttachmentInput } from "../model/types";

function requireImage(mimeType: string): void {
  if (!mimeType.startsWith("image/")) {
    throw new Error("Attachment must be an image.");
  }
}

export async function createAttachment(input: CreateAttachmentInput): Promise<Attachment> {
  requireImage(input.mimeType);
  const createdAt = input.createdAt ?? nowTimestamp();
  const attachment: Attachment = {
    ...input,
    id: input.id ?? createEntityId(),
    ownerType: "moment",
    kind: "image",
    size: input.size ?? input.blob.size,
    width: input.width ?? null,
    height: input.height ?? null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  await db.attachments.add(attachment);
  return attachment;
}

export async function listMomentAttachments(
  momentId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Attachment[]> {
  const attachments = await db.attachments
    .where("[ownerType+ownerId]")
    .equals(["moment", momentId])
    .sortBy("createdAt");
  return options.includeDeleted
    ? attachments
    : attachments.filter((attachment) => attachment.deletedAt === null);
}

export async function listActiveMomentAttachmentsByMomentIds(
  momentIds: readonly string[],
): Promise<Map<string, Attachment[]>> {
  if (momentIds.length === 0) return new Map();
  const attachments = await db.attachments
    .where("ownerId")
    .anyOf([...momentIds])
    .toArray();
  const grouped = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    if (attachment.ownerType !== "moment" || attachment.deletedAt !== null) continue;
    const existing = grouped.get(attachment.ownerId) ?? [];
    existing.push(attachment);
    grouped.set(attachment.ownerId, existing);
  }
  for (const values of grouped.values()) {
    values.sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
  }
  return grouped;
}

export async function softDeleteAttachment(id: string, deletedAt = nowTimestamp()): Promise<Attachment> {
  const attachment = await db.attachments.get(id);
  if (!attachment) {
    throw new Error(`Attachment not found: ${id}`);
  }
  const deleted: Attachment = { ...attachment, deletedAt, updatedAt: deletedAt };
  await db.attachments.put(deleted);
  return deleted;
}
