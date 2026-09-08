// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpLifeEventExtractor } from "./http-life-event-extractor";
import { EXTRACTION_LIMITS, OPENAI_EXTRACTION_DESCRIPTOR } from "./extraction-protocol";

afterEach(() => vi.unstubAllGlobals());
describe("explicit HTTP extraction", () => {
  it("projects a record request to text/context/descriptor, never transmitting source references", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ descriptor: OPENAI_EXTRACTION_DESCRIPTOR, limits: EXTRACTION_LIMITS }))).mockResolvedValueOnce(new Response('{"candidates":[]}'));
    vi.stubGlobal("fetch", fetcher);
    const extractor = await createHttpLifeEventExtractor();
    await extractor.extract({ input: { kind: "record", source: { type: "moment", id: "private-id", contentFingerprint: "private-fingerprint" } }, text: " 原始文字\n", context: { occurredOn: "2026-09-07", timeZone: "UTC" } });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ text: " 原始文字\n", context: { occurredOn: "2026-09-07", timeZone: "UTC" }, descriptor: OPENAI_EXTRACTION_DESCRIPTOR });
    expect(fetcher.mock.calls[1][1]).toMatchObject({ cache: "no-store", method: "POST" });
  });
  it("does not substitute Fake when a configured service fails", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ descriptor: OPENAI_EXTRACTION_DESCRIPTOR, limits: EXTRACTION_LIMITS }))).mockRejectedValueOnce(new Error("network internals"));
    vi.stubGlobal("fetch", fetcher);
    const extractor = await createHttpLifeEventExtractor();
    await expect(extractor.extract({ input: { kind: "scratch" }, text: "看书40分钟", context: { occurredOn: "2026-09-07", timeZone: "UTC" } })).rejects.toMatchObject({ code: "offline" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
