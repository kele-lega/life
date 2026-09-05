import { describe, expect, it } from "vitest";

import type { LifeExtractionRequest } from "../model/types";
import { FakeLifeEventExtractor } from "./fake-life-event-extractor";

const request = (text: string): LifeExtractionRequest => ({
  input: { kind: "scratch" },
  text,
  context: { occurredOn: "2026-09-04", timeZone: "Asia/Shanghai" },
});

describe("FakeLifeEventExtractor", () => {
  it("extracts deterministic, conservative candidates without inventing clock times", async () => {
    const result = await new FakeLifeEventExtractor().extract(
      request("下午在咖啡馆看书40分钟，晚上跑步半小时。"),
    );

    expect(result.candidates.map(({ candidate }) => ({
      category: candidate.category,
      name: candidate.name,
      durationSeconds: candidate.durationSeconds,
      timePrecision: candidate.timePrecision,
      startAt: candidate.startAt,
    }))).toEqual([
      { category: "place", name: "咖啡馆", durationSeconds: null, timePrecision: "day", startAt: null },
      { category: "learning", name: "阅读", durationSeconds: 2_400, timePrecision: "day", startAt: null },
      { category: "activity", name: "跑步", durationSeconds: 1_800, timePrecision: "day", startAt: null },
    ]);
  });

  it("returns an empty successful result when the text has no supported event", async () => {
    await expect(new FakeLifeEventExtractor().extract(request("今天只是随手记下一点想法。")))
      .resolves.toEqual({ candidates: [] });
  });
});
