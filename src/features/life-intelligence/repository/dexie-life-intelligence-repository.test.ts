import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDiary, updateDiaryContent } from "@/features/diary/repository/diary-repository";
import { createManualLifeEvent } from "@/features/life-event/repository/life-event-repository";
import { fingerprintLifeEventText } from "@/features/life-event/repository/source-fingerprint";
import { createMoment } from "@/features/moment/repository/moment-repository";
import { db } from "@/lib/db/client";

import { reviewLifeEventProposal } from "../application/review-proposal";
import { runLifeExtraction } from "../application/run-life-extraction";
import { FakeLifeEventExtractor } from "../extractor/fake-life-event-extractor";
import type { LifeEventExtractor } from "../extractor/life-event-extractor";
import { LifeEventProposalSourceError, ManualLifeEventConflictError } from "../model/errors";
import type { LifeEventProposal, LifeExtractionRequest } from "../model/types";
import { DexieLifeIntelligenceRepository } from "./dexie-life-intelligence-repository";

const extractor = new FakeLifeEventExtractor();
const repository = new DexieLifeIntelligenceRepository();
const occurredOn = "2026-09-05";
const reviewedAt = "2026-09-05T10:00:00.000Z";
const uuid = (value: number) => `80000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

function scratchRequest(text = "下午在咖啡馆看书40分钟，晚上跑步半小时。"): LifeExtractionRequest {
  return {
    input: { kind: "scratch" },
    text,
    context: { occurredOn, timeZone: "Asia/Shanghai" },
  };
}

function proposalNamed(proposals: readonly LifeEventProposal[], name: string): LifeEventProposal {
  const proposal = proposals.find((value) => value.candidate.name === name);
  if (!proposal) throw new Error(`Missing ${name} proposal fixture.`);
  return proposal;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("DexieLifeIntelligenceRepository extraction persistence", () => {
  it("atomically persists one scratch Job and all Proposals, then reuses the requestKey", async () => {
    const first = await runLifeExtraction(repository, extractor, scratchRequest());
    const retry = await runLifeExtraction(repository, extractor, scratchRequest());

    expect(retry).toEqual(first);
    expect(first.job.input).toMatchObject({ kind: "scratch", text: scratchRequest().text });
    expect(first.job.requestKey).toMatch(/^sha256:life-extraction-request-v1:/);
    expect(first.job.extractor).toMatchObject({ provider: null, model: null });
    expect(first.proposals).toHaveLength(3);
    expect(first.proposals.every((proposal) =>
      proposal.status === "pending" && proposal.correctedCandidate === null)).toBe(true);
    await expect(db.lifeExtractionJobs.count()).resolves.toBe(1);
    await expect(db.lifeEventProposals.count()).resolves.toBe(3);
    await expect(repository.getProposalSourceStatus(first.proposals[0].id)).resolves.toBe("scratch");
  });

  it("does not leave a Job behind when extractor output violates proposal identity", async () => {
    const invalidExtractor: LifeEventExtractor = {
      name: "invalid-fake",
      version: "1",
      schemaVersion: 1,
      async extract(request) {
        const candidate = {
          category: "learning" as const,
          name: "阅读",
          occurredOn: request.context.occurredOn,
          timeZone: request.context.timeZone,
          timePrecision: "day" as const,
          startAt: null,
          endAt: null,
          durationSeconds: null,
        };
        return {
          candidates: [
            { candidateKey: "duplicate", candidate, evidenceRanges: [{ start: 0, end: 2 }] },
            { candidateKey: "duplicate", candidate, evidenceRanges: [{ start: 2, end: 4 }] },
          ],
        };
      },
    };

    await expect(runLifeExtraction(repository, invalidExtractor, scratchRequest("阅读阅读")))
      .rejects.toThrow("duplicate candidate key");
    await expect(db.lifeExtractionJobs.count()).resolves.toBe(0);
    await expect(db.lifeEventProposals.count()).resolves.toBe(0);
  });

  it("enforces the 64 KiB persisted scratch input boundary", async () => {
    await expect(runLifeExtraction(repository, extractor, scratchRequest("读".repeat(65_537))))
      .rejects.toThrow("64 KiB");
    await expect(db.lifeExtractionJobs.count()).resolves.toBe(0);
  });

  it("restores the latest scratch Job and its Proposals after reopening IndexedDB", async () => {
    const saved = await runLifeExtraction(repository, extractor, scratchRequest());
    db.close();
    await db.open();

    const restored = await repository.getLatestJob("scratch");
    expect(restored).toEqual(saved.job);
    await expect(repository.listProposalsByJob(restored!.id)).resolves.toEqual(saved.proposals);
  });
});

describe("DexieLifeIntelligenceRepository review transactions", () => {
  it("accepts into one real AI LifeEvent and makes concurrent retries idempotent", async () => {
    const result = await runLifeExtraction(repository, extractor, scratchRequest());
    const reading = proposalNamed(result.proposals, "阅读");
    const [first, retry] = await Promise.all([
      reviewLifeEventProposal(repository, {
        action: "accept",
        proposalId: reading.id,
        lifeEventId: uuid(1),
        reviewedAt,
      }),
      reviewLifeEventProposal(repository, {
        action: "accept",
        proposalId: reading.id,
        lifeEventId: uuid(2),
        reviewedAt,
      }),
    ]);

    expect(retry).toEqual(first);
    expect(first.lifeEvent).toMatchObject({
      id: uuid(1),
      origin: "ai",
      source: null,
      extractionProposalId: reading.id,
    });
    await expect(db.lifeEvents.count()).resolves.toBe(1);
    await expect(db.lifeEventProposals.get(reading.id)).resolves.toMatchObject({
      status: "accepted",
      materializedLifeEventId: uuid(1),
    });
  });

  it("corrects a pending Proposal into one manual Event and never permits accepted -> corrected", async () => {
    const result = await runLifeExtraction(repository, extractor, scratchRequest());
    const reading = proposalNamed(result.proposals, "阅读");
    const correction = { ...reading.candidate, name: "深度阅读", durationSeconds: 3_000 };
    const corrected = await reviewLifeEventProposal(repository, {
      action: "correct",
      proposalId: reading.id,
      lifeEventId: uuid(3),
      reviewedAt,
      correction,
    });

    expect(corrected.lifeEvent).toMatchObject({ origin: "manual", name: "深度阅读", extractionProposalId: reading.id });
    expect(corrected.proposal).toMatchObject({ status: "corrected", correctedCandidate: correction });
    await expect(reviewLifeEventProposal(repository, {
      action: "accept",
      proposalId: reading.id,
      lifeEventId: uuid(4),
      reviewedAt,
    })).rejects.toThrow("cannot transition from corrected to accepted");

    const acceptedResult = await runLifeExtraction(repository, extractor, scratchRequest("今晚跑步半小时。"));
    const running = proposalNamed(acceptedResult.proposals, "跑步");
    await reviewLifeEventProposal(repository, { action: "accept", proposalId: running.id, lifeEventId: uuid(5), reviewedAt });
    await expect(reviewLifeEventProposal(repository, {
      action: "correct",
      proposalId: running.id,
      lifeEventId: uuid(6),
      reviewedAt,
      correction: { ...running.candidate, name: "慢跑" },
    })).rejects.toThrow("cannot transition from accepted to corrected");
    await expect(db.lifeEvents.count()).resolves.toBe(2);
  });

  it("rejects without writing LifeEvent and keeps rejection idempotent", async () => {
    const result = await runLifeExtraction(repository, extractor, scratchRequest());
    const running = proposalNamed(result.proposals, "跑步");
    const first = await reviewLifeEventProposal(repository, { action: "reject", proposalId: running.id, reviewedAt });
    const retry = await reviewLifeEventProposal(repository, { action: "reject", proposalId: running.id, reviewedAt });

    expect(retry).toEqual(first);
    expect(first).toMatchObject({ proposal: { status: "rejected" }, lifeEvent: null });
    await expect(db.lifeEvents.count()).resolves.toBe(0);
  });

  it("rolls back Proposal resolution when the Event ID collides", async () => {
    await createManualLifeEvent({
      id: uuid(7),
      category: "creation",
      name: "已有事件",
      occurredOn,
      timeZone: "Asia/Shanghai",
      timePrecision: "day",
    });
    const result = await runLifeExtraction(repository, extractor, scratchRequest());
    const reading = proposalNamed(result.proposals, "阅读");

    await expect(reviewLifeEventProposal(repository, {
      action: "accept",
      proposalId: reading.id,
      lifeEventId: uuid(7),
      reviewedAt,
    })).rejects.toThrow("already exists");
    await expect(db.lifeEventProposals.get(reading.id)).resolves.toMatchObject({ status: "pending", materializedLifeEventId: null });
    await expect(db.lifeEvents.count()).resolves.toBe(1);
  });

  it("lets a current record be reviewed but blocks stale or missing sources", async () => {
    await createDiary({ id: "source-diary", title: "", body: "看书40分钟" });
    const source = {
      type: "diary" as const,
      id: "source-diary",
      contentFingerprint: await fingerprintLifeEventText(["", "看书40分钟"]),
    };
    const result = await runLifeExtraction(repository, extractor, {
      input: { kind: "record", source },
      text: "看书40分钟",
      context: { occurredOn, timeZone: "Asia/Shanghai" },
    });
    const reading = proposalNamed(result.proposals, "阅读");
    await expect(repository.getProposalSourceStatus(reading.id)).resolves.toBe("current");

    await updateDiaryContent("source-diary", { body: "内容已经改变" });
    await expect(repository.getProposalSourceStatus(reading.id)).resolves.toBe("stale");
    await expect(reviewLifeEventProposal(repository, {
      action: "accept",
      proposalId: reading.id,
      lifeEventId: uuid(8),
      reviewedAt,
    })).rejects.toBeInstanceOf(LifeEventProposalSourceError);
    await expect(db.lifeEventProposals.get(reading.id)).resolves.toMatchObject({ status: "pending" });
    await expect(reviewLifeEventProposal(repository, { action: "reject", proposalId: reading.id, reviewedAt }))
      .resolves.toMatchObject({ proposal: { status: "rejected" } });

    const missingResult = await runLifeExtraction(repository, extractor, {
      input: { kind: "record", source: { ...source, id: "missing-diary" } },
      text: "看书40分钟",
      context: { occurredOn, timeZone: "Asia/Shanghai" },
    });
    const missing = proposalNamed(missingResult.proposals, "阅读");
    await expect(repository.getProposalSourceStatus(missing.id)).resolves.toBe("missing");
  });

  it("prevents an AI interpretation from duplicating a current manual record", async () => {
    await createMoment({ id: "source-moment", originalText: "看书40分钟" });
    const source = {
      type: "moment" as const,
      id: "source-moment",
      contentFingerprint: await fingerprintLifeEventText(["看书40分钟"]),
    };
    await createManualLifeEvent({
      source: { type: source.type, id: source.id },
      category: "learning",
      name: "阅读",
      occurredOn,
      timeZone: "Asia/Shanghai",
      timePrecision: "day",
      durationSeconds: 2_400,
    });
    const beforeMoment = await db.moments.get(source.id);
    const result = await runLifeExtraction(repository, extractor, {
      input: { kind: "record", source },
      text: "看书40分钟",
      context: { occurredOn, timeZone: "Asia/Shanghai" },
    });
    const reading = proposalNamed(result.proposals, "阅读");

    await expect(reviewLifeEventProposal(repository, {
      action: "accept",
      proposalId: reading.id,
      lifeEventId: uuid(9),
      reviewedAt,
    })).rejects.toBeInstanceOf(ManualLifeEventConflictError);
    await expect(db.lifeEventProposals.get(reading.id)).resolves.toMatchObject({ status: "pending" });
    await expect(db.lifeEvents.count()).resolves.toBe(1);
    await expect(db.moments.get(source.id)).resolves.toEqual(beforeMoment);
  });

  it("persists pending -> superseded as a terminal state without creating an Event", async () => {
    const result = await runLifeExtraction(repository, extractor, scratchRequest());
    const reading = proposalNamed(result.proposals, "阅读");
    const superseded = await repository.supersedePendingProposal(reading.id, reviewedAt);
    await expect(repository.supersedePendingProposal(reading.id, "2026-09-05T11:00:00.000Z")).resolves.toEqual(superseded);
    await expect(reviewLifeEventProposal(repository, {
      action: "accept",
      proposalId: reading.id,
      lifeEventId: uuid(10),
      reviewedAt,
    })).rejects.toThrow("cannot transition from superseded to accepted");
    await expect(db.lifeEvents.count()).resolves.toBe(0);
  });
});
