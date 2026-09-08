import type { LifeEventExtractor } from "./life-event-extractor";
import type { LifeExtractionJob, LifeExtractionRequest, LifeExtractionResult } from "../model/types";
import { EXTRACTION_LIMITS, ExtractionHttpError, exactObject, readBoundedJson, isResponsesDescriptor, validateExtractionResult, validateExtractionText } from "./extraction-protocol";

export { ExtractionHttpError } from "./extraction-protocol";

async function requestJson(init: RequestInit): Promise<unknown> {
  try {
    const response = await fetch("/api/life-extraction", { ...init, cache: "no-store", credentials: "same-origin" });
    const value = await readBoundedJson(response.body, EXTRACTION_LIMITS.responseBytes);
    if (!response.ok) {
      const error = exactObject(value, ["error"]);
      throw new ExtractionHttpError(typeof error.error === "string" ? error.error : "unavailable");
    }
    return value;
  } catch (error) {
    if (init.signal?.aborted) throw new ExtractionHttpError("cancelled");
    if (error instanceof ExtractionHttpError) throw error;
    throw new ExtractionHttpError("offline");
  }
}

class HttpLifeEventExtractor implements LifeEventExtractor {
  readonly name; readonly version; readonly schemaVersion; readonly provider; readonly model;
  constructor(private readonly descriptor: LifeExtractionJob["extractor"], private readonly signal?: AbortSignal) {
    this.name = descriptor.name; this.version = descriptor.version; this.schemaVersion = descriptor.schemaVersion;
    this.provider = descriptor.provider; this.model = descriptor.model;
  }
  async extract(request: LifeExtractionRequest): Promise<LifeExtractionResult> {
    const { text, context } = validateExtractionText(request.text, request.context);
    // Intentionally construct a new allowlisted payload: request.input never crosses the network.
    const value = await requestJson({ method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context, descriptor: this.descriptor }), signal: this.signal });
    if (this.signal?.aborted) throw new ExtractionHttpError("cancelled");
    return validateExtractionResult(value, text);
  }
}

/** Call only from the user's explicit Start action; opening a review is local-only. */
export async function createHttpLifeEventExtractor(signal?: AbortSignal): Promise<LifeEventExtractor> {
  const result = exactObject(await requestJson({ method: "GET", signal }), ["descriptor", "limits"]);
  if (!isResponsesDescriptor(result.descriptor)) throw new ExtractionHttpError("configuration_changed");
  return new HttpLifeEventExtractor(result.descriptor as LifeExtractionJob["extractor"], signal);
}
