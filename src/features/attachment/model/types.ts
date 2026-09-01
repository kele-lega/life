import type { EntityId, Timestamp } from "@/features/moment/model/types";

export type AttachmentOwnerType = "moment";
export type AttachmentKind = "image";

export interface Attachment {
  id: EntityId;
  ownerType: AttachmentOwnerType;
  ownerId: EntityId;
  kind: AttachmentKind;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

export interface CreateAttachmentInput {
  id?: EntityId;
  ownerId: EntityId;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  createdAt?: Timestamp;
}
