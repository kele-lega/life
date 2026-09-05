import { describe, expect, it } from "vitest";

import type { EntityId } from "@/features/moment/model/types";

import { ManualLifeEventConflictError } from "../model/errors";
import type {
  LifeEventMaterialization,
  LifeEventProposal,
  LifeExtractionJob,
  ProposalReviewResult,
} from "../model/types";
import type {
  CommitExtractionResultInput,
  CommitProposalReviewInput,
  LifeIntelligenceRepository,
} from "../repository/life-intelligence-repository";
import { reviewLifeEventProposal } from "./review-proposal";

const ids = {
  job: "10000000-0000-4000-8000-000000000001",
  proposal: "10000000-0000-4000-8000-000000000002",
  event: "10000000-0000-4000-8000-000000000004",
};
const reviewedAt = "2026-09-04T10:00:00.000Z";

const candidate = {
  category: "learning" as const,
  name: "阅读",
  occurredOn: "2026-09-04",
  timeZone: "Asia/Shanghai",
  timePrecision: "day" as const,
  startAt: null,
  endAt: null,
  durationSeconds: 2_400,
};

const job: LifeExtractionJob = {
  id: ids.job,
  requestKey: "sha256:life-extraction-request-v1:fixture",
  input: { kind: "scratch", text: "看书40分钟", contentFingerprint: "sha256:text-v1:fixture" },
  context: { occurredOn: "2026-09-04", timeZone: "Asia/Shanghai" },
  extractor: { name: "fake", version: "1", schemaVersion: 1, provider: null, model: null },
  status: "succeeded",
  attemptCount: 1,
  createdAt: "2026-09-04T09:59:00.000Z",
  updatedAt: "2026-09-04T09:59:00.000Z",
  completedAt: "2026-09-04T09:59:00.000Z",
  lastErrorCode: null,
};

function proposal(): LifeEventProposal {
  return {
    id: ids.proposal,
    jobId: ids.job,
    candidateKey: "learning:reading:0",
    candidate,
    evidenceRanges: [{ start: 0, end: 6 }],
    status: "pending",
    correctedCandidate: null,
    materializedLifeEventId: null,
    generatedAt: "2026-09-04T09:59:00.000Z",
    updatedAt: "2026-09-04T09:59:00.000Z",
    reviewedAt: null,
  };
}

class MemoryContractRepository implements LifeIntelligenceRepository {
  readonly jobs = new Map<EntityId, LifeExtractionJob>([[job.id, job]]);
  readonly proposals = new Map<EntityId, LifeEventProposal>([[ids.proposal, proposal()]]);
  readonly events = new Map<EntityId, LifeEventMaterialization>();
  conflict = false;

  async getJob(id: EntityId) { return this.jobs.get(id); }
  async findJobByRequestKey(requestKey: string) { return [...this.jobs.values()].find((value) => value.requestKey === requestKey); }
  async getLatestJob() { return [...this.jobs.values()].at(-1); }
  async listProposalsByJob(jobId: EntityId) { return [...this.proposals.values()].filter((value) => value.jobId === jobId); }
  async commitExtractionResult(input: CommitExtractionResultInput) { return input; }
  async getProposal(id: EntityId) { return this.proposals.get(id); }
  async getProposalSourceStatus() { return "scratch" as const; }
  async getMaterializedLifeEvent(proposalId: EntityId) { return this.events.get(proposalId); }
  async commitProposalReview(input: CommitProposalReviewInput): Promise<ProposalReviewResult> {
    const current = this.proposals.get(input.proposal.id);
    if (!current || current.status !== "pending") throw new Error("Concurrent proposal review.");
    if (this.conflict && input.lifeEvent) throw new ManualLifeEventConflictError();
    this.proposals.set(input.proposal.id, input.proposal);
    if (input.lifeEvent) this.events.set(input.proposal.id, input.lifeEvent);
    return { proposal: input.proposal, lifeEvent: input.lifeEvent };
  }
  async supersedePendingProposal(proposalId: EntityId, updatedAt: string) {
    const current = this.proposals.get(proposalId)!;
    const next = { ...current, status: "superseded" as const, updatedAt };
    this.proposals.set(proposalId, next);
    return next;
  }
}

describe("LifeEvent proposal review contract", () => {
  it("accepts one Proposal as one AI materialization and retries idempotently", async () => {
    const repository = new MemoryContractRepository();
    const request = { action: "accept" as const, proposalId: ids.proposal, lifeEventId: ids.event, reviewedAt };
    const first = await reviewLifeEventProposal(repository, request);
    const retry = await reviewLifeEventProposal(repository, { ...request, lifeEventId: "another-retry-id" });

    expect(retry).toEqual(first);
    expect(first).toMatchObject({
      proposal: { status: "accepted", correctedCandidate: null, materializedLifeEventId: ids.event },
      lifeEvent: { origin: "ai", extractionProposalId: ids.proposal, source: null },
    });
    expect(repository.events).toHaveLength(1);
  });

  it("corrects a pending Proposal into a manual materialization", async () => {
    const repository = new MemoryContractRepository();
    const correction = { ...candidate, name: "技术阅读", durationSeconds: 3_000 };
    const result = await reviewLifeEventProposal(repository, {
      action: "correct",
      proposalId: ids.proposal,
      lifeEventId: ids.event,
      reviewedAt,
      correction,
    });

    expect(result).toMatchObject({
      proposal: { status: "corrected", correctedCandidate: correction },
      lifeEvent: { origin: "manual", name: "技术阅读", durationSeconds: 3_000 },
    });
  });

  it("rejects without a LifeEvent", async () => {
    const repository = new MemoryContractRepository();
    const result = await reviewLifeEventProposal(repository, { action: "reject", proposalId: ids.proposal, reviewedAt });
    expect(result).toMatchObject({ proposal: { status: "rejected" }, lifeEvent: null });
    expect(repository.events).toHaveLength(0);
  });

  it("leaves the Proposal pending when persistence detects a manual conflict", async () => {
    const repository = new MemoryContractRepository();
    repository.conflict = true;
    await expect(reviewLifeEventProposal(repository, {
      action: "accept",
      proposalId: ids.proposal,
      lifeEventId: ids.event,
      reviewedAt,
    })).rejects.toBeInstanceOf(ManualLifeEventConflictError);
    expect((await repository.getProposal(ids.proposal))?.status).toBe("pending");
  });
});
