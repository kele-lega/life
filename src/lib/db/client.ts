import Dexie, { type Table } from "dexie";

import type { Attachment } from "@/features/attachment/model/types";
import type { Diary } from "@/features/diary/model/types";
import type { LifeEvent } from "@/features/life-event/model/types";
import type { LifeEventProposal, LifeExtractionJob } from "@/features/life-intelligence/model/types";
import type { Moment, MomentAppend } from "@/features/moment/model/types";

export class LifeDatabase extends Dexie {
  moments!: Table<Moment, string>;
  momentAppends!: Table<MomentAppend, string>;
  attachments!: Table<Attachment, string>;
  diaries!: Table<Diary, string>;
  lifeEvents!: Table<LifeEvent, string>;
  lifeExtractionJobs!: Table<LifeExtractionJob, string>;
  lifeEventProposals!: Table<LifeEventProposal, string>;

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
    // Dexie carries unchanged stores forward; only add the new independent table.
    this.version(5).stores({
      lifeEvents: "id, [occurredOn+id], [source.type+source.id]",
    });
    // Existing records remain byte-for-byte unchanged. Missing optional keys are
    // intentionally absent from IndexedDB's sparse indexes.
    this.version(6).stores({
      lifeEvents: "id, [occurredOn+id], [source.type+source.id], &extractionProposalId",
      lifeExtractionJobs: "id, &requestKey, createdAt, [input.source.type+input.source.id]",
      lifeEventProposals: "id, jobId, &[jobId+candidateKey]",
    });
  }
}

export const db = new LifeDatabase();
