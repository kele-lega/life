export type { LifeEventExtractor } from "./extractor/life-event-extractor";
export { FakeLifeEventExtractor } from "./extractor/fake-life-event-extractor";
export { ManualLifeEventConflictError, reviewLifeEventProposal } from "./application/review-proposal";
export { runLifeExtraction } from "./application/run-life-extraction";
export { LifeEventProposalSourceError } from "./model/errors";
export { DexieLifeIntelligenceRepository, lifeIntelligenceRepository } from "./repository/dexie-life-intelligence-repository";
export { InvalidProposalTransitionError, assertProposalTransition } from "./model/proposal-state-machine";
export type {
  ExtractedLifeEventCandidate,
  LifeEventCandidate,
  LifeEventMaterialization,
  LifeEventProposal,
  LifeEventProposalSourceStatus,
  LifeEventProposalStatus,
  LifeExtractionInput,
  LifeExtractionJob,
  LifeExtractionJobStatus,
  LifeExtractionRequest,
  LifeExtractionResult,
  ProposalReviewRequest,
  ProposalReviewResult,
} from "./model/types";
export type {
  CommitExtractionResultInput,
  CommitExtractionResultResult,
  CommitProposalReviewInput,
  LifeIntelligenceRepository,
} from "./repository/life-intelligence-repository";
