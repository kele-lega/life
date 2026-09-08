import { normalizeLifeEventCandidate } from "../model/candidate";
import type { LifeEventCandidate, LifeExtractionJob, LifeExtractionRequest, LifeExtractionResult } from "../model/types";

export const EXTRACTION_LIMITS = { textBytes: 65_536, requestBytes: 81_920, responseBytes: 131_072, candidates: 32, timeoutMs: 30_000 } as const;
export const OPENAI_EXTRACTION_DESCRIPTOR: LifeExtractionJob["extractor"] = {
  name: "openai-life-event", version: "1.0.0", schemaVersion: 1, provider: "openai", model: "gpt-5.6-terra",
};

export class ExtractionHttpError extends Error {
  constructor(public readonly code: string) { super(extractionErrorMessage(code)); this.name = "ExtractionHttpError"; }
}

export function extractionErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    not_configured: "整理服务尚未配置，请稍后再试。", invalid_request: "整理内容或日期无效。",
    too_large: "这条记录超过本次整理的长度限制，原文仍完整保存在本机。",
    configuration_changed: "整理服务配置已变化，请重新开始。", rate_limited: "整理请求较多，请稍后手动重试。",
    timeout: "整理超时，原文没有变化。可以稍后重试。", cancelled: "本次整理已取消。",
    unavailable: "整理服务暂时不可用，原文没有变化。", invalid_output: "未能获得可靠的整理结果，未保存任何候选。",
    refused: "这次内容未能完成整理，原文没有变化。", offline: "无法连接整理服务，请联网后手动重试。",
    forbidden: "当前访问方式未启用整理服务。",
  };
  return messages[code] ?? messages.unavailable;
}

export function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new ExtractionHttpError("invalid_output");
  }
  return value as Record<string, unknown>;
}

export function sameDescriptor(value: unknown, expectedDescriptor = OPENAI_EXTRACTION_DESCRIPTOR): boolean {
  try {
    const descriptor = exactObject(value, Object.keys(OPENAI_EXTRACTION_DESCRIPTOR));
    return Object.entries(expectedDescriptor).every(([key, expected]) => descriptor[key] === expected);
  } catch { return false; }
}

export function isResponsesDescriptor(value: unknown): value is LifeExtractionJob["extractor"] {
  try {
    const descriptor = exactObject(value, Object.keys(OPENAI_EXTRACTION_DESCRIPTOR));
    return sameDescriptor(value, { ...OPENAI_EXTRACTION_DESCRIPTOR, provider: descriptor.provider as string }) &&
      typeof descriptor.provider === "string" && /^openai(?:-compatible:[a-z0-9.-]+)?$/.test(descriptor.provider);
  } catch { return false; }
}

export function validateExtractionText(text: unknown, context: unknown): { text: string; context: LifeExtractionRequest["context"] } {
  if (typeof text !== "string" || !text.trim()) throw new ExtractionHttpError("invalid_request");
  if (new TextEncoder().encode(text).byteLength > EXTRACTION_LIMITS.textBytes) throw new ExtractionHttpError("too_large");
  try {
    const value = exactObject(context, ["occurredOn", "timeZone"]);
    if (typeof value.occurredOn !== "string" || typeof value.timeZone !== "string") throw new Error();
    normalizeLifeEventCandidate({ category: "activity", name: "validation", occurredOn: value.occurredOn,
      timeZone: value.timeZone, timePrecision: "day", startAt: null, endAt: null, durationSeconds: null });
    return { text, context: { occurredOn: value.occurredOn, timeZone: value.timeZone } };
  } catch { throw new ExtractionHttpError("invalid_request"); }
}

const candidateKeys = ["category", "name", "occurredOn", "timeZone", "timePrecision", "startAt", "endAt", "durationSeconds"] as const;
export function validateCandidate(value: unknown): LifeEventCandidate {
  try {
    const candidate = exactObject(value, candidateKeys);
    for (const key of ["category", "name", "occurredOn", "timeZone", "timePrecision"] as const) {
      if (typeof candidate[key] !== "string") throw new Error();
    }
    if (typeof candidate.name !== "string" || candidate.name.length > 160) throw new Error();
    for (const key of ["startAt", "endAt"] as const) if (candidate[key] !== null && typeof candidate[key] !== "string") throw new Error();
    if (candidate.durationSeconds !== null && (!Number.isSafeInteger(candidate.durationSeconds) || (candidate.durationSeconds as number) < 0)) throw new Error();
    const normalized = normalizeLifeEventCandidate(candidate as unknown as LifeEventCandidate);
    // Strict output must already satisfy the contract, not rely on normalizing missing values.
    if (candidateKeys.some((key) => normalized[key] !== candidate[key])) throw new Error();
    return normalized;
  } catch { throw new ExtractionHttpError("invalid_output"); }
}

/** The model supplies exact quotes; offsets are calculated locally, never guessed by the model. */
export function proposalsFromStructuredOutput(value: unknown, text: string): LifeExtractionResult {
  const root = exactObject(value, ["candidates"]);
  if (!Array.isArray(root.candidates) || root.candidates.length > EXTRACTION_LIMITS.candidates) throw new ExtractionHttpError("invalid_output");
  const seen = new Set<string>();
  const candidates = root.candidates.map((entry) => {
    const item = exactObject(entry, ["candidate", "evidenceQuotes"]);
    const candidate = validateCandidate(item.candidate);
    if (!Array.isArray(item.evidenceQuotes) || item.evidenceQuotes.length < 1 || item.evidenceQuotes.length > 4) throw new ExtractionHttpError("invalid_output");
    const evidenceRanges = item.evidenceQuotes.map((quote: unknown) => {
      if (typeof quote !== "string" || !quote.trim()) throw new ExtractionHttpError("invalid_output");
      const start = text.indexOf(quote);
      // Repeated quotes are ambiguous. The model must supply a longer distinguishing quote.
      if (start < 0 || text.indexOf(quote, start + 1) !== -1) throw new ExtractionHttpError("invalid_output");
      return { start, end: start + quote.length };
    }).sort((a, b) => a.start - b.start);
    if (!item.evidenceQuotes.some((quote) => (quote as string).includes(candidate.name))) throw new ExtractionHttpError("invalid_output");
    const identity = JSON.stringify({ candidate, evidenceRanges });
    if (seen.has(identity)) throw new ExtractionHttpError("invalid_output");
    seen.add(identity);
    // Stable within the persisted request; contains no source ID or provider response.
    return { candidateKey: `evidence-${evidenceRanges[0].start}-${evidenceRanges[0].end}-${seen.size}`, candidate, evidenceRanges };
  });
  return { candidates };
}

export function validateExtractionResult(value: unknown, text: string): LifeExtractionResult {
  const root = exactObject(value, ["candidates"]);
  if (!Array.isArray(root.candidates) || root.candidates.length > EXTRACTION_LIMITS.candidates) throw new ExtractionHttpError("invalid_output");
  const keys = new Set<string>();
  return { candidates: root.candidates.map((entry) => {
    const item = exactObject(entry, ["candidateKey", "candidate", "evidenceRanges"]);
    if (typeof item.candidateKey !== "string" || !item.candidateKey.trim() || item.candidateKey.length > 160 || keys.has(item.candidateKey)) throw new ExtractionHttpError("invalid_output");
    keys.add(item.candidateKey);
    const candidate = validateCandidate(item.candidate);
    if (!Array.isArray(item.evidenceRanges) || item.evidenceRanges.length < 1 || item.evidenceRanges.length > 4) throw new ExtractionHttpError("invalid_output");
    const evidenceRanges = item.evidenceRanges.map((entry) => {
      const range = exactObject(entry, ["start", "end"]);
      if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || (range.start as number) < 0 ||
        (range.end as number) <= (range.start as number) || (range.end as number) > text.length) throw new ExtractionHttpError("invalid_output");
      return { start: range.start as number, end: range.end as number };
    });
    if (!evidenceRanges.some(({ start, end }) => text.slice(start, end).includes(candidate.name))) throw new ExtractionHttpError("invalid_output");
    return { candidateKey: item.candidateKey, candidate, evidenceRanges };
  }) };
}

export async function readBoundedJson(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<unknown> {
  if (!body) throw new ExtractionHttpError("invalid_output");
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0; let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new ExtractionHttpError("too_large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch (error) {
    if (error instanceof ExtractionHttpError) throw error;
    throw new ExtractionHttpError("invalid_output");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
