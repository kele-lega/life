import { createEntityId } from "@/lib/identity/create-entity-id";
import { nowTimestamp } from "@/lib/time/timestamps";

import type { LifeEventExtractor } from "../extractor/life-event-extractor";
import { normalizeLifeEventCandidate } from "../model/candidate";
import { prepareLifeExtractionRequest } from "../model/extraction-request";
import type { LifeEventProposal, LifeExtractionJob, LifeExtractionRequest } from "../model/types";
import type { LifeIntelligenceRepository } from "../repository/life-intelligence-repository";

export interface RunLifeExtractionResult {
  job: LifeExtractionJob;
  proposals: readonly LifeEventProposal[];
}

export interface RunLifeExtractionOptions {
  createId?: () => string;
  now?: () => string;
}

/** Direct, user-triggered contract execution. It creates no queue or automatic work. */
export async function runLifeExtraction(
  repository: LifeIntelligenceRepository,
  extractor: LifeEventExtractor,
  request: LifeExtractionRequest,
  options: RunLifeExtractionOptions = {},
): Promise<RunLifeExtractionResult> {
  const createId = options.createId ?? createEntityId;
  const generatedAt = (options.now ?? nowTimestamp)();
  const extractorDescriptor: LifeExtractionJob["extractor"] = {
    name: extractor.name,
    version: extractor.version,
    schemaVersion: extractor.schemaVersion,
    provider: null,
    model: null,
  };
  const prepared = await prepareLifeExtractionRequest(request, extractorDescriptor);
  const existing = await repository.findJobByRequestKey(prepared.requestKey);
  if (existing) {
    return { job: existing, proposals: await repository.listProposalsByJob(existing.id) };
  }

  const result = await extractor.extract(request);
  const job: LifeExtractionJob = {
    id: createId(),
    requestKey: prepared.requestKey,
    input: prepared.input,
    context: request.context,
    extractor: extractorDescriptor,
    status: "succeeded",
    attemptCount: 1,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    completedAt: generatedAt,
    lastErrorCode: null,
  };
  const candidateKeys = new Set<string>();
  const proposals = result.candidates.map((extracted): LifeEventProposal => {
    if (!extracted.candidateKey.trim()) throw new Error("Proposal candidate identity is required.");
    if (candidateKeys.has(extracted.candidateKey)) {
      throw new Error("Extractor returned a duplicate candidate key.");
    }
    candidateKeys.add(extracted.candidateKey);
    if (extracted.evidenceRanges.some(({ end }) => end > request.text.length)) {
      throw new Error("Extractor evidence range exceeds the source text.");
    }
    if (extracted.evidenceRanges.some(({ start, end }) =>
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start)) {
      throw new Error("Proposal evidence ranges must be increasing non-negative integer offsets.");
    }
    return {
      id: createId(),
      jobId: job.id,
      candidateKey: extracted.candidateKey,
      candidate: normalizeLifeEventCandidate(extracted.candidate),
      evidenceRanges: extracted.evidenceRanges,
      status: "pending",
      correctedCandidate: null,
      materializedLifeEventId: null,
      generatedAt,
      updatedAt: generatedAt,
      reviewedAt: null,
    };
  });

  return repository.commitExtractionResult({ job, proposals });
}
