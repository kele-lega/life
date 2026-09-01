import Dexie, { type Table } from "dexie";

import type { Attachment } from "@/features/attachment/model/types";
import type { Diary } from "@/features/diary/model/types";
import type { Moment, MomentAppend } from "@/features/moment/model/types";

export class LifeDatabase extends Dexie {
  moments!: Table<Moment, string>;
  momentAppends!: Table<MomentAppend, string>;
  attachments!: Table<Attachment, string>;
  diaries!: Table<Diary, string>;

  constructor(name = "life") {
    super(name);

    this.version(1).stores({});
    this.version(2).stores({
      moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
      momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
    });
    this.version(3).stores({
      moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
      momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
      attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt",
    });
    this.version(4).stores({
      moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
      momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
      attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt",
      diaries: "id, createdAt, updatedAt, deletedAt, isFavorite",
    });
  }
}

export const db = new LifeDatabase();
