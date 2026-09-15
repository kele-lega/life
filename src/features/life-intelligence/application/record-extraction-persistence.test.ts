// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDiary, updateDiaryContent } from "@/features/diary/repository/diary-repository";
import { getLifeEventSummary } from "@/features/life-insights/query/life-statistics-query";
import { createMoment, createMomentAppend, createMomentWithAttachments, restoreMoment, softDeleteMoment } from "@/features/moment/repository/moment-repository";
import { db } from "@/lib/db/client";

import { FakeLifeEventExtractor } from "../extractor/fake-life-event-extractor";
import type { LifeEventExtractor } from "../extractor/life-event-extractor";
import type { LifeExtractionJob } from "../model/types";
import { DexieLifeIntelligenceRepository } from "../repository/dexie-life-intelligence-repository";
import { readRecordExtractionSource } from "./record-extraction-source";
import { reviewLifeEventProposal } from "./review-proposal";
import { runLifeExtraction } from "./run-life-extraction";

const repository = new DexieLifeIntelligenceRepository();
const fake = new FakeLifeEventExtractor();
const createdAt = "2026-09-06T03:00:00.000Z";
const reviewedAt = "2026-09-06T10:00:00.000Z";
const range = { startDate: "2026-09-06", endDate: "2026-09-07" };
const sourceRef = { type: "moment" as const, id: "source-moment" };
// This is a local provider-descriptor fixture, not a live provider or network request.
const configuredExtractor = (model = "gpt-5.6-terra"): LifeEventExtractor => ({
  name: "provider-contract-test", version: "1", schemaVersion: 1, provider: "openai", model,
  extract: vi.fn((request) => fake.extract(request)),
});

beforeEach(async () => { await db.delete(); await db.open(); });
afterEach(async () => { vi.restoreAllMocks(); db.close(); await db.delete(); });

describe("record extraction persistence with provider descriptors", () => {
  it("keeps the descriptor in the existing request key and restores rejected results without another extraction", async () => {
    await createMoment({ id: sourceRef.id, originalText: "看书40分钟", createdAt });
    const { request } = await readRecordExtractionSource(sourceRef, "UTC");
    const provider = configuredExtractor();
    const first = await runLifeExtraction(repository, provider, request);
    await reviewLifeEventProposal(repository, { action: "reject", proposalId: first.proposals[0].id, reviewedAt });
    db.close(); await db.open();
    const restored = await runLifeExtraction(repository, provider, request);

    expect(provider.extract).toHaveBeenCalledTimes(1);
    expect(restored.job).toEqual(first.job);
    expect(restored.job.extractor).toMatchObject({ provider: "openai", model: "gpt-5.6-terra" });
    expect(restored.proposals[0].status).toBe("rejected");
    expect(restored.job.input).toEqual(request.input);
    expect(restored.job.input).not.toHaveProperty("text");
    const otherModel = await runLifeExtraction(repository, configuredExtractor("another-model"), request);
    const compatible = await runLifeExtraction(repository, { ...configuredExtractor(), provider: "openai-compatible:fanrenapi.com" }, request);
    const oldFake = await runLifeExtraction(repository, fake, request);
    expect(new Set([first.job.requestKey, otherModel.job.requestKey, compatible.job.requestKey, oldFake.job.requestKey]).size).toBe(4);
    expect(oldFake.job.extractor).toMatchObject({ provider: null, model: null });
    await expect(db.lifeEvents.count()).resolves.toBe(0);
  });

  it("restores all versions of one source using the existing source index, with deterministic newest-first ordering", async () => {
    const diary = await createDiary({ id: "same-source-id", body: "第一版", createdAt });
    const moment = await createMoment({ id: diary.id, originalText: "独立随笔", createdAt });
    const emptyExtractor: LifeEventExtractor = { ...configuredExtractor(), extract: async () => ({ candidates: [] }) };
    const olderRequest = (await readRecordExtractionSource({ type: "diary", id: diary.id }, "UTC")).request;
    await runLifeExtraction(repository, emptyExtractor, olderRequest, { createId: () => "job-a", now: () => "2026-09-06T01:00:00.000Z" });
    await updateDiaryContent(diary.id, { body: "第二版" });
    const newerRequest = (await readRecordExtractionSource({ type: "diary", id: diary.id }, "UTC")).request;
    await runLifeExtraction(repository, emptyExtractor, newerRequest, { createId: () => "job-b", now: () => "2026-09-06T02:00:00.000Z" });
    await runLifeExtraction(repository, { ...emptyExtractor, version: "2" }, newerRequest, { createId: () => "job-c", now: () => "2026-09-06T02:00:00.000Z" });
    await runLifeExtraction(repository, emptyExtractor, (await readRecordExtractionSource({ type: "moment", id: moment.id }, "UTC")).request);
    await runLifeExtraction(repository, emptyExtractor, { input: { kind: "scratch" }, text: "其他草稿", context: rangeContext() });
    db.close(); await db.open();

    const jobs = await repository.listJobsBySource({ type: "diary", id: diary.id });
    expect(jobs.map(({ id }) => id)).toEqual(["job-c", "job-b", "job-a"]);
    await expect(repository.listJobsBySource({ type: "moment", id: moment.id })).resolves.toHaveLength(1);
    await expect(repository.listJobsBySource({ type: "diary", id: "missing" })).resolves.toEqual([]);
    expect(db.verno).toBe(7);
  });

  it.each([
    { provider: "openai", model: null }, { provider: null, model: "gpt-5.6-terra" },
    { provider: " ", model: "model" }, { provider: "openai", model: " model " },
  ])("rejects incomplete descriptors before extraction and at the direct persistence boundary: %j", async (descriptor) => {
    await createMoment({ id: sourceRef.id, originalText: "看书40分钟", createdAt });
    const { request } = await readRecordExtractionSource(sourceRef, "UTC");
    const malformed = { ...configuredExtractor(), ...descriptor };
    await expect(runLifeExtraction(repository, malformed, request)).rejects.toThrow("complete pair");
    expect(malformed.extract).not.toHaveBeenCalled();
    const valid = await runLifeExtraction(repository, configuredExtractor(), request);
    const invalidJob: LifeExtractionJob = { ...valid.job, id: "bad-job", extractor: { ...valid.job.extractor, ...descriptor } };
    await expect(repository.commitExtractionResult({ job: invalidJob, proposals: [] })).rejects.toThrow("complete pair");
    await expect(db.lifeExtractionJobs.count()).resolves.toBe(1);
  });

  it("leaves no Job or Proposal after provider failure or an interrupted proposal write", async () => {
    const original = await createMoment({ id: sourceRef.id, originalText: "看书40分钟", createdAt });
    const { request } = await readRecordExtractionSource(sourceRef, "UTC");
    const failed = { ...configuredExtractor(), extract: vi.fn().mockRejectedValue(new Error("unavailable")) };
    await expect(runLifeExtraction(repository, failed, request)).rejects.toThrow("unavailable");
    await expect(db.lifeExtractionJobs.count()).resolves.toBe(0);
    const write = vi.spyOn(db.lifeEventProposals, "bulkAdd").mockRejectedValueOnce(new Error("write failed"));
    await expect(runLifeExtraction(repository, configuredExtractor(), request)).rejects.toThrow("write failed");
    write.mockRestore();
    await expect(db.lifeExtractionJobs.count()).resolves.toBe(0);
    await expect(db.lifeEventProposals.count()).resolves.toBe(0);
    await expect(db.moments.get(original.id)).resolves.toEqual(original);
    const retry = await runLifeExtraction(repository, configuredExtractor(), request);
    expect(retry.proposals).toHaveLength(1);
  });

  it("preserves every original byte and metadata through local Accept, Correct and Reject", async () => {
    const blob = new Blob([new Uint8Array([1, 22, 255])], { type: "image/png" });
    const moment = await createMomentWithAttachments({
      id: sourceRef.id, originalText: " 下午在咖啡馆看书40分钟，晚上跑步半小时。\n", createdAt,
      location: { city: "上海", placeName: "窗边", latitude: 31, longitude: 121 },
      attachments: [{ id: "photo", fileName: "original.png", mimeType: "image/png", blob }],
    });
    const append = await createMomentAppend(moment.id, { text: "追加原文  \n" });
    const diary = await createDiary({ title: " 日记标题 ", body: "日记原文🌿\n", createdAt });
    const attachment = await db.attachments.get("photo");
    const { request } = await readRecordExtractionSource(sourceRef, "UTC");
    const provider = configuredExtractor();
    const result = await runLifeExtraction(repository, provider, request);
    await expect(getLifeEventSummary(range)).resolves.toMatchObject({ totalEvents: 0 });
    const reading = result.proposals.find(({ candidate }) => candidate.name === "阅读")!;
    const running = result.proposals.find(({ candidate }) => candidate.name === "跑步")!;
    const place = result.proposals.find(({ candidate }) => candidate.category === "place")!;
    await reviewLifeEventProposal(repository, { action: "accept", proposalId: reading.id, lifeEventId: crypto.randomUUID(), reviewedAt });
    await reviewLifeEventProposal(repository, { action: "correct", proposalId: running.id, lifeEventId: crypto.randomUUID(), reviewedAt, correction: { ...running.candidate, name: "慢跑", durationSeconds: 2_100 } });
    await reviewLifeEventProposal(repository, { action: "reject", proposalId: place.id, reviewedAt });

    expect(provider.extract).toHaveBeenCalledTimes(1);
    await expect(getLifeEventSummary(range)).resolves.toMatchObject({ totalEvents: 2, totalDurationSeconds: 4_500 });
    await expect(db.moments.get(moment.id)).resolves.toEqual(moment);
    await expect(db.momentAppends.get(append.id)).resolves.toEqual(append);
    await expect(db.diaries.get(diary.id)).resolves.toEqual(diary);
    await expect(db.attachments.get("photo")).resolves.toEqual(attachment);
    const after = await db.attachments.get("photo");
    expect(new Uint8Array(await after!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 22, 255]));

    const events = await db.lifeEvents.toArray();
    await softDeleteMoment(moment.id);
    await expect(getLifeEventSummary(range)).resolves.toMatchObject({ totalEvents: 0 });
    await expect(db.lifeEvents.toArray()).resolves.toEqual(events);
    await restoreMoment(moment.id);
    await expect(getLifeEventSummary(range)).resolves.toMatchObject({ totalEvents: 2 });
  });

  it("keeps stale Diary audit records, blocks pending review, and never counts an outdated accepted Event", async () => {
    const diary = await createDiary({ title: "原题", body: "看书40分钟，跑步半小时。", createdAt });
    const ref = { type: "diary" as const, id: diary.id };
    const result = await runLifeExtraction(repository, configuredExtractor(), (await readRecordExtractionSource(ref, "UTC")).request);
    const reading = result.proposals.find(({ candidate }) => candidate.name === "阅读")!;
    const running = result.proposals.find(({ candidate }) => candidate.name === "跑步")!;
    await reviewLifeEventProposal(repository, { action: "accept", proposalId: reading.id, lifeEventId: crypto.randomUUID(), reviewedAt });
    const event = await repository.getMaterializedLifeEvent(reading.id);
    await expect(getLifeEventSummary(range)).resolves.toMatchObject({ totalEvents: 1 });
    await updateDiaryContent(diary.id, { title: diary.title, body: "新正文" });
    await expect(repository.getProposalSourceStatus(running.id)).resolves.toBe("stale");
    await expect(reviewLifeEventProposal(repository, { action: "accept", proposalId: running.id, lifeEventId: crypto.randomUUID(), reviewedAt })).rejects.toThrow("stale");
    await expect(reviewLifeEventProposal(repository, { action: "correct", proposalId: running.id, lifeEventId: crypto.randomUUID(), reviewedAt, correction: running.candidate })).rejects.toThrow("stale");
    await reviewLifeEventProposal(repository, { action: "reject", proposalId: running.id, reviewedAt });
    await expect(getLifeEventSummary(range)).resolves.toMatchObject({ totalEvents: 0 });
    await expect(repository.getMaterializedLifeEvent(reading.id)).resolves.toEqual(event);
    await expect(repository.listJobsBySource(ref)).resolves.toHaveLength(1);
    await updateDiaryContent(diary.id, { title: diary.title, body: diary.body });
    await expect(getLifeEventSummary(range)).resolves.toMatchObject({ totalEvents: 1 });
  });
});

function rangeContext() { return { occurredOn: "2026-09-06", timeZone: "UTC" }; }
