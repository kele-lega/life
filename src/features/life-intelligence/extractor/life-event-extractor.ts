import type { LifeExtractionJob, LifeExtractionRequest, LifeExtractionResult } from "../model/types";

export interface LifeEventExtractor {
  readonly name: string;
  readonly version: string;
  readonly schemaVersion: number;
  readonly provider?: string | null;
  readonly model?: string | null;

  extract(request: LifeExtractionRequest): Promise<LifeExtractionResult>;
}

/** Descriptor identity participates in the existing request key and must be complete. */
export function assertLifeEventExtractorDescriptor(descriptor: LifeExtractionJob["extractor"]): void {
  const nonEmpty = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && value === value.trim();
  if (!nonEmpty(descriptor.name) || !nonEmpty(descriptor.version) ||
    !Number.isSafeInteger(descriptor.schemaVersion) || descriptor.schemaVersion < 1) {
    throw new Error("Extraction descriptor identity is invalid.");
  }
  const local = descriptor.provider === null && descriptor.model === null;
  if (!local && (!nonEmpty(descriptor.provider) || !nonEmpty(descriptor.model))) {
    throw new Error("Extraction provider and model must be a complete pair.");
  }
}
