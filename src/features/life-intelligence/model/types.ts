import type { LifeEvent, LifeEventCategory, LifeEventSource } from "@/features/life-event/model/types";
import type { EntityId, Timestamp } from "@/features/moment/model/types";

export type LifeExtractionJobStatus = "queued" | "processing" | "succeeded" | "failed" | "superseded";
export type LifeEventProposalStatus = "pending" | "accepted" | "corrected" | "rejected" | "superseded";

export type LifeExtractionInput =
  | {
      kind: "scratch";
      text: string;
      contentFingerprint: string;
    }
  | {
      kind: "record";
      source: LifeEventSource;
    };

export type LifeEventProposalSourceStatus = "scratch" | "current" | "stale" | "missing";

export interface LifeExtractionJob {
  id: EntityId;
  requestKey: string;
  input: LifeExtractionInput;
  context: {
    occurredOn: string;
    timeZone: string;
  };
  extractor: {
    name: string;
    version: string;
    schemaVersion: number;
    provider: string | null;
    model: string | null;
  };
  status: LifeExtractionJobStatus;
  attemptCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
  lastErrorCode: string | null;
}

/** A validated interpretation candidate. It contains no presentation or provider fields. */
export interface LifeEventCandidate {
  category: LifeEventCategory;
  name: string;
  occurredOn: string;
  timeZone: string;
  timePrecision: LifeEvent["timePrecision"];
  startAt: Timestamp | null;
  endAt: Timestamp | null;
  durationSeconds: number | null;
}

export interface LifeEventEvidenceRange {
  start: number;
  end: number;
}

export interface LifeEventProposal {
  id: EntityId;
  jobId: EntityId;
  candidateKey: string;
  candidate: LifeEventCandidate;
  evidenceRanges: readonly LifeEventEvidenceRange[];
  status: LifeEventProposalStatus;
  correctedCandidate: LifeEventCandidate | null;
  materializedLifeEventId: EntityId | null;
  generatedAt: Timestamp;
  updatedAt: Timestamp;
  reviewedAt: Timestamp | null;
}

/**
 * Future persistence command produced by this contract layer.
 * It deliberately does not widen the currently stored LifeEvent schema.
 */
export type LifeEventMaterialization = LifeEvent & { extractionProposalId: EntityId };

export type ProposalReviewRequest =
  | {
      action: "accept";
      proposalId: EntityId;
      lifeEventId: EntityId;
      reviewedAt: Timestamp;
    }
  | {
      action: "correct";
      proposalId: EntityId;
      lifeEventId: EntityId;
      reviewedAt: Timestamp;
      correction: LifeEventCandidate;
    }
  | {
      action: "reject";
      proposalId: EntityId;
      reviewedAt: Timestamp;
    };

export interface ProposalReviewResult {
  proposal: LifeEventProposal;
  lifeEvent: LifeEventMaterialization | null;
}

export interface LifeExtractionRequest {
  input:
    | { kind: "scratch" }
    | { kind: "record"; source: LifeEventSource };
  text: string;
  context: {
    occurredOn: string;
    timeZone: string;
  };
}

export interface ExtractedLifeEventCandidate {
  candidateKey: string;
  candidate: LifeEventCandidate;
  evidenceRanges: readonly LifeEventEvidenceRange[];
}

export interface LifeExtractionResult {
  candidates: readonly ExtractedLifeEventCandidate[];
}
