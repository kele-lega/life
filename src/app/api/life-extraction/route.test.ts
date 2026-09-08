// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { OPENAI_EXTRACTION_DESCRIPTOR } from "@/features/life-intelligence/extractor/extraction-protocol";

const origin = "http://127.0.0.1:3100";
const payload = () => ({ text: "跑步30分钟。", context: { occurredOn: "2026-09-07", timeZone: "UTC" }, descriptor: OPENAI_EXTRACTION_DESCRIPTOR });
function request(body: unknown = payload(), extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost:3100/api/life-extraction", { method: "POST", headers: {
    Host: "127.0.0.1:3100", Origin: origin, "Content-Type": "application/json", ...extraHeaders,
  }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.resetModules(); vi.stubEnv("AI_API_KEY", "test-only-key"); vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("AI_MODEL", "gpt-5.6-terra"); vi.stubEnv("AI_BASE_URL", "https://api.openai.com/v1"); vi.stubEnv("AI_ALLOWED_ORIGIN", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("extraction API boundary", () => {
  it("exposes only public config without calling the model, respecting Next's reconstructed hostname", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const { GET } = await import("./route");
    const response = await GET(new Request(origin + "/api/life-extraction"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ descriptor: OPENAI_EXTRACTION_DESCRIPTOR });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("passes only allowlisted inputs to the provider and returns no raw response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "do-not-persist", status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"candidates":[]}' }] }] })));
    vi.stubGlobal("fetch", fetcher);
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ candidates: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["source", "momentId", "fingerprint", "images", "location", "history", "systemPrompt", "url"])("rejects forbidden request property %s before network", async (key) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const { POST } = await import("./route");
    const response = await POST(request({ ...payload(), [key]: "private" }));
    expect(response.status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects cross-site/missing origins, config drift and actual body overflow without invoking the model", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const { POST } = await import("./route");
    expect((await POST(request(payload(), { Origin: "https://other.example" }))).status).toBe(403);
    expect((await POST(request(payload(), { Origin: "" }))).status).toBe(403);
    expect((await POST(request({ ...payload(), descriptor: { ...OPENAI_EXTRACTION_DESCRIPTOR, version: "old" } }))).status).toBe(409);
    expect((await POST(request({ ...payload(), text: "字".repeat(40_000) }))).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("has no public anonymous activation by default and returns safe configuration errors", async () => {
    const { GET } = await import("./route");
    expect((await GET(new Request("https://public.example/api/life-extraction"))).status).toBe(403);
    vi.stubEnv("AI_API_KEY", "");
    const response = await GET(new Request(origin + "/api/life-extraction"));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "not_configured" });
  });
  it("caps concurrent upstream calls and releases capacity after completion", async () => {
    const resolves: ((response: Response) => void)[] = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => resolves.push(resolve))));
    const { POST } = await import("./route");
    const first = POST(request()); const second = POST(request());
    await vi.waitFor(() => expect(resolves).toHaveLength(2));
    expect((await POST(request())).status).toBe(429);
    resolves.forEach((resolve) => resolve(new Response("failure", { status: 503 })));
    expect((await first).status).toBe(503); expect((await second).status).toBe(503);
  });
});
