import type { EntityId, Timestamp } from "@/features/moment/model/types";

import type {
  LifeEventMaterialization,
  LifeEventProposal,
  LifeEventProposalSourceStatus,
  LifeExtractionInput,
  LifeExtractionJob,
  ProposalReviewResult,
} from "../model/types";

export interface CommitExtractionResultInput {
  job: LifeExtractionJob;
  proposals: readonly LifeEventProposal[];
}

export interface CommitExtractionResultResult {
  job: LifeExtractionJob;
  proposals: readonly LifeEventProposal[];
}

export interface CommitProposalReviewInput {
  expectedStatus: "pending";
  proposal: LifeEventProposal;
  lifeEvent: LifeEventMaterialization | null;
}

/**
 * Read/write persistence port for explicit extraction and review.
 * Implementations own all Job + Proposal and Proposal + Event transaction boundaries.
 */
export interface LifeIntelligenceRepository {
  getJob(id: EntityId): Promise<LifeExtractionJob | undefined>;
  findJobByRequestKey(requestKey: string): Promise<LifeExtractionJob | undefined>;
  getLatestJob(inputKind?: LifeExtractionInput["kind"]): Promise<LifeExtractionJob | undefined>;
  listProposalsByJob(jobId: EntityId): Promise<readonly LifeEventProposal[]>;
  commitExtractionResult(input: CommitExtractionResultInput): Promise<CommitExtractionResultResult>;

  getProposal(id: EntityId): Promise<LifeEventProposal | undefined>;
  getProposalSourceStatus(id: EntityId): Promise<LifeEventProposalSourceStatus | undefined>;
  getMaterializedLifeEvent(proposalId: EntityId): Promise<LifeEventMaterialization | undefined>;

  /** Atomically validates source/manual priority, inserts at most one Event, and resolves the Proposal. */
  commitProposalReview(input: CommitProposalReviewInput): Promise<ProposalReviewResult>;

  /** Explicit contract only; Phase 14.3 creates no automatic supersession process. */
  supersedePendingProposal(proposalId: EntityId, updatedAt: Timestamp): Promise<LifeEventProposal>;
}
