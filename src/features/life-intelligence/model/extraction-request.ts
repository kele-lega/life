import { assertDate, assertSource, canonicalJson } from "@/features/life-event/model/validation";
import { fingerprintLifeEventText } from "@/features/life-event/repository/source-fingerprint";

import type { LifeExtractionInput, LifeExtractionJob, LifeExtractionRequest } from "./types";

export const MAX_SCRATCH_INPUT_BYTES = 65_536;

function assertTimeZone(value: string): void {
  if (!value || /^[+-]/.test(value)) throw new Error("Extraction timezone is invalid.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    throw new Error("Extraction timezone must be a valid IANA timezone.");
  }
}

async function requestKey(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  const hex = [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:life-extraction-request-v1:${hex}`;
}

export async function prepareLifeExtractionRequest(
  request: LifeExtractionRequest,
  extractor: LifeExtractionJob["extractor"],
): Promise<{ input: LifeExtractionInput; requestKey: string }> {
  if (typeof request.text !== "string" || !request.text.trim()) {
    throw new Error("Extraction text is required.");
  }
  assertDate(request.context.occurredOn);
  assertTimeZone(request.context.timeZone);

  let input: LifeExtractionInput;
  if (request.input.kind === "scratch") {
    if (new TextEncoder().encode(request.text).byteLength > MAX_SCRATCH_INPUT_BYTES) {
      throw new Error("Scratch extraction text cannot exceed 64 KiB.");
    }
    input = {
      kind: "scratch",
      text: request.text,
      contentFingerprint: await fingerprintLifeEventText([request.text]),
    };
  } else {
    assertSource(request.input.source);
    if (!request.input.source.contentFingerprint.trim()) {
      throw new Error("Record source fingerprint is required.");
    }
    input = {
      kind: "record",
      source: { ...request.input.source },
    };
  }

  return {
    input,
    requestKey: await requestKey({ input, context: request.context, extractor }),
  };
}
