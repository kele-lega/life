import { extractWithOpenAI, getOpenAIExtractionConfiguration } from "@/features/life-intelligence/server/openai-extractor";
import { EXTRACTION_LIMITS, ExtractionHttpError, exactObject, readBoundedJson, sameDescriptor, validateExtractionText } from "@/features/life-intelligence/extractor/extraction-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function failure(error: unknown): Response {
  const code = error instanceof ExtractionHttpError ? error.code : "unavailable";
  const statuses: Record<string, number> = { invalid_request: 400, too_large: 413, forbidden: 403,
    configuration_changed: 409, rate_limited: 429, timeout: 504, cancelled: 408, invalid_output: 502, refused: 422 };
  return json({ error: code }, statuses[code] ?? 503);
}

function assertAccess(request: Request): void {
  const url = new URL(request.url);
  // Next may reconstruct request.url using its bind hostname; browsers send the public Host.
  const host = request.headers.get("host") ?? url.host;
  const publicUrl = new URL(`${url.protocol}//${host}`);
  if (publicUrl.host !== host || publicUrl.username || publicUrl.password) throw new ExtractionHttpError("forbidden");
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname);
  // A public installation must deliberately configure its origin AND protect access at its host.
  // Origin validation is not authentication. No body or IP logging is used here.
  if (!localhost && process.env.AI_ALLOWED_ORIGIN !== publicUrl.origin) throw new ExtractionHttpError("forbidden");
  const origin = request.headers.get("origin");
  if ((origin && origin !== publicUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new ExtractionHttpError("forbidden");
  if (request.method === "POST" && !origin) throw new ExtractionHttpError("forbidden");
}

// Single-process bounds reduce accidental duplicate spend. Not distributed authentication/quotas.
let inFlight = 0;
let windowStart = 0;
let windowRequests = 0;
function acquire(): () => void {
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; windowRequests = 0; }
  if (inFlight >= 2 || windowRequests >= 8) throw new ExtractionHttpError("rate_limited");
  inFlight++; windowRequests++;
  return () => { inFlight--; };
}

export async function GET(request: Request): Promise<Response> {
  try {
    assertAccess(request);
    const { descriptor } = getOpenAIExtractionConfiguration();
    return json({ descriptor, limits: EXTRACTION_LIMITS });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    assertAccess(request);
    const configuration = getOpenAIExtractionConfiguration();
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ExtractionHttpError("invalid_request");
    let payload: Record<string, unknown>;
    try { payload = exactObject(await readBoundedJson(request.body, EXTRACTION_LIMITS.requestBytes), ["text", "context", "descriptor"]); }
    catch (error) { throw new ExtractionHttpError(error instanceof ExtractionHttpError && error.code === "too_large" ? "too_large" : "invalid_request"); }
    if (!sameDescriptor(payload.descriptor, configuration.descriptor)) throw new ExtractionHttpError("configuration_changed");
    const input = validateExtractionText(payload.text, payload.context);
    release = acquire();
    return json(await extractWithOpenAI(configuration, input, request.signal));
  } catch (error) { return failure(error); }
  finally { release?.(); }
}
