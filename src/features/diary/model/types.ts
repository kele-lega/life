import type { EntityId, LocationMetadata, Timestamp } from "@/features/moment/model/types";

export interface Diary {
  id: EntityId;
  title: string;
  body: string;
  isFavorite: boolean;
  location: LocationMetadata | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

export interface CreateDiaryInput {
  title: string;
  body: string;
  id?: EntityId;
  createdAt?: Timestamp;
  location?: LocationMetadata | null;
}
