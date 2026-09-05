import { db } from "@/lib/db/client";
import { assertTimestamp } from "@/lib/time/timestamps";
import type { LifeEvent, LifeEventSource } from "@/features/life-event/model/types";
import { assertSource, canonicalJson, normalizeInput } from "@/features/life-event/model/validation";
import {
  fingerprintLifeEventText,
  lifeEventSourceKey,
  readLifeEventSourceFingerprints,
} from "@/features/life-event/repository/source-fingerprint";

import { equalLifeEventCandidates, normalizeLifeEventCandidate } from "../model/candidate";
import { LifeEventProposalSourceError, ManualLifeEventConflictError } from "../model/errors";
import { MAX_SCRATCH_INPUT_BYTES } from "../model/extraction-request";
import { assertProposalTransition } from "../model/proposal-state-machine";
import type {
  LifeEventMaterialization,
  LifeEventProposal,
  LifeEventProposalSourceStatus,
  LifeExtractionInput,
  LifeExtractionJob,
  ProposalReviewResult,
} from "../model/types";
import type {
  CommitExtractionResultInput,
  CommitExtractionResultResult,
  CommitProposalReviewInput,
  LifeIntelligenceRepository,
} from "./life-intelligence-repository";

const extractionTables = () => [db.lifeExtractionJobs, db.lifeEventProposals];
const materializationTables = () => [
  db.lifeExtractionJobs,
  db.lifeEventProposals,
  db.lifeEvents,
  db.moments,
  db.momentAppends,
  db.diaries,
];

function sameRequest(left: LifeExtractionJob, right: LifeExtractionJob): boolean {
  return canonicalJson({ input: left.input, context: left.context, extractor: left.extractor }) ===
    canonicalJson({ input: right.input, context: right.context, extractor: right.extractor });
}

function sameProposalContent(left: LifeEventProposal, right: LifeEventProposal): boolean {
  return left.id === right.id &&
    left.jobId === right.jobId &&
    left.candidateKey === right.candidateKey &&
    canonicalJson(left.evidenceRanges) === canonicalJson(right.evidenceRanges) &&
    equalLifeEventCandidates(left.candidate, right.candidate);
}

function orderProposals(proposals: LifeEventProposal[]): LifeEventProposal[] {
  return proposals.sort((left, right) =>
    (left.evidenceRanges[0]?.start ?? Number.MAX_SAFE_INTEGER) -
      (right.evidenceRanges[0]?.start ?? Number.MAX_SAFE_INTEGER) ||
    left.candidateKey.localeCompare(right.candidateKey) ||
    left.id.localeCompare(right.id));
}

function assertNewProposal(proposal: LifeEventProposal, jobId: string): LifeEventProposal {
  if (!proposal.id || proposal.jobId !== jobId || !proposal.candidateKey.trim()) {
    throw new Error("Proposal identity is invalid.");
  }
  if (proposal.status !== "pending" || proposal.correctedCandidate !== null ||
    proposal.materializedLifeEventId !== null || proposal.reviewedAt !== null) {
    throw new Error("A new LifeEvent proposal must be pending and unresolved.");
  }
  assertTimestamp(proposal.generatedAt);
  assertTimestamp(proposal.updatedAt);
  if (proposal.evidenceRanges.some(({ start, end }) =>
    !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start)) {
    throw new Error("Proposal evidence ranges must be increasing non-negative integer offsets.");
  }
  return { ...proposal, candidate: normalizeLifeEventCandidate(proposal.candidate) };
}

async function assertJob(job: LifeExtractionJob): Promise<void> {
  if (!job.id || !job.requestKey.startsWith("sha256:life-extraction-request-v1:")) {
    throw new Error("Extraction job identity is invalid.");
  }
  if (job.status !== "succeeded" || job.attemptCount !== 1 || job.lastErrorCode !== null || job.completedAt === null) {
    throw new Error("Explicit extraction results must contain one completed successful attempt.");
  }
  if (job.extractor.provider !== null || job.extractor.model !== null) {
    throw new Error("Phase 14.3 does not persist real AI provider details.");
  }
  assertTimestamp(job.createdAt);
  assertTimestamp(job.updatedAt);
  assertTimestamp(job.completedAt);
  if (job.input.kind === "scratch") {
    if (!job.input.text.trim() || new TextEncoder().encode(job.input.text).byteLength > MAX_SCRATCH_INPUT_BYTES) {
      throw new Error("Scratch extraction text must be present and no larger than 64 KiB.");
    }
    if (job.input.contentFingerprint !== await fingerprintLifeEventText([job.input.text])) {
      throw new Error("Scratch extraction fingerprint does not match its text.");
    }
  } else {
    assertSource(job.input.source);
    if (!job.input.source.contentFingerprint.trim()) throw new Error("Record source fingerprint is required.");
  }
}

async function sourceStatus(job: LifeExtractionJob): Promise<LifeEventProposalSourceStatus> {
  if (job.input.kind === "scratch") return "scratch";
  const fingerprints = await readLifeEventSourceFingerprints([job.input.source]);
  const current = fingerprints.get(lifeEventSourceKey(job.input.source));
  if (!current) return "missing";
  return current === job.input.source.contentFingerprint ? "current" : "stale";
}

function eventCandidate(event: LifeEvent) {
  return {
    category: event.category,
    name: event.name,
    occurredOn: event.occurredOn,
    timeZone: event.timeZone,
    timePrecision: event.timePrecision,
    startAt: event.startAt,
    endAt: event.endAt,
    durationSeconds: event.durationSeconds,
  };
}

async function hasCurrentManualConflict(source: LifeEventSource | null, event: LifeEvent): Promise<boolean> {
  if (!source) return false;
  const candidates = await db.lifeEvents
    .where("[source.type+source.id]")
    .equals([source.type, source.id])
    .toArray();
  return candidates.some((existing) =>
    existing.origin === "manual" &&
    existing.deletedAt === null &&
    existing.source?.contentFingerprint === source.contentFingerprint &&
    equalLifeEventCandidates(eventCandidate(existing), eventCandidate(event)));
}

function expectedSource(input: LifeExtractionInput): LifeEventSource | null {
  return input.kind === "record" ? input.source : null;
}

function assertEventMatchesReview(
  current: LifeEventProposal,
  proposed: LifeEventProposal,
  event: LifeEventMaterialization | null,
  source: LifeEventSource | null,
): void {
  const status = proposed.status;
  if (!sameProposalContent(current, proposed)) throw new Error("Proposal immutable content changed during review.");
  if (!["accepted", "corrected", "rejected"].includes(status)) {
    throw new Error("Review must produce an accepted, corrected or rejected terminal state.");
  }
  if (status === "rejected") {
    if (event !== null || proposed.materializedLifeEventId !== null || proposed.correctedCandidate !== null) {
      throw new Error("Rejected proposal cannot create a LifeEvent.");
    }
    return;
  }
  if (!event || event.id !== proposed.materializedLifeEventId || event.extractionProposalId !== current.id) {
    throw new Error("Resolved proposal must reference exactly one materialized LifeEvent.");
  }
  if (event.deletedAt !== null || canonicalJson(event.metadata) !== "{}") {
    throw new Error("Reviewed LifeEvent must be active and contain no extraction metadata.");
  }
  if (canonicalJson(event.source) !== canonicalJson(source)) throw new Error("Materialized LifeEvent source is invalid.");
  normalizeInput({ ...eventCandidate(event), source: source ? { type: source.type, id: source.id } : null, metadata: event.metadata });
  if (status === "accepted") {
    if (event.origin !== "ai" || proposed.correctedCandidate !== null ||
      !equalLifeEventCandidates(eventCandidate(event), current.candidate)) {
      throw new Error("Accepted proposal must preserve its AI candidate.");
    }
  } else if (event.origin !== "manual" || !proposed.correctedCandidate ||
    !equalLifeEventCandidates(eventCandidate(event), proposed.correctedCandidate)) {
    throw new Error("Corrected proposal must materialize the user's manual correction.");
  }
}

async function idempotentTerminalResult(
  current: LifeEventProposal,
  requested: LifeEventProposal,
): Promise<ProposalReviewResult> {
  if (current.status !== requested.status) {
    assertProposalTransition(current.status, requested.status);
  }
  if (current.status === "rejected") return { proposal: current, lifeEvent: null };
  const event = await db.lifeEvents.where("extractionProposalId").equals(current.id).first();
  if (!event || event.id !== current.materializedLifeEventId) {
    throw new Error("Resolved proposal is missing its materialized LifeEvent.");
  }
  if (current.status === "corrected") {
    if (!current.correctedCandidate || !requested.correctedCandidate ||
      !equalLifeEventCandidates(current.correctedCandidate, requested.correctedCandidate)) {
      throw new Error("Proposal was already corrected with different LifeEvent content.");
    }
  }
  if (!equalLifeEventCandidates(eventCandidate(event), current.correctedCandidate ?? current.candidate)) {
    throw new Error("Resolved proposal and materialized LifeEvent disagree.");
  }
  return { proposal: current, lifeEvent: event as LifeEventMaterialization };
}

export class DexieLifeIntelligenceRepository implements LifeIntelligenceRepository {
  async getJob(id: string): Promise<LifeExtractionJob | undefined> {
    return db.lifeExtractionJobs.get(id);
  }

  async findJobByRequestKey(requestKey: string): Promise<LifeExtractionJob | undefined> {
    return db.lifeExtractionJobs.where("requestKey").equals(requestKey).first();
  }

  async getLatestJob(inputKind?: LifeExtractionInput["kind"]): Promise<LifeExtractionJob | undefined> {
    const newest = db.lifeExtractionJobs.orderBy("createdAt").reverse();
    return inputKind ? newest.filter((job) => job.input.kind === inputKind).first() : newest.first();
  }

  async listProposalsByJob(jobId: string): Promise<readonly LifeEventProposal[]> {
    return orderProposals(await db.lifeEventProposals.where("jobId").equals(jobId).toArray());
  }

  async commitExtractionResult(input: CommitExtractionResultInput): Promise<CommitExtractionResultResult> {
    await assertJob(input.job);
    const proposals = input.proposals.map((proposal) => assertNewProposal(proposal, input.job.id));
    if (new Set(proposals.map(({ id }) => id)).size !== proposals.length ||
      new Set(proposals.map(({ candidateKey }) => candidateKey)).size !== proposals.length) {
      throw new Error("Extraction result contains duplicate proposal identity.");
    }
    if (input.job.input.kind === "scratch") {
      const sourceLength = input.job.input.text.length;
      if (proposals.some((proposal) => proposal.evidenceRanges.some(({ end }) => end > sourceLength))) {
        throw new Error("Proposal evidence range exceeds the scratch text.");
      }
    }

    return db.transaction("rw", extractionTables(), async () => {
      const existingRequest = await db.lifeExtractionJobs.where("requestKey").equals(input.job.requestKey).first();
      if (existingRequest) {
        if (!sameRequest(existingRequest, input.job)) {
          throw new Error("Extraction request key is already bound to different content.");
        }
        return {
          job: existingRequest,
          proposals: orderProposals(await db.lifeEventProposals.where("jobId").equals(existingRequest.id).toArray()),
        };
      }
      if (await db.lifeExtractionJobs.get(input.job.id)) throw new Error("Extraction job ID already exists.");
      const existingProposals = await db.lifeEventProposals.bulkGet(proposals.map(({ id }) => id));
      if (existingProposals.some(Boolean)) throw new Error("LifeEvent proposal ID already exists.");
      await db.lifeExtractionJobs.add(input.job);
      await db.lifeEventProposals.bulkAdd(proposals);
      return { job: input.job, proposals };
    });
  }

  async getProposal(id: string): Promise<LifeEventProposal | undefined> {
    return db.lifeEventProposals.get(id);
  }

  async getProposalSourceStatus(id: string): Promise<LifeEventProposalSourceStatus | undefined> {
    return db.transaction("r", materializationTables(), async () => {
      const proposal = await db.lifeEventProposals.get(id);
      if (!proposal) return undefined;
      const job = await db.lifeExtractionJobs.get(proposal.jobId);
      if (!job) throw new Error("LifeEvent proposal is missing its extraction job.");
      return sourceStatus(job);
    });
  }

  async getMaterializedLifeEvent(proposalId: string): Promise<LifeEventMaterialization | undefined> {
    const event = await db.lifeEvents.where("extractionProposalId").equals(proposalId).first();
    return event as LifeEventMaterialization | undefined;
  }

  async commitProposalReview(input: CommitProposalReviewInput): Promise<ProposalReviewResult> {
    const requestedStatus = input.proposal.status;
    assertProposalTransition(input.expectedStatus, requestedStatus);
    assertTimestamp(input.proposal.updatedAt);
    if (input.proposal.reviewedAt !== null) assertTimestamp(input.proposal.reviewedAt);

    if (requestedStatus === "rejected") {
      return db.transaction("rw", db.lifeEventProposals, async () => {
        const current = await db.lifeEventProposals.get(input.proposal.id);
        if (!current) throw new Error("LifeEvent proposal does not exist.");
        if (current.status !== "pending") return idempotentTerminalResult(current, input.proposal);
        assertEventMatchesReview(current, input.proposal, input.lifeEvent, null);
        const resolved = { ...current, status: "rejected" as const, updatedAt: input.proposal.updatedAt, reviewedAt: input.proposal.reviewedAt };
        await db.lifeEventProposals.put(resolved);
        return { proposal: resolved, lifeEvent: null };
      });
    }

    return db.transaction("rw", materializationTables(), async () => {
      const current = await db.lifeEventProposals.get(input.proposal.id);
      if (!current) throw new Error("LifeEvent proposal does not exist.");
      if (current.status !== "pending") return idempotentTerminalResult(current, input.proposal);
      const job = await db.lifeExtractionJobs.get(current.jobId);
      if (!job) throw new Error("LifeEvent proposal is missing its extraction job.");
      const status = await sourceStatus(job);
      if (status === "stale" || status === "missing") throw new LifeEventProposalSourceError(status);
      const source = expectedSource(job.input);
      assertEventMatchesReview(current, input.proposal, input.lifeEvent, source);
      const event = input.lifeEvent!;
      if (await db.lifeEvents.get(event.id)) throw new Error("LifeEvent ID already exists; review is insert-only.");
      if (await hasCurrentManualConflict(source, event)) throw new ManualLifeEventConflictError();

      const existingMaterialization = await db.lifeEvents.where("extractionProposalId").equals(current.id).first();
      if (existingMaterialization) throw new Error("LifeEvent proposal has already been materialized.");
      await db.lifeEvents.add(event);
      const resolved: LifeEventProposal = {
        ...current,
        status: input.proposal.status,
        correctedCandidate: input.proposal.correctedCandidate,
        materializedLifeEventId: event.id,
        updatedAt: input.proposal.updatedAt,
        reviewedAt: input.proposal.reviewedAt,
      };
      await db.lifeEventProposals.put(resolved);
      return { proposal: resolved, lifeEvent: event };
    });
  }

  async supersedePendingProposal(proposalId: string, updatedAt: string): Promise<LifeEventProposal> {
    assertTimestamp(updatedAt);
    return db.transaction("rw", db.lifeEventProposals, async () => {
      const proposal = await db.lifeEventProposals.get(proposalId);
      if (!proposal) throw new Error("LifeEvent proposal does not exist.");
      assertProposalTransition(proposal.status, "superseded");
      if (proposal.status === "superseded") return proposal;
      const superseded: LifeEventProposal = { ...proposal, status: "superseded", updatedAt };
      await db.lifeEventProposals.put(superseded);
      return superseded;
    });
  }
}

export const lifeIntelligenceRepository = new DexieLifeIntelligenceRepository();
