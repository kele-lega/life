// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { extractWithOpenAI, getOpenAIExtractionConfiguration } from "./openai-extractor";

const input = { text: "今天跑步30分钟。", context: { occurredOn: "2026-09-07", timeZone: "Asia/Shanghai" } };
const candidate = { category: "activity", name: "跑步", ...input.context, timePrecision: "day", startAt: null, endAt: null, durationSeconds: 1800 };
const output = () => ({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ candidates: [{ candidate, evidenceQuotes: [input.text] }] }) }] }] });
beforeEach(() => { vi.stubEnv("AI_API_KEY", "synthetic-test-secret"); vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("AI_MODEL", "gpt-5.6-terra"); vi.stubEnv("AI_BASE_URL", "https://api.openai.com/v1"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("server-only OpenAI Responses adapter", () => {
  it("sends the exact requested model, medium reasoning, strict schema and store=false without private identifiers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(output())));
    const info = vi.spyOn(console, "log"); const error = vi.spyOn(console, "error");
    const result = await extractWithOpenAI(getOpenAIExtractionConfiguration(), input, undefined, fetcher);
    expect(result.candidates[0].candidate).toEqual(candidate);
    expect(result).not.toHaveProperty("output");
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(request).toMatchObject({ redirect: "error", cache: "no-store", headers: { Authorization: "Bearer synthetic-test-secret" } });
    const body = JSON.parse(request!.body as string);
    expect(body).toMatchObject({ model: "gpt-5.6-terra", reasoning: { effort: "medium" }, store: false, stream: false, tools: [], tool_choice: "none", truncation: "disabled", text: { format: { type: "json_schema", strict: true } } });
    expect(JSON.parse(body.input[0].content[0].text)).toEqual({ recordText: input.text, referenceDate: input.context.occurredOn, timeZone: input.context.timeZone });
    expect(body.text.format.schema.properties.candidates.items.properties.candidate.additionalProperties).toBe(false);
    expect(body.text.format.schema.properties.candidates.items.properties.candidate.required).toHaveLength(8);
    expect(body.instructions).toContain("untrusted DATA");
    expect(body.instructions).toContain("Prefer fewer facts to speculation");
    expect(info).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it("keeps an explicitly configured HTTPS gateway in provenance without exposing a secret or silently changing models", () => {
    vi.stubEnv("AI_BASE_URL", "https://fanrenapi.com");
    const config = getOpenAIExtractionConfiguration();
    expect(config.endpoint).toBe("https://fanrenapi.com/v1/responses");
    expect(config.descriptor.provider).toBe("openai-compatible:fanrenapi.com");
    expect(JSON.stringify(config.descriptor)).not.toContain(config.apiKey);
    vi.stubEnv("AI_MODEL", "another-model"); expect(() => getOpenAIExtractionConfiguration()).toThrow();
  });
  it.each(["http://example.com", "https://user:pass@example.com", "https://example.com/path?token=x"]) ("rejects unsafe/unexpected base URL %s", (url) => {
    vi.stubEnv("AI_BASE_URL", url); expect(() => getOpenAIExtractionConfiguration()).toThrow();
  });
  it("fails closed when no credential is configured", () => { vi.stubEnv("AI_API_KEY", ""); expect(() => getOpenAIExtractionConfiguration()).toThrow(); });
  it.each([429, 401, 500])("sanitizes upstream %s without reading or logging the error body", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider response", { status }));
    await expect(extractWithOpenAI(getOpenAIExtractionConfiguration(), input, undefined, fetcher)).rejects.toMatchObject({ code: status === 429 ? "rate_limited" : "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "private explanation" }] }] },
    { status: "completed", output: [{ type: "function_call" }] },
    { status: "completed", output: [] },
  ])("rejects refusal, incomplete output and unexpected tool calls", async (value) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value)));
    await expect(extractWithOpenAI(getOpenAIExtractionConfiguration(), input, undefined, fetcher)).rejects.toThrow();
  });
  it("aborts and maps timeouts without automatic retry", async () => {
    const signal = AbortSignal.abort();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("sensitive transport error"));
    await expect(extractWithOpenAI(getOpenAIExtractionConfiguration(), input, signal, fetcher)).rejects.toMatchObject({ code: "cancelled" });
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    await expect(extractWithOpenAI(getOpenAIExtractionConfiguration(), input, undefined, fetcher)).rejects.toMatchObject({ code: "timeout" });
  });
});
