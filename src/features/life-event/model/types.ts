import type { EntityId, Timestamp } from "@/features/moment/model/types";

export type LifeEventCategory = "activity" | "learning" | "creation" | "place";
export type LifeEventSourceType = "moment" | "momentAppend" | "diary";
export interface LifeEventSourceRef { type: LifeEventSourceType; id: EntityId }
export interface LifeEventSource extends LifeEventSourceRef { contentFingerprint: string }

export interface LifeEvent {
  id: EntityId;
  origin: "manual" | "ai";
  /** Present only when review of a LifeEventProposal created this event. */
  extractionProposalId?: EntityId;
  source: LifeEventSource | null;
  category: LifeEventCategory;
  name: string;
  occurredOn: string;
  timeZone: string;
  timePrecision: "day" | "time" | "interval";
  startAt: Timestamp | null;
  endAt: Timestamp | null;
  durationSeconds: number | null;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

export interface CreateManualLifeEventInput {
  /** Reuse the same UUID and payload when retrying one submission. */
  id?: EntityId;
  source?: LifeEventSourceRef | null;
  category: LifeEventCategory;
  name: string;
  occurredOn: string;
  timeZone: string;
  timePrecision: LifeEvent["timePrecision"];
  startAt?: Timestamp | null;
  endAt?: Timestamp | null;
  durationSeconds?: number | null;
  metadata?: Record<string, unknown>;
}

/** Read-only status; never stored on the event or the original. */
export interface LifeEventView extends LifeEvent {
  sourceStatus: "unlinked" | "current" | "stale";
}
export interface LifeEventCursor { occurredOn: string; id: EntityId }
export interface LifeEventPage {
  items: LifeEventView[];
  nextCursor: LifeEventCursor | null;
  hasMore: boolean;
}
