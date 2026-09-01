import type { CreateAttachmentInput } from "@/features/attachment/model/types";

export type EntityId = string;
export type Timestamp = string;

export interface LocationMetadata {
  city: string | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Moment {
  id: EntityId;
  originalText: string;
  isFavorite: boolean;
  location: LocationMetadata | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

export interface MomentAppend {
  id: EntityId;
  momentId: EntityId;
  text: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

export interface CreateMomentInput {
  originalText: string;
  id?: EntityId;
  createdAt?: Timestamp;
  location?: LocationMetadata | null;
}

export interface CreateMomentAppendInput {
  text: string;
  id?: EntityId;
  createdAt?: Timestamp;
}

export interface UpdateMomentMetadataInput {
  isFavorite?: boolean;
  location?: LocationMetadata | null;
}

export interface CreateMomentWithAttachmentsInput extends CreateMomentInput {
  attachments: readonly Omit<CreateAttachmentInput, "ownerId">[];
}
