import { normalizeLifeEventCandidate, equalLifeEventCandidates } from "../model/candidate";
import { assertProposalTransition } from "../model/proposal-state-machine";
import type {
  LifeEventCandidate,
  LifeEventMaterialization,
  LifeEventProposalStatus,
  ProposalReviewRequest,
  ProposalReviewResult,
} from "../model/types";
import type { LifeIntelligenceRepository } from "../repository/life-intelligence-repository";

export { ManualLifeEventConflictError } from "../model/errors";

function targetStatus(action: ProposalReviewRequest["action"]): LifeEventProposalStatus {
  if (action === "accept") return "accepted";
  if (action === "correct") return "corrected";
  return "rejected";
}

function createMaterialization(
  proposalId: string,
  source: LifeEventMaterialization["source"],
  eventId: string,
  origin: LifeEventMaterialization["origin"],
  value: LifeEventCandidate,
  reviewedAt: string,
): LifeEventMaterialization {
  const candidate = normalizeLifeEventCandidate(value);
  return {
    ...candidate,
    id: eventId,
    origin,
    source,
    extractionProposalId: proposalId,
    metadata: {},
    createdAt: reviewedAt,
    updatedAt: reviewedAt,
    deletedAt: null,
  };
}

function requestCandidate(request: ProposalReviewRequest, fallback: LifeEventCandidate): LifeEventCandidate {
  return request.action === "correct" ? request.correction : fallback;
}

async function idempotentResult(
  repository: LifeIntelligenceRepository,
  request: ProposalReviewRequest,
  proposalCandidate: LifeEventCandidate,
  proposalId: string,
): Promise<ProposalReviewResult> {
  if (request.action === "reject") return { proposal: (await repository.getProposal(proposalId))!, lifeEvent: null };
  const event = await repository.getMaterializedLifeEvent(proposalId);
  if (!event) throw new Error("Resolved proposal is missing its materialized LifeEvent.");
  if (!equalLifeEventCandidates(event, requestCandidate(request, proposalCandidate))) {
    throw new Error("Proposal was already resolved with different LifeEvent content.");
  }
  return { proposal: (await repository.getProposal(proposalId))!, lifeEvent: event };
}

export async function reviewLifeEventProposal(
  repository: LifeIntelligenceRepository,
  request: ProposalReviewRequest,
): Promise<ProposalReviewResult> {
  const proposal = await repository.getProposal(request.proposalId);
  if (!proposal) throw new Error("LifeEvent proposal does not exist.");
  const job = await repository.getJob(proposal.jobId);
  if (!job) throw new Error("LifeEvent proposal is missing its extraction job.");

  const nextStatus = targetStatus(request.action);
  assertProposalTransition(proposal.status, nextStatus);
  if (proposal.status === nextStatus) {
    return idempotentResult(repository, request, proposal.candidate, proposal.id);
  }

  const candidate = normalizeLifeEventCandidate(requestCandidate(request, proposal.candidate));
  let lifeEvent: LifeEventMaterialization | null = null;
  if (request.action !== "reject") {
    lifeEvent = createMaterialization(
      proposal.id,
      job.input.kind === "record" ? job.input.source : null,
      request.lifeEventId,
      request.action === "accept" ? "ai" : "manual",
      candidate,
      request.reviewedAt,
    );
  }

  return repository.commitProposalReview({
    expectedStatus: "pending",
    proposal: {
      ...proposal,
      status: nextStatus,
      correctedCandidate: request.action === "correct" ? candidate : null,
      materializedLifeEventId: lifeEvent?.id ?? null,
      updatedAt: request.reviewedAt,
      reviewedAt: request.reviewedAt,
    },
    lifeEvent,
  });
}
