import { normalizeLifeEventCandidate } from "@/features/life-intelligence/model/candidate";
import type { LifeEventCandidate } from "@/features/life-intelligence/model/types";
import { encodeJson, ensure, isId, object, string, TABLE_NAMES, type BackupRecords, type BackupRow } from "./format";

const instant = (value: unknown) => ensure(typeof value === "string" && Number.isFinite(Date.parse(value)));
const nullableInstant = (value: unknown) => { if (value !== null) instant(value); };
function lifecycle(row: BackupRow) { instant(row.createdAt); instant(row.updatedAt); nullableInstant(row.deletedAt); }
function location(value: unknown) {
  if (value === null) return;
  object(value);
  for (const key of ["city", "placeName"]) ensure(value[key] === null || typeof value[key] === "string");
  for (const key of ["latitude", "longitude"]) ensure(value[key] === null || (typeof value[key] === "number" && Number.isFinite(value[key])));
}
function source(value: unknown) {
  object(value);
  ensure(["moment", "momentAppend", "diary"].includes(String(value.type)) && isId(value.id) && typeof value.contentFingerprint === "string");
}
function candidate(value: unknown) {
  object(value);
  const normalized = normalizeLifeEventCandidate(value as unknown as LifeEventCandidate);
  for (const [key, field] of Object.entries(normalized)) ensure(value[key] === field, "candidate_contract");
}

/** Validate stored state, not commands. Stale/missing sources remain historical state. */
export function validateRecords(records: BackupRecords): string[] {
  const indexes = Object.fromEntries(TABLE_NAMES.map((name) => [name, new Map<string, BackupRow>()])) as Record<keyof BackupRecords, Map<string, BackupRow>>;
  const warnings = new Set<string>();
  for (const name of TABLE_NAMES) {
    for (const row of records[name]) {
      object(row); ensure(isId(row.id) && !indexes[name].has(row.id), "duplicate_id");
      encodeJson(row);
      indexes[name].set(row.id, row);
    }
  }
  for (const row of records.moments) { lifecycle(row); string(row.originalText); ensure(typeof row.isFavorite === "boolean"); location(row.location); }
  for (const row of records.diaries) { lifecycle(row); string(row.title); string(row.body); ensure(typeof row.isFavorite === "boolean"); location(row.location); }
  for (const row of records.momentAppends) {
    lifecycle(row); string(row.text); ensure(isId(row.momentId));
    if (!indexes.moments.has(row.momentId)) warnings.add("missing_moment_parent");
  }
  for (const row of records.attachments) {
    lifecycle(row); ensure(row.ownerType === "moment" && row.kind === "image" && isId(row.ownerId));
    string(row.fileName); string(row.mimeType);
    ensure(typeof row.size === "number" && Number.isFinite(row.size) && row.size >= 0);
    for (const key of ["width", "height"]) ensure(row[key] === null || (typeof row[key] === "number" && Number.isFinite(row[key])));
    ensure(!Object.hasOwn(row, "blob"));
    if (!indexes.moments.has(row.ownerId)) warnings.add("missing_moment_parent");
  }
  const requestKeys = new Set<string>();
  for (const row of records.lifeExtractionJobs) {
    ensure(isId(row.requestKey) && !requestKeys.has(row.requestKey), "duplicate_request_key"); requestKeys.add(row.requestKey);
    instant(row.createdAt); instant(row.updatedAt); nullableInstant(row.completedAt);
    ensure(["queued", "processing", "succeeded", "failed", "superseded"].includes(String(row.status)));
    ensure(Number.isSafeInteger(row.attemptCount) && Number(row.attemptCount) >= 0);
    ensure(row.lastErrorCode === null || typeof row.lastErrorCode === "string");
    object(row.context); string(row.context.occurredOn); string(row.context.timeZone);
    object(row.extractor);
    for (const field of ["name", "version"]) string(row.extractor[field]);
    ensure(Number.isSafeInteger(row.extractor.schemaVersion));
    for (const field of ["provider", "model"]) ensure(row.extractor[field] === null || typeof row.extractor[field] === "string");
    object(row.input);
    if (row.input.kind === "scratch") { string(row.input.text); string(row.input.contentFingerprint); }
    else { ensure(row.input.kind === "record"); source(row.input.source); }
  }
  const materialized = new Set<string>();
  for (const row of records.lifeEvents) {
    lifecycle(row); candidate(row); object(row.metadata);
    ensure(row.origin === "manual" || row.origin === "ai");
    if (row.source !== null) source(row.source);
    if (Object.hasOwn(row, "extractionProposalId")) {
      ensure(isId(row.extractionProposalId) && !materialized.has(row.extractionProposalId), "duplicate_materialization");
      materialized.add(row.extractionProposalId);
      const proposal = indexes.lifeEventProposals.get(row.extractionProposalId);
      ensure(proposal && proposal.materializedLifeEventId === row.id && ["accepted", "corrected"].includes(String(proposal.status)), "broken_review_link");
    } else ensure(row.origin === "manual", "broken_review_link");
  }
  const candidateKeys = new Set<string>();
  for (const row of records.lifeEventProposals) {
    ensure(isId(row.jobId) && isId(row.candidateKey));
    const key = JSON.stringify([row.jobId, row.candidateKey]);
    ensure(!candidateKeys.has(key), "duplicate_candidate_key"); candidateKeys.add(key);
    const job = indexes.lifeExtractionJobs.get(row.jobId); ensure(job, "missing_job");
    candidate(row.candidate);
    instant(row.generatedAt); instant(row.updatedAt); nullableInstant(row.reviewedAt);
    ensure(Array.isArray(row.evidenceRanges));
    for (const range of row.evidenceRanges) {
      object(range); ensure(Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) && Number(range.start) >= 0 && Number(range.end) > Number(range.start));
      // Record evidence belongs to the original extraction snapshot, which may now be stale.
      const input = job.input as { kind: string; text?: string };
      if (input.kind === "scratch") ensure(Number(range.end) <= input.text!.length);
    }
    ensure(["pending", "accepted", "corrected", "rejected", "superseded"].includes(String(row.status)));
    if (row.status === "accepted" || row.status === "corrected") {
      ensure(isId(row.materializedLifeEventId) && row.reviewedAt !== null, "broken_review_link");
      const event = indexes.lifeEvents.get(row.materializedLifeEventId);
      ensure(event && event.extractionProposalId === row.id, "broken_review_link");
      ensure(event.origin === (row.status === "accepted" ? "ai" : "manual"), "broken_review_origin");
      const resolved = row.status === "corrected" ? row.correctedCandidate : row.candidate;
      candidate(resolved);
      if (row.status === "accepted") ensure(row.correctedCandidate === null);
      for (const key of Object.keys(normalizeLifeEventCandidate(resolved as LifeEventCandidate))) ensure(event[key] === (resolved as Record<string, unknown>)[key], "broken_review_candidate");
      const input = job.input as { kind: string; source?: unknown };
      ensure(encodeJson(event.source) === encodeJson(input.kind === "scratch" ? null : input.source), "broken_review_source");
    } else {
      ensure(row.materializedLifeEventId === null && row.correctedCandidate === null, "broken_review_link");
      if (row.status === "pending") ensure(row.reviewedAt === null);
    }
  }
  return [...warnings];
}
