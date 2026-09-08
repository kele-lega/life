// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EXTRACTION_LIMITS, OPENAI_EXTRACTION_DESCRIPTOR, proposalsFromStructuredOutput, readBoundedJson, validateCandidate, validateExtractionResult, validateExtractionText } from "./extraction-protocol";

const candidate = { category: "activity", name: "跑步", occurredOn: "2026-09-07", timeZone: "Asia/Shanghai", timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1800 };
const text = "🙂 今天跑步30分钟。\n不补充位置。";
const structured = () => ({ candidates: [{ candidate: { ...candidate }, evidenceQuotes: ["今天跑步30分钟。"] }] });

describe("strict extraction transport and evidence", () => {
  it("preserves contract fields and calculates UTF-16 evidence offsets without duplicating source text", () => {
    const result = proposalsFromStructuredOutput(structured(), text);
    expect(result.candidates[0]).toEqual({ candidateKey: "evidence-3-12-1", candidate, evidenceRanges: [{ start: 3, end: 12 }] });
    expect(validateExtractionResult(result, text)).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("evidenceQuotes");
    expect(proposalsFromStructuredOutput({ candidates: [] }, text)).toEqual({ candidates: [] });
  });
  it.each([
    { ...candidate, confidence: 0.9 }, { ...candidate, durationSeconds: undefined }, { ...candidate, startAt: undefined },
    { ...candidate, category: "mood" }, { ...candidate, durationSeconds: -1 }, { ...candidate, durationSeconds: 0.5 },
    { ...candidate, occurredOn: "2026-02-30" }, { ...candidate, timeZone: "+08:00" },
    { ...candidate, startAt: "2026-09-07T00:00:00.000Z" },
    { ...candidate, timePrecision: "interval", startAt: "2026-09-07T00:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z", durationSeconds: null },
  ])("rejects non-contract or incoherent output %j", (value) => expect(() => validateCandidate(value)).toThrow());
  it("distinguishes unknown duration and known zero", () => {
    expect(validateCandidate({ ...candidate, durationSeconds: null }).durationSeconds).toBeNull();
    expect(validateCandidate({ ...candidate, durationSeconds: 0 }).durationSeconds).toBe(0);
  });
  it.each([[], [""], ["虚构跑步"], ["跑步", "没有依据"]].map((quotes) => ({ quotes })))("rejects missing or invented evidence $quotes", ({ quotes }) => {
    expect(() => proposalsFromStructuredOutput({ candidates: [{ candidate, evidenceQuotes: quotes }] }, text)).toThrow();
  });
  it("rejects repeated ambiguous quotes, duplicate candidates and unsupported names", () => {
    expect(() => proposalsFromStructuredOutput(structured(), text + text)).toThrow();
    const value = structured(); value.candidates.push(value.candidates[0]);
    expect(() => proposalsFromStructuredOutput(value, text)).toThrow();
    expect(() => proposalsFromStructuredOutput({ candidates: [{ candidate: { ...candidate, name: "登山" }, evidenceQuotes: [text] }] }, text)).toThrow();
  });
  it("rejects corrupt HTTP candidates before any persistence", () => {
    const result = proposalsFromStructuredOutput(structured(), text);
    result.candidates[0].evidenceRanges[0].end = text.length + 1;
    expect(() => validateExtractionResult(result, text)).toThrow();
    expect(() => validateExtractionResult({ candidates: Array(33).fill(result.candidates[0]) }, text)).toThrow();
  });
  it("enforces actual UTF-8 text size and exact context keys", () => {
    expect(() => validateExtractionText("中".repeat(22_000), candidate)).toThrow();
    expect(() => validateExtractionText(text, { occurredOn: candidate.occurredOn, timeZone: candidate.timeZone, sourceId: "private" })).toThrow();
    expect(validateExtractionText(text, { occurredOn: candidate.occurredOn, timeZone: candidate.timeZone }).text).toBe(text);
  });
  it("bounds streamed JSON bytes independently of headers and rejects malformed UTF-8", async () => {
    await expect(readBoundedJson(new Response(JSON.stringify({ descriptor: OPENAI_EXTRACTION_DESCRIPTOR })).body, EXTRACTION_LIMITS.responseBytes)).resolves.toHaveProperty("descriptor");
    await expect(readBoundedJson(new Response(" ".repeat(100)).body, 50)).rejects.toMatchObject({ code: "too_large" });
    await expect(readBoundedJson(new Response(new Uint8Array([0xff])).body, 50)).rejects.toThrow();
  });
});
