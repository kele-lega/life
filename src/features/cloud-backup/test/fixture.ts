import type { LifeDatabase } from "@/lib/db/client";

export async function seedBackupFixture(database: LifeDatabase) {
  const createdAt = "2026-09-07T01:02:03.000Z";
  const life = { createdAt, updatedAt: createdAt, deletedAt: null };
  await database.moments.add({ id: "moment-原样", originalText: " 原文\r\n👩🏽‍🚀 é\u0000 ", isFavorite: true, location: { city: "上海", placeName: "", latitude: 0, longitude: null }, ...life });
  await database.momentAppends.add({ id: "append-one", momentId: "moment-原样", text: "追加原文", ...life, deletedAt: createdAt });
  await database.diaries.add({ id: "diary-one", title: "", body: "未改写的完整日记\n\n尾部 ", isFavorite: false, location: null, ...life });
  await database.attachments.add({ id: "image-one", ownerType: "moment", ownerId: "moment-原样", kind: "image", fileName: "../保留原名.png", mimeType: "image/png", size: 999, blob: new Blob([new Uint8Array([0, 1, 255, 17, 128])], { type: "image/jpeg" }), width: null, height: 0, ...life, deletedAt: createdAt });
  const candidate = { category: "learning" as const, name: "阅读", occurredOn: "2026-09-07", timeZone: "Asia/Shanghai", timePrecision: "day" as const, startAt: null, endAt: null, durationSeconds: 0 };
  await database.lifeEvents.add({ id: "manual-one", ...candidate, source: null, origin: "manual", metadata: { custom: [null, 0, ""] }, ...life });
  await database.lifeExtractionJobs.add({ id: "job-one", requestKey: "original-request-key", input: { kind: "scratch", text: "阅读", contentFingerprint: "original-fingerprint" }, context: { occurredOn: candidate.occurredOn, timeZone: candidate.timeZone }, extractor: { name: "fake", version: "1", schemaVersion: 1, provider: null, model: null }, status: "succeeded", attemptCount: 1, createdAt, updatedAt: createdAt, completedAt: createdAt, lastErrorCode: null });
  for (const status of ["pending", "accepted", "corrected", "rejected", "superseded"] as const) {
    const materialized = status === "accepted" || status === "corrected";
    await database.lifeEventProposals.add({ id: `proposal-${status}`, jobId: "job-one", candidateKey: status, candidate, evidenceRanges: [{ start: 0, end: 2 }], status, correctedCandidate: status === "corrected" ? { ...candidate, name: "读书" } : null, materializedLifeEventId: materialized ? `event-${status}` : null, generatedAt: createdAt, updatedAt: createdAt, reviewedAt: status === "pending" ? null : createdAt });
    if (materialized) await database.lifeEvents.add({ id: `event-${status}`, ...candidate, name: status === "corrected" ? "读书" : candidate.name, origin: status === "accepted" ? "ai" : "manual", source: null, extractionProposalId: `proposal-${status}`, metadata: {}, ...life });
  }
  const source = { type: "diary" as const, id: "diary-one", contentFingerprint: `sha256:text-v1:${"0".repeat(64)}` };
  await database.lifeExtractionJobs.add({ id: "job-record", requestKey: "historical-record-request", input: { kind: "record", source }, context: { occurredOn: candidate.occurredOn, timeZone: candidate.timeZone }, extractor: { name: "synthetic-provider", version: "1", schemaVersion: 1, provider: "synthetic", model: "synthetic-model" }, status: "succeeded", attemptCount: 1, createdAt, updatedAt: createdAt, completedAt: createdAt, lastErrorCode: null });
  await database.lifeEventProposals.add({ id: "proposal-record", jobId: "job-record", candidateKey: "historical", candidate, evidenceRanges: [{ start: 0, end: 999 }], status: "accepted", correctedCandidate: null, materializedLifeEventId: "event-record", generatedAt: createdAt, updatedAt: createdAt, reviewedAt: createdAt });
  await database.lifeEvents.add({ id: "event-record", ...candidate, origin: "ai", source, extractionProposalId: "proposal-record", metadata: {}, ...life });
}
